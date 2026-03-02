'use client';

/**
 * PendingTxsIndicator — Navbar widget showing in-flight transactions.
 *
 * Reads from localStorage (via pendingTxs lib) and re-renders whenever
 * a 'pendingTxsChanged' event fires (dispatched by addPendingTx /
 * removePendingTx). Also refreshes timestamps every 30 seconds.
 *
 * Hidden when there are no pending transactions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getPendingTxs, removePendingTx, type PendingTx } from '@/lib/pendingTxs';
import { getOpscanTxUrl } from '@/lib/opnet';

function timeAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function PendingTxsIndicator() {
  const [txs, setTxs] = useState<PendingTx[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => setTxs(getPendingTxs()), []);

  // Listen for writes from hooks + refresh timestamps every 30s
  useEffect(() => {
    reload();
    window.addEventListener('pendingTxsChanged', reload);
    const ticker = setInterval(reload, 30_000);
    return () => {
      window.removeEventListener('pendingTxsChanged', reload);
      clearInterval(ticker);
    };
  }, [reload]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (txs.length === 0) return null;

  const dismiss = (txid: string) => removePendingTx(txid);

  const label = (tx: PendingTx) => {
    if (tx.type === 'fill') return `Buying offer #${tx.offerId}`;
    if (tx.type === 'cancel') return `Cancelling offer #${tx.offerId}`;
    if (tx.type === 'approve') return 'Creating offer (approving tokens…)';
    return `Creating listing${tx.offerId ? ` #${tx.offerId}` : ''}`;
  };

  const href = (tx: PendingTx) => {
    if ((tx.type === 'fill' || tx.type === 'cancel') && tx.offerId) return `/offer/${tx.offerId}`;
    if (tx.type === 'create' && tx.offerId) return `/offer/${tx.offerId}`;
    return '/create';
  };

  const linkLabel = (tx: PendingTx) => {
    if (tx.type === 'fill' || tx.type === 'cancel') return 'Go to offer →';
    if (tx.type === 'create' && tx.offerId) return 'View offer →';
    return 'Resume creating →';
  };

  return (
    <div className="relative" ref={containerRef}>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        {txs.length} pending
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-surface-border bg-surface shadow-xl z-50 overflow-hidden">

          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Pending Transactions
            </p>
          </div>

          <ul className="divide-y divide-surface-border max-h-72 overflow-y-auto">
            {txs.map(tx => (
              <li key={tx.txid} className="px-4 py-3 space-y-2">

                {/* Title row */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">{label(tx)}</span>
                  <button
                    type="button"
                    onClick={() => dismiss(tx.txid)}
                    className="text-slate-600 hover:text-slate-300 text-xs leading-none shrink-0 transition-colors"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>

                {/* Txid + OPScan */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-500 truncate flex-1">
                    {tx.txid.slice(0, 10)}…{tx.txid.slice(-6)}
                  </span>
                  <a
                    href={getOpscanTxUrl(tx.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline shrink-0"
                  >
                    OPScan →
                  </a>
                </div>

                {/* Age + page link */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">{timeAgo(tx.timestamp)}</span>
                  <Link
                    href={href(tx)}
                    onClick={() => setOpen(false)}
                    className="text-[10px] text-brand hover:underline"
                  >
                    {linkLabel(tx)}
                  </Link>
                </div>

              </li>
            ))}
          </ul>

          <div className="px-4 py-2.5 border-t border-surface-border">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Transactions clear automatically once confirmed or after 24 hours.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
