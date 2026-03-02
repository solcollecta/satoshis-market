'use client';

import { useEffect, useState } from 'react';
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
  type NftEntry,
} from '@/lib/opnet';
import { parseUnits, parseBtcToSats, formatUnits, saveListingTimestamp, type CachedToken } from '@/lib/tokens';
import { getConnectedAddress } from '@/lib/wallet';
import { NftPicker } from '@/components/NftPicker';
import { TokenPicker } from '@/components/TokenPicker';
import { TxProgress } from '@/components/TxProgress';
import { useTxFlow } from '@/hooks/useTxFlow';

type Mode = 'op20' | 'op721';

// Platform fee is fixed at 0.5% — not user-configurable.
const PLATFORM_FEE_BPS = 50;

export default function CreateOfferPage() {
  const router = useRouter();
  const { address, connect, provider } = useWallet();
  const flow = useTxFlow();

  // ── Form state ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('op20');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenAmountHuman, setTokenAmountHuman] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [btcValue, setBtcValue] = useState('');
  const [makerRecipientKey, setMakerRecipientKey] = useState('');
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
    if (!makerRecipientKey) return 'Maker recipient key is required';
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

  // ── Auto-fill BTC recipient key from wallet ───────────────────────────────
  const handleFillKeyFromWallet = async () => {
    setError(null);
    const addr = await getConnectedAddress();
    if (!addr) { setError('Connect your wallet first.'); return; }
    const key = p2trAddressToKeyHex(addr);
    if (!key) {
      setError(
        `Could not decode a P2TR key from "${addr}". ` +
        'Enter the 32-byte tweaked pubkey hex manually.',
      );
      return;
    }
    setMakerRecipientKey(key);
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
        <div className="card">
          <p className="text-xs text-slate-400 mb-3">Offer type</p>
          <div className="flex gap-2">
            {(['op20', 'op721'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); flow.reset(); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                  mode === m
                    ? 'bg-brand border-brand text-white'
                    : 'border-surface-border text-slate-400 hover:text-white'
                }`}
              >
                {m === 'op20' ? 'OP-20 Token' : 'OP-721 NFT'}
              </button>
            ))}
          </div>
        </div>

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

          {/* Maker recipient key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="maker-key" className="mb-0">
                Payout BTC address
              </label>
              <button
                type="button"
                onClick={() => void handleFillKeyFromWallet()}
                className="text-xs text-brand hover:underline shrink-0 ml-2"
              >
                Use connected wallet
              </button>
            </div>
            <input
              id="maker-key"
              type="text"
              placeholder="0x… (64 hex chars)"
              value={makerRecipientKey}
              onChange={(e) => setMakerRecipientKey(e.target.value)}
              className="font-mono text-xs"
              required
            />
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
            onReset={flow.reset}
            onSkipApprove={flow.forceApproveConfirmed}
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
