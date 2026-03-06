'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import { fetchTokenInfo } from '@/lib/opnet';
import { parseBtcToSats, parseUnits } from '@/lib/tokens';

type Mode     = 'op20' | 'op721';
type NftScope = 'specific' | 'any';

export default function RequestCreatePage() {
  const router = useRouter();
  const { address, connect } = useWallet();

  const [mode, setMode]                   = useState<Mode>('op20');
  const [nftScope, setNftScope]           = useState<NftScope>('specific');
  const [tokenAddress, setTokenAddress]   = useState('');
  const [tokenAmountHuman, setTokenAmountHuman] = useState('');
  const [tokenId, setTokenId]             = useState('');
  const [btcValue, setBtcValue]           = useState('');
  const [tokenDecimals, setTokenDecimals] = useState(8);
  const [tokenMeta, setTokenMeta]         = useState<{ name: string; symbol: string } | null>(null);
  const [sharedFees, setSharedFees]       = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // ── Auto-fetch token metadata ─────────────────────────────────────────────
  useEffect(() => {
    if (!tokenAddress || mode !== 'op20') return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const info = await fetchTokenInfo(tokenAddress, address ?? undefined);
        if (!cancelled) {
          setTokenDecimals(info.decimals);
          setTokenMeta({ name: info.name, symbol: info.symbol });
        }
      } catch { /* ignore — metadata failure is non-blocking */ }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tokenAddress, address, mode]);

  // ── Derived values ────────────────────────────────────────────────────────
  const tokenAmountRaw = (() => {
    try { return parseUnits(tokenAmountHuman, tokenDecimals); } catch { return 0n; }
  })();
  const btcSatsRaw = (() => {
    try { return parseBtcToSats(btcValue); } catch { return 0n; }
  })();

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!address)      return 'Connect your wallet first';
    if (!tokenAddress) return 'Token / NFT contract address is required';
    if (mode === 'op20' && tokenAmountRaw === 0n) return 'Token amount is required';
    if (mode === 'op721' && nftScope === 'specific' && !tokenId.trim()) return 'Token ID is required';
    if (btcSatsRaw <= 0n) return 'BTC price is required';
    return null;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        requesterAddress: address,
        assetType:        mode,
        contractAddress:  tokenAddress,
        btcSats:          btcSatsRaw.toString(),
        tokenSymbol:      tokenMeta?.symbol ?? undefined,
        tokenName:        tokenMeta?.name   ?? undefined,
      };
      if (sharedFees) body.sharedFees = true;
      if (mode === 'op20') {
        body.tokenAmountRaw = tokenAmountRaw.toString();
        body.tokenDecimals  = tokenDecimals;
      } else if (nftScope === 'specific') {
        body.tokenId = tokenId.trim();
      }

      const res  = await fetch('/api/requests', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to post request');
      router.push(`/request/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-4 mb-3">
            <a
              href="/assets"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors"
            >
              ← Trade Assets
            </a>
            <span className="text-slate-600">|</span>
            <a
              href="/create"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors"
            >
              List Assets →
            </a>
          </div>
          <h1 className="text-2xl font-bold text-white">Request Asset</h1>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-3">
          <span className="text-amber-400 shrink-0 mt-0.5">ℹ</span>
          <p className="text-sm text-amber-300/80 leading-relaxed">
            Submit your request without a transaction. If a seller fulfills it, you&apos;ll receive a notification to buy the asset.
          </p>
        </div>

        {/* Mode selector */}
        <div className="card">
          <p className="text-xs text-slate-400 mb-3">Asset type</p>
          <div className="flex gap-2">
            {(['op20', 'op721'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setNftScope('specific'); setTokenAddress(''); setTokenMeta(null); setTokenId(''); setTokenAmountHuman(''); }}
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
          {/* Token / contract address */}
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
              }}
              required
            />
            {tokenMeta && (
              <p className="text-xs text-slate-400 mt-1">
                {tokenMeta.name} <span className="text-brand">${tokenMeta.symbol}</span>
              </p>
            )}
          </div>

          {/* Amount or Token ID */}
          {mode === 'op20' ? (
            <div>
              <label htmlFor="token-amount">
                Token amount
                {tokenMeta && (
                  <span className="text-slate-500 ml-1 font-normal text-xs">· ${tokenMeta.symbol}</span>
                )}
              </label>
              <input
                id="token-amount"
                type="text"
                inputMode="decimal"
                placeholder="1.5"
                value={tokenAmountHuman}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*\.?\d{0,8}$/.test(v) || v === '') setTokenAmountHuman(v);
                }}
                required
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Scope toggle */}
              <div>
                <label className="mb-2 block">NFT selection</label>
                <div className="flex gap-2">
                  {(['specific', 'any'] as NftScope[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setNftScope(s); setTokenId(''); }}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                        nftScope === s
                          ? 'bg-brand border-brand text-white'
                          : 'border-surface-border text-slate-400 hover:text-white'
                      }`}
                    >
                      {s === 'specific' ? 'Specific NFT' : 'Any from collection'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Token ID input — only when specific */}
              {nftScope === 'specific' && (
                <div>
                  <label htmlFor="token-id">Token ID</label>
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

              {nftScope === 'any' && (
                <p className="text-xs text-slate-500">
                  Any NFT from the collection above will satisfy this request.
                </p>
              )}
            </div>
          )}

          {/* BTC price */}
          <div>
            <label htmlFor="btc-value">BTC price you&apos;re offering</label>
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
              <p className="text-xs text-slate-500 mt-1">= {btcSatsRaw.toLocaleString()} sats</p>
            )}
          </div>

          {/* Share fees toggle */}
          <div
            className={`rounded-xl border p-4 transition-colors duration-200 ${
              sharedFees
                ? 'border-emerald-600/40 bg-emerald-900/10'
                : 'border-surface-border bg-surface/40'
            }`}
          >
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sharedFees}
                onChange={(e) => setSharedFees(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <span className="text-sm font-semibold text-slate-200">
                Split fees
              </span>
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Adjusts the listing price so both parties share the platform fee.
            </p>
          </div>

          {/* Validation error */}
          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
              {error}
            </p>
          )}

          {/* Submit */}
          {!address ? (
            <button type="button" onClick={() => connect()} className="btn-primary w-full">
              Connect Wallet
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          )}
        </form>
      </div>
    </>
  );
}
