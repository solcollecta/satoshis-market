'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  CONTRACT_ADDRESS,
  OP_NETWORK,
  simulateApprove,
  simulateNftApprove,
  simulateEscrowWrite,
  p2trAddressToKeyHex,
  normalizeToHex32,
  hexToBigint,
  fetchTokenInfo,
  fetchAllowance,
  fetchNftApproval,
  type NftEntry,
} from '@/lib/opnet';
import { parseUnits, parseBtcToSats, formatUnits, formatTokenBalance, saveListingTimestamp, type CachedToken } from '@/lib/tokens';
import { NftPicker } from '@/components/NftPicker';
import { TokenPicker } from '@/components/TokenPicker';
import { TxProgress } from '@/components/TxProgress';
import { useTxFlow } from '@/hooks/useTxFlow';
import { saveCreateDraft, loadCreateDraft, clearCreateDraft } from '@/lib/createDraft';

type Mode = 'op20' | 'op721';

// Platform fee is fixed at 0.5% — not user-configurable.
const PLATFORM_FEE_BPS = 50;

// Minimum sats for any single Bitcoin output (OPNet safety threshold).
const DUST_THRESHOLD = 546n;

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
  const [allowedTaker, setAllowedTaker] = useState('');

  /** Derived from connected wallet — no user input, no RPC needed */
  const makerRecipientKey = address ? (p2trAddressToKeyHex(address) ?? '') : '';

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

  // Live dust validation — null means OK, string means blocked
  const feeDustError = (() => {
    if (btcSatsRaw === 0n) return null;
    if (btcSatsRaw < DUST_THRESHOLD) return `Price below dust threshold (min ${DUST_THRESHOLD} sats).`;
    const feeSats = btcSatsRaw * BigInt(PLATFORM_FEE_BPS) / 10_000n;
    if (PLATFORM_FEE_BPS > 0 && feeSats < DUST_THRESHOLD) {
      return `Platform fee (${feeSats} sats) below dust threshold. Increase price to at least ${DUST_THRESHOLD * 10_000n / BigInt(PLATFORM_FEE_BPS)} sats.`;
    }
    return null;
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

  // ── Auto-fetch metadata + balance when address typed manually ────────────
  useEffect(() => {
    if (!tokenAddress || mode !== 'op20') return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const info = await fetchTokenInfo(tokenAddress, address ?? undefined);
        if (!cancelled) {
          setTokenDecimals(info.decimals);
          setTokenMeta({ name: info.name, symbol: info.symbol });
          if (info.balance > 0n) setTokenBalance(info.balance);
        }
      } catch { /* keep defaults — metadata failure must never block create flow */ }
    }, 800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tokenAddress, address, mode]);

  // ── OP-20 allowance pre-check ─────────────────────────────────────────────
  // Debounced (600 ms) to avoid RPC spam on every keystroke of the amount field.
  // Resets to idle from approve_confirmed in BOTH cases:
  //   - no-txid sufficient-skip (approveTxid === null)
  //   - real approve tx confirmed (approveTxid !== null) but user increased amount above allowance
  const flowStateRef = useRef(flow.state);
  flowStateRef.current = flow.state;

  useEffect(() => {
    if (mode !== 'op20' || !tokenAddress || !address || tokenAmountRaw === 0n) return;
    if (tokenAddress.length < 10) return; // ignore obviously partial/invalid addresses

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const allowance = await fetchAllowance(tokenAddress, address, CONTRACT_ADDRESS);
        if (cancelled) return;
        const sufficient = allowance >= tokenAmountRaw;
        console.log('[create] allowance pre-check', {
          token: tokenAddress,
          owner: address,
          spender: CONTRACT_ADDRESS,
          allowance: allowance.toString(),
          required: tokenAmountRaw.toString(),
          sufficient,
        });
        const { phase } = flowStateRef.current;
        if (sufficient && ['idle', 'approve_failed'].includes(phase)) {
          flow.setApproveSufficient();
        } else if (!sufficient && phase === 'approve_confirmed') {
          // Amount now exceeds allowance — regardless of whether approve was skipped
          // or a real tx confirmed. User must re-approve for the new amount.
          flow.reset();
        }
      } catch { /* pre-check failure is non-blocking — user can still approve manually */ }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tokenAddress, tokenAmountRaw, address, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Warn before unload when a tx has been broadcast ───────────────────────
  // A broadcast tx can still confirm even after the tab closes, but the user
  // won't see the result and will lose their draft state. Show the browser's
  // native "Leave site?" dialog so they don't close accidentally.
  useEffect(() => {
    const hasBroadcastTx =
      flow.state.approveTxid !== null || flow.state.createTxid !== null;
    const isDone = flow.state.phase === 'create_confirmed';
    if (!hasBroadcastTx || isDone) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flow.state.approveTxid, flow.state.createTxid, flow.state.phase]);

  // ── Auto-redirect when offer confirmed (also save timestamp) ─────────────
  useEffect(() => {
    if (flow.state.phase === 'create_confirmed' && flow.state.offerId != null) {
      saveListingTimestamp(flow.state.offerId);
      const t = setTimeout(
        () => router.push(`/listing/${flow.state.offerId!.toString()}`),
        2000,
      );
      return () => clearTimeout(t);
    }
  }, [flow.state.phase, flow.state.offerId, router]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!CONTRACT_ADDRESS) return 'Contract address not configured — check NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local';
    if (!tokenAddress) return 'Token address is required';
    if (mode === 'op20' && tokenAmountRaw === 0n) return 'Token amount is required';
    if (mode === 'op721' && !tokenId) return 'Token ID is required';
    if (btcSatsRaw === 0n) return 'BTC price is required';
    if (btcSatsRaw < DUST_THRESHOLD) return `Output below dust threshold (${DUST_THRESHOLD} sats minimum). Increase price.`;
    const feeSats = btcSatsRaw * BigInt(PLATFORM_FEE_BPS) / 10_000n;
    if (PLATFORM_FEE_BPS > 0 && feeSats < DUST_THRESHOLD) {
      return `Output below dust threshold (${DUST_THRESHOLD} sats minimum). Increase price.`;
    }
    if (!makerRecipientKey) return 'Wallet not connected — connect your wallet to continue';
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

  // ── NFT picker ────────────────────────────────────────────────────────────
  const handleNftPickerOpen = () => {
    if (!address) { connect(); return; }
    setError(null);
    setNftPickerOpen(true);
  };

  const handleNftSelect = (entry: NftEntry) => {
    setTokenId(entry.tokenId.toString());
    setTokenAddress(entry.contractAddress);
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

    // Guard: re-check allowance synchronously before sending approve tx.
    // If already sufficient, skip the tx entirely — no unnecessary approvals.
    if (mode === 'op20') {
      try {
        const currentAllowance = await fetchAllowance(tokenAddress, address, CONTRACT_ADDRESS);
        console.log('[create] handleApprove pre-send check', {
          allowance: currentAllowance.toString(),
          required: tokenAmountRaw.toString(),
          sufficient: currentAllowance >= tokenAmountRaw,
        });
        if (currentAllowance >= tokenAmountRaw) {
          flow.setApproveSufficient();
          return;
        }
      } catch { /* check failed — proceed with approve tx */ }
    }

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

      // Confirm only when the on-chain approval state is actually true.
      // OP-20: allowance >= required amount.
      // OP-721: getApproved(tokenId) === escrow OR isApprovedForAll(owner, escrow).
      // Neither advances to green until the real on-chain check passes.
      console.log('[create] building confirmFn', {
        mode,
        tokenAddress,
        operator: CONTRACT_ADDRESS,
        tokenId: mode === 'op721' ? tokenId : undefined,
        required: mode === 'op20' ? tokenAmountRaw.toString() : undefined,
      });
      const confirmFn = mode === 'op20'
        ? async () => {
            const allowance = await fetchAllowance(tokenAddress, address, CONTRACT_ADDRESS);
            const ok = allowance >= tokenAmountRaw;
            console.log('[create] confirmFn result', {
              ok,
              allowance: allowance.toString(),
              required: tokenAmountRaw.toString(),
            });
            return ok;
          }
        : async () => {
            try {
              return await fetchNftApproval(tokenAddress, BigInt(tokenId), CONTRACT_ADDRESS, address);
            } catch (err) {
              console.warn('[create] NFT confirmFn caught unexpected error — returning false', err);
              return false;
            }
          };

      flow.setApprovePending(tx.transactionId, confirmFn);
      saveCreateDraft({
        mode, tokenAddress, tokenAmountHuman, tokenId, btcValue,
        makerRecipientKey, allowedTaker, tokenDecimals,
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
        makerRecipientKey, allowedTaker, tokenDecimals,
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
      {nftPickerOpen && address && (
        <NftPicker
          walletAddress={address}
          initialContract={tokenAddress}
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
          <a
            href="/assets"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors mb-3"
          >
            ← All Assets
          </a>
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
                setTokenAmountHuman('');
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
                    · ${tokenMeta.symbol}
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
                  Saved tokens
                </button>
              </div>
              {/* Balance + percentage shortcuts — shown once balance is known */}
              {tokenBalance !== null && (
                <>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Balance:{' '}
                    <span className="text-slate-200">
                      {formatTokenBalance(tokenBalance, tokenDecimals)}
                      {tokenMeta ? ` ${tokenMeta.symbol}` : ''}
                    </span>
                  </p>
                  <div className="flex gap-1.5 mt-1.5">
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
                </>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="token-id">NFT Token ID</label>
              <div className="flex items-center gap-2">
                <input
                  id="token-id"
                  type="text"
                  inputMode="numeric"
                  placeholder="42"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  className="flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={handleNftPickerOpen}
                  className="btn-secondary text-xs shrink-0 px-3 py-2"
                >
                  Select NFT
                </button>
              </div>
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

          {/* Platform fee — fixed, not user-configurable */}
          <div>
            <div className={`flex items-center justify-between rounded-lg bg-surface px-4 py-3 border ${feeDustError ? 'border-red-700' : 'border-surface-border'}`}>
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
            {feeDustError && (
              <p className="text-xs text-red-400 mt-1.5 px-1">{feeDustError}</p>
            )}
          </div>

          {/* Private buyer */}
          <div>
            <label htmlFor="allowed-taker">
              Private buyer (optional)
            </label>
            <input
              id="allowed-taker"
              placeholder="opt1p… / tb1p… / 0x… — leave blank for public offer"
              value={allowedTaker}
              onChange={(e) => setAllowedTaker(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Only this address can fill the offer. Leave blank to allow anyone.
            </p>
          </div>

          {/* Validation error (pre-tx) */}
          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
              {error}
            </p>
          )}

          {/* Don't-close warning — shown once a tx has been broadcast */}
          {(flow.state.approveTxid !== null || flow.state.createTxid !== null) &&
           flow.state.phase !== 'create_confirmed' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2.5">
              <p className="text-xs text-amber-400/80 leading-relaxed">
                Keep this tab open — closing it will require you to recreate the listing.
              </p>
            </div>
          )}

          {/* Transaction progress */}
          <TxProgress
            state={flow.state}
            mode={mode}
            onApprove={handleApprove}
            onCreate={handleCreate}
            onReset={() => { clearCreateDraft(); flow.reset(); }}
            onCheckApproveStatus={() => void flow.checkApproveStatus()}
            onCheckCreateStatus={() => void flow.checkCreateStatus()}
            onRetryCreate={flow.retryCreate}
            disabled={!!feeDustError}
          />

        </form>
      </div>
    </>
  );
}
