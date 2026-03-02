'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  CONTRACT_ADDRESS,
  OP_NETWORK,
  OP_NETWORK_NAME,
  simulateApprove,
  simulateNftApprove,
  simulateEscrowWrite,
  p2trAddressToKeyHex,
  normalizeToHex32,
  hexToBigint,
  fetchTokenInfo,
  fetchAllowance,
  resolveTweakedPubkey,
  type NftEntry,
} from '@/lib/opnet';
import { parseUnits, parseBtcToSats, formatUnits, saveListingTimestamp, type CachedToken } from '@/lib/tokens';
import { NftPicker } from '@/components/NftPicker';
import { TokenPicker } from '@/components/TokenPicker';
import { TxProgress } from '@/components/TxProgress';
import { useTxFlow } from '@/hooks/useTxFlow';
import { saveCreateDraft, loadCreateDraft, clearCreateDraft } from '@/lib/createDraft';

type Mode = 'op20' | 'op721';

// Platform fee is fixed at 0.5% — not user-configurable.
const PLATFORM_FEE_BPS = 50;

export default function CreateOfferPage() {
  const router = useRouter();
  const { address, connect, provider } = useWallet();
  const flow = useTxFlow();
  const resumedRef = useRef(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('op20');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenAmountHuman, setTokenAmountHuman] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [btcValue, setBtcValue] = useState('');
  /** Human-readable P2TR address shown in the input (opt1p… / bc1p… / tb1p…) */
  const [payoutAddress, setPayoutAddress] = useState('');
  /** Resolved tweaked pubkey (0x hex) — derived from payoutAddress, never shown to user */
  const [makerRecipientKey, setMakerRecipientKey] = useState('');
  const [payoutResolving, setPayoutResolving] = useState(false);
  const [payoutResolved, setPayoutResolved] = useState(false);
  const [payoutResolveError, setPayoutResolveError] = useState<string | null>(null);
  const [allowedTaker, setAllowedTaker] = useState('');

  // ── Token metadata ────────────────────────────────────────────────────────
  const [tokenDecimals, setTokenDecimals] = useState(8);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [tokenMeta, setTokenMeta] = useState<{ name: string; symbol: string } | null>(null);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);

  const [nftPickerOpen, setNftPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived values (computed each render, no state) ───────────────────────
  const tokenAmountRaw = (() => {
    try { return parseUnits(tokenAmountHuman, tokenDecimals); } catch { return 0n; }
  })();
  const btcSatsRaw = (() => {
    try { return parseBtcToSats(btcValue); } catch { return 0n; }
  })();

  // ── NFT contract address persistence ─────────────────────────────────────
  const NFT_CONTRACT_KEY = 'nft_contract_v1';

  // Restore saved NFT contract when switching to NFT mode
  useEffect(() => {
    if (mode !== 'op721' || tokenAddress) return;
    try {
      const saved = localStorage.getItem(NFT_CONTRACT_KEY);
      if (saved) setTokenAddress(saved);
    } catch { /* ignore */ }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist NFT contract address when it changes
  useEffect(() => {
    if (mode !== 'op721' || !tokenAddress) return;
    try { localStorage.setItem(NFT_CONTRACT_KEY, tokenAddress); } catch { /* ignore */ }
  }, [tokenAddress, mode]);

  // ── Auto-fetch decimals when address typed manually ───────────────────────
  useEffect(() => {
    if (!tokenAddress || mode !== 'op20') return;
    const t = setTimeout(async () => {
      try {
        const info = await fetchTokenInfo(tokenAddress);
        setTokenDecimals(info.decimals);
        setTokenMeta({ name: info.name, symbol: info.symbol });
      } catch { /* keep defaults */ }
    }, 800);
    return () => clearTimeout(t);
  }, [tokenAddress, mode]);

  // ── Resolve payout address → tweaked pubkey ──────────────────────────────
  // Connected wallet: skip RPC — key is embedded in the bech32m address (signer path).
  // External address: call getPublicKeysInfoRaw with a 600ms debounce.
  useEffect(() => {
    const addr = payoutAddress.trim();

    if (!addr) {
      setMakerRecipientKey('');
      setPayoutResolved(false);
      setPayoutResolveError(null);
      return;
    }

    // Format check: must be a P2TR bech32m (witness v1). bc1q/tb1q are P2WPKH (v0).
    const quickKey = p2trAddressToKeyHex(addr);
    if (quickKey === null) {
      setMakerRecipientKey('');
      setPayoutResolved(false);
      setPayoutResolveError('Must be a P2TR address: opt1p…, bc1p…, or tb1p…');
      return;
    }

    setPayoutResolveError(null);

    // Connected wallet — use the key encoded in the address directly (no RPC needed)
    if (address && addr === address.trim()) {
      setMakerRecipientKey(quickKey);
      setPayoutResolved(true);
      return;
    }

    // External address — resolve via RPC with debounce
    setPayoutResolving(true);
    setPayoutResolved(false);
    const t = setTimeout(async () => {
      try {
        const key = await resolveTweakedPubkey(addr);
        setMakerRecipientKey(key ?? quickKey); // fall back to manual decode if RPC has no record
        setPayoutResolved(true);
      } catch {
        setMakerRecipientKey(quickKey);
        setPayoutResolved(true);
      } finally {
        setPayoutResolving(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [payoutAddress, address]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resume draft on mount (once) ─────────────────────────────────────────
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const draft = loadCreateDraft();
    if (!draft) return;
    // Restore form state
    setMode(draft.mode);
    setTokenAddress(draft.tokenAddress);
    setTokenAmountHuman(draft.tokenAmountHuman);
    setTokenId(draft.tokenId);
    setBtcValue(draft.btcValue);
    // Restore payout address for display; set the resolved key directly to skip RPC
    setPayoutAddress(draft.payoutAddress ?? draft.makerRecipientKey);
    setMakerRecipientKey(draft.makerRecipientKey);
    setPayoutResolved(!!draft.makerRecipientKey);
    setAllowedTaker(draft.allowedTaker);
    setTokenDecimals(draft.tokenDecimals);
    // Resume flow — no confirmFn on resume (receipt-only is fine; tx likely already confirmed)
    if (draft.phase === 'approve_pending') {
      flow.setApprovePending(draft.approveTxid);
    } else if (draft.phase === 'create_pending' && draft.createTxid && draft.predictedOfferId) {
      flow.setCreatePending(draft.createTxid, BigInt(draft.predictedOfferId));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear draft when offer is confirmed ───────────────────────────────────
  useEffect(() => {
    if (flow.state.phase === 'create_confirmed') clearCreateDraft();
  }, [flow.state.phase]);

  // ── Auto-redirect when offer confirmed (also save timestamp) ─────────────
  useEffect(() => {
    if (flow.state.phase === 'create_confirmed' && flow.state.offerId != null) {
      saveListingTimestamp(flow.state.offerId);
      const t = setTimeout(
        () => router.push(`/offer/${flow.state.offerId!.toString()}`),
        2000,
      );
      return () => clearTimeout(t);
    }
  }, [flow.state.phase, flow.state.offerId, router]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!tokenAddress) return 'Token address is required';
    if (mode === 'op20' && tokenAmountRaw === 0n) return 'Token amount is required';
    if (mode === 'op721' && !tokenId) return 'Token ID is required';
    if (btcSatsRaw === 0n) return 'BTC price is required';
    if (!payoutAddress) return 'Payout BTC address is required';
    if (!makerRecipientKey || payoutResolving) return 'Payout address is still resolving — please wait a moment';
    if (payoutResolveError) return payoutResolveError;
    if (allowedTaker) {
      try {
        normalizeToHex32(allowedTaker);
      } catch {
        return 'Allowed taker must be a valid P2TR address (opt1p… / tb1p…) or 0x hex key';
      }
    }
    return null;
  };

  const getCallArgs = (): unknown[] => {
    const taker = allowedTaker ? hexToBigint(normalizeToHex32(allowedTaker)) : 0n;
    if (mode === 'op20') {
      return [
        tokenAddress,
        tokenAmountRaw,
        btcSatsRaw,
        hexToBigint(makerRecipientKey),
        PLATFORM_FEE_BPS,
        taker,
      ];
    }
    return [
      tokenAddress,
      BigInt(tokenId),
      btcSatsRaw,
      hexToBigint(makerRecipientKey),
      PLATFORM_FEE_BPS,
      taker,
    ];
  };

  // ── Fill payout address from connected wallet (skips RPC — signer path) ──
  const handleUseConnectedWallet = () => {
    if (!address) { void connect(); return; }
    setPayoutAddress(address); // resolve effect detects this === connected wallet → no RPC
  };

  // ── NFT picker ────────────────────────────────────────────────────────────
  const handleNftPickerOpen = () => {
    if (!address) { connect(); return; }
    if (!tokenAddress) { setError('Enter the NFT contract address first.'); return; }
    setError(null);
    setNftPickerOpen(true);
  };

  const handleNftSelect = (entry: NftEntry) => {
    setTokenId(entry.tokenId.toString());
    if (!tokenAddress) setTokenAddress(entry.contractAddress);
    setNftPickerOpen(false);
  };

  // ── Token picker ──────────────────────────────────────────────────────────
  const handleTokenSelect = (token: CachedToken, balance: bigint) => {
    setTokenAddress(token.address);
    setTokenDecimals(token.decimals);
    setTokenMeta({ name: token.name, symbol: token.symbol });
    setTokenBalance(balance > 0n ? balance : null);
    setTokenAmountHuman('');
    setTokenPickerOpen(false);
  };

  // ── Step 1: Approve ───────────────────────────────────────────────────────
  const handleApprove = async () => {
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }
    if (!address) { await connect(); return; }

    flow.setApproveSimulating();
    try {
      const simulation = mode === 'op20'
        ? await simulateApprove(tokenAddress, CONTRACT_ADDRESS, tokenAmountRaw, address)
        : await simulateNftApprove(tokenAddress, CONTRACT_ADDRESS, BigInt(tokenId), address);

      const tx = await simulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: address,
        maximumAllowedSatToSpend: 100_000n,
        network: OP_NETWORK,
      });

      // For OP-20: confirm only when allowance is provably on-chain.
      // This prevents premature green state caused by OPNet returning a receipt
      // before the allowance storage is actually settled.
      const confirmFn = mode === 'op20'
        ? async () => {
            const allowed = await fetchAllowance(tokenAddress, address, CONTRACT_ADDRESS);
            return allowed >= tokenAmountRaw;
          }
        : undefined; // OP-721: receipt-only fallback with auto-advance

      flow.setApprovePending(tx.transactionId, confirmFn);
      saveCreateDraft({
        mode, tokenAddress, tokenAmountHuman, tokenId, btcValue,
        payoutAddress, makerRecipientKey, allowedTaker, tokenDecimals,
        phase: 'approve_pending',
        approveTxid: tx.transactionId,
        createTxid: null,
        predictedOfferId: null,
      });
    } catch (e) {
      flow.setApproveFailed(e instanceof Error ? e.message : 'Approval failed');
    }
  };

  // ── Step 2: Create offer ──────────────────────────────────────────────────
  const handleCreate = async () => {
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }
    if (!address) { await connect(); return; }

    flow.setCreateSimulating();
    try {
      const fnName = mode === 'op20' ? 'createOffer' : 'createNFTOffer';
      const simulation = await simulateEscrowWrite(fnName, getCallArgs(), address);

      if (simulation.revert) {
        flow.setCreateFailed(
          (simulation.revert as { message?: string }).message ?? 'Simulation reverted',
        );
        return;
      }

      // offerId is decoded from the simulation's output (ABI: UINT256)
      const predictedOfferId = simulation.properties?.offerId != null
        ? BigInt(String(simulation.properties.offerId))
        : 0n;

      if (predictedOfferId === 0n) {
        flow.setCreateFailed('Simulation returned no offer ID — check your inputs and try again.');
        return;
      }

      const tx = await simulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: address,
        maximumAllowedSatToSpend: 100_000n,
        network: OP_NETWORK,
      });
      flow.setCreatePending(tx.transactionId, predictedOfferId);
      saveCreateDraft({
        mode, tokenAddress, tokenAmountHuman, tokenId, btcValue,
        payoutAddress, makerRecipientKey, allowedTaker, tokenDecimals,
        phase: 'create_pending',
        approveTxid: flow.state.approveTxid ?? '',
        createTxid: tx.transactionId,
        predictedOfferId: predictedOfferId.toString(),
      });
    } catch (e) {
      flow.setCreateFailed(e instanceof Error ? e.message : 'Transaction failed');
    }
  };

  return (
    <>
      {/* NFT picker modal */}
      {nftPickerOpen && address && tokenAddress && (
        <NftPicker
          contractAddress={tokenAddress}
          walletAddress={address}
          onSelect={handleNftSelect}
          onClose={() => setNftPickerOpen(false)}
        />
      )}

      {/* Token picker modal */}
      {tokenPickerOpen && (
        <TokenPicker
          walletAddress={address ?? ''}
          onSelect={handleTokenSelect}
          onClose={() => setTokenPickerOpen(false)}
        />
      )}

      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Create Listing</h1>
          <p className="text-sm text-slate-400 mt-1">
            Escrow OP-20 tokens or an OP-721 NFT in exchange for BTC.
          </p>
        </div>

        {/* Mode selector */}
        {(() => {
          const isModeChangeable = ['idle', 'approve_failed', 'create_failed'].includes(flow.state.phase);
          return (
            <div className="card">
              <p className="text-xs text-slate-400 mb-3">Offer type</p>
              <div className="flex gap-2">
                {(['op20', 'op721'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { if (!isModeChangeable) return; setMode(m); flow.reset(); }}
                    disabled={!isModeChangeable}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                      mode === m
                        ? 'bg-brand border-brand text-white'
                        : 'border-surface-border text-slate-400 hover:text-white'
                    }${!isModeChangeable ? ' opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {m === 'op20' ? 'OP-20 Token' : 'OP-721 NFT'}
                  </button>
                ))}
              </div>
              {!isModeChangeable && (
                <p className="text-xs text-amber-500/80 mt-2">
                  Mode locked while a transaction is in progress. Reset the flow to switch.
                </p>
              )}
            </div>
          );
        })()}

        <form onSubmit={(e) => e.preventDefault()} className="card space-y-5">
          {/* Token address */}
          <div>
            <label htmlFor="token-addr">
              {mode === 'op20' ? 'OP-20 Token' : 'OP-721 NFT Contract'} address
            </label>
            <input
              id="token-addr"
              placeholder="opt1sq…"
              value={tokenAddress}
              onChange={(e) => {
                setTokenAddress(e.target.value);
                setTokenMeta(null);
                setTokenBalance(null);
              }}
              required
            />
          </div>

          {/* Token amount or ID */}
          {mode === 'op20' ? (
            <div>
              <label htmlFor="token-amount">
                Token amount
                {tokenMeta && (
                  <span className="text-slate-500 ml-1 font-normal text-xs">
                    · {tokenMeta.symbol} ({tokenDecimals} dec.)
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="token-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="1.5"
                  value={tokenAmountHuman}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d*\.?\d{0,4}$/.test(v) || v === '') setTokenAmountHuman(v);
                  }}
                  className="flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={() => setTokenPickerOpen(true)}
                  className="btn-secondary text-xs shrink-0 px-3 py-2"
                >
                  Select from wallet
                </button>
              </div>
              {tokenAmountRaw > 0n && (
                <p className="text-xs text-slate-500 mt-1">
                  = {tokenAmountRaw.toLocaleString()} raw
                </p>
              )}
              {/* Percentage shortcuts — only when balance is known */}
              {tokenBalance !== null && (
                <div className="flex gap-1.5 mt-2">
                  {([25n, 50n, 75n, 100n] as bigint[]).map((pct) => (
                    <button
                      key={pct.toString()}
                      type="button"
                      onClick={() => {
                        const full = formatUnits(tokenBalance! * pct / 100n, tokenDecimals);
                        const [int, frac = ''] = full.split('.');
                        setTokenAmountHuman(frac ? `${int}.${frac.slice(0, 4)}` : int);
                      }}
                      className="flex-1 text-xs py-1 rounded border border-surface-border text-slate-400 hover:text-white hover:border-brand transition-colors"
                    >
                      {pct === 100n ? 'Max' : `${pct}%`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="token-id" className="mb-0">NFT Token ID</label>
                <button
                  type="button"
                  onClick={handleNftPickerOpen}
                  className="text-xs text-brand hover:underline shrink-0 ml-2"
                >
                  Browse my NFTs
                </button>
              </div>
              <input
                id="token-id"
                type="text"
                inputMode="numeric"
                placeholder="42"
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                required
              />
            </div>
          )}

          {/* BTC price */}
          <div>
            <label htmlFor="btc-value">BTC price</label>
            <div className="relative">
              <input
                id="btc-value"
                type="text"
                inputMode="decimal"
                placeholder="0.001"
                value={btcValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*\.?\d*$/.test(v) || v === '') setBtcValue(v);
                }}
                className="pr-12"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">
                BTC
              </span>
            </div>
            {btcSatsRaw > 0n && (
              <p className="text-xs text-slate-500 mt-1">
                = {btcSatsRaw.toLocaleString()} sats
              </p>
            )}
          </div>

          {/* Payout BTC address */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="payout-addr" className="mb-0">
                Payout BTC address
              </label>
              {address && (
                <button
                  type="button"
                  onClick={handleUseConnectedWallet}
                  className="text-xs text-brand hover:underline shrink-0 ml-2"
                >
                  Use connected wallet
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="payout-addr"
                type="text"
                placeholder="opt1p… / bc1p… / tb1p…"
                value={payoutAddress}
                onChange={(e) => setPayoutAddress(e.target.value)}
                className={`pr-8 ${payoutResolveError ? 'border-red-700/70' : payoutResolved ? 'border-emerald-700/50' : ''}`}
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {payoutResolving && (
                  <span className="text-slate-500 text-xs animate-pulse">…</span>
                )}
                {!payoutResolving && payoutResolved && (
                  <span className="text-emerald-400 text-xs">✓</span>
                )}
              </span>
            </div>
            {payoutResolveError && (
              <p className="text-xs text-red-400 mt-1">{payoutResolveError}</p>
            )}
            <p className="text-xs text-slate-600 mt-1">
              Where you receive BTC when the offer is filled.
            </p>
          </div>

          {/* Platform fee — fixed, not user-configurable */}
          <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-3 border border-surface-border">
            <span className="text-sm text-slate-400">Platform fee</span>
            <span className="text-sm font-semibold text-white">
              0.5%
              {btcSatsRaw > 0n && (
                <span className="text-xs text-slate-500 font-normal ml-2">
                  = {Math.ceil(Number(btcSatsRaw) * PLATFORM_FEE_BPS / 10_000).toLocaleString()} sats
                </span>
              )}
            </span>
          </div>

          {/* OTC restriction */}
          <div>
            <label htmlFor="allowed-taker">
              Allowed taker (optional — blank = public offer)
            </label>
            <input
              id="allowed-taker"
              placeholder="opt1p… / tb1p… / 0x… (leave blank for public)"
              value={allowedTaker}
              onChange={(e) => setAllowedTaker(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Enter a P2TR address or 0x hex key to restrict to one specific taker.
            </p>
          </div>

          {/* Validation error (pre-tx) */}
          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
              {error}
            </p>
          )}

          {/* Transaction progress */}
          <TxProgress
            state={flow.state}
            mode={mode}
            onApprove={handleApprove}
            onCreate={handleCreate}
            onReset={() => { clearCreateDraft(); flow.reset(); }}
            onSkipApprove={flow.forceApproveConfirmed}
            onCheckApproveStatus={() => void flow.checkApproveStatus()}
            onCheckCreateStatus={() => void flow.checkCreateStatus()}
          />

          {/* Debug info */}
          <details className="border border-surface-border rounded-lg text-xs">
            <summary className="cursor-pointer p-3 text-slate-500 hover:text-slate-300 select-none">
              Debug info
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-1 font-mono text-slate-400">
              <p>provider: <span className="text-slate-300">{provider}</span></p>
              <p>network: <span className="text-slate-300">{OP_NETWORK_NAME}</span></p>
              <p>contract: <span className="text-slate-300 break-all">{CONTRACT_ADDRESS || '(not set)'}</span></p>
              <p>mode: <span className="text-slate-300">{mode}</span></p>
              <p>wallet: <span className="text-slate-300 break-all">{address || '(not connected)'}</span></p>
              <p>tx phase: <span className="text-slate-300">{flow.state.phase}</span></p>
              <p>token decimals: <span className="text-slate-300">{tokenDecimals}</span></p>
              <p>tokenAmountRaw: <span className="text-slate-300">{tokenAmountRaw.toString()}</span></p>
              <p>btcSatsRaw: <span className="text-slate-300">{btcSatsRaw.toString()}</span></p>
            </div>
          </details>
        </form>
      </div>
    </>
  );
}
