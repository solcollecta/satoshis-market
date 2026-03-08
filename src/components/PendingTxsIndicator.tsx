'use client';

/**
 * PendingTxsIndicator — Navbar widget showing in-flight transactions.
 *
 * Reads from localStorage (via pendingTxs lib) and re-renders whenever
 * a 'pendingTxsChanged' event fires (dispatched by addPendingTx /
 * removePendingTx). Also refreshes timestamps every 30 seconds.
 *
 * Auto-cleanup for stale 'create' entries:
 *   useTxFlow removes create entries when it confirms them, but only while the
 *   /create page is open. If the user navigated away, the entry stays in
 *   localStorage. On mount + every 30 s, we check getOffer(offerId) for each
 *   create entry — if the offer exists the tx is confirmed and we remove it.
 *   This fires 'pendingTxsChanged', which triggers a re-render automatically.
 *
 * Link routing:
 *   - create / approve → /create  (offer doesn't exist yet while pending)
 *   - fill / cancel    → /listing/:id
 *
 * Hidden when there are no pending transactions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getPendingTxs, removePendingTx, type PendingTx } from '@/lib/pendingTxs';
import { getOpscanTxUrl, getOffer } from '@/lib/opnet';

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
  const checkingRef = useRef(false); // guard against concurrent cleanup runs

  const reload = useCallback(() => setTxs(getPendingTxs()), []);

  /**
   * For each 'create' entry that has a predictedOfferId, check if the offer
   * now exists on-chain. If it does, the tx confirmed while we weren't watching
   * (e.g. user navigated away) — remove the stale entry so it disappears cleanly.
   */
  const checkConfirmedCreates = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const pending = getPendingTxs();
      const creates = pending.filter(tx => tx.type === 'create' && tx.offerId);
      await Promise.all(
        creates.map(async tx => {
          try {
            const offer = await getOffer(BigInt(tx.offerId!));
            if (offer !== null) removePendingTx(tx.txid); // fires 'pendingTxsChanged'
          } catch { /* network error — leave entry, try again next tick */ }
        }),
      );
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // Listen for writes from hooks + refresh every 30 s + cleanup stale creates
  useEffect(() => {
    reload();
    void checkConfirmedCreates();
    window.addEventListener('pendingTxsChanged', reload);
    const ticker = setInterval(() => {
      reload();
      void checkConfirmedCreates();
    }, 30_000);
    return () => {
      window.removeEventListener('pendingTxsChanged', reload);
      clearInterval(ticker);
    };
  }, [reload, checkConfirmedCreates]);

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
    if (tx.type === 'fill')   return `Buying listing #${tx.offerId}`;
    if (tx.type === 'cancel') return `Cancelling listing #${tx.offerId}`;
    if (tx.type === 'approve') return 'Creating listing (approving tokens…)';
    return `Creating listing${tx.offerId ? ` #${tx.offerId}` : ''}`;
  };

  // Only fill / cancel have a meaningful internal page link.
  // create / approve have no unique URL while pending — only OPScan is useful.
  const pageLink = (tx: PendingTx): { href: string; label: string } | null => {
    if (tx.type === 'fill' && tx.offerId)   return { href: `/listing/${tx.offerId}`, label: 'Go to listing →' };
    if (tx.type === 'cancel' && tx.offerId) return { href: `/listing/${tx.offerId}`, label: 'Go to listing →' };
    return null;
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

                {/* Age + optional page link (only for fill / cancel) */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">{timeAgo(tx.timestamp)}</span>
                  {pageLink(tx) && (
                    <Link
                      href={pageLink(tx)!.href}
                      onClick={() => setOpen(false)}
                      className="text-[10px] text-brand hover:underline"
                    >
                      {pageLink(tx)!.label}
                    </Link>
                  )}
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
