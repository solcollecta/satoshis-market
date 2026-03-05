'use client';

/**
 * SalesIndicator — Navbar widget showing confirmed sales for the connected seller.
 *
 * Pattern mirrors PrivateListingsIndicator:
 *  - Fetches /api/sales?seller=<wallet> (cached 60s)
 *  - Seen/unseen tracked per wallet in localStorage
 *  - Badge + dropdown with up to 5 latest sales
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/context/WalletContext';
import { getOpscanTxUrl } from '@/lib/opnet';
import type { SaleRecord } from '@/lib/sales';
import { getSeenSaleIds, markSaleIdsSeen, onSalesUpdated } from '@/lib/sales';

// ── Module-level cache ───────────────────────────────────────────────────────

let _cachedSales: SaleRecord[] = [];
let _cachedSeller = '';
let _cacheTs = 0;
const CACHE_TTL = 60_000;

async function fetchSalesCached(seller: string): Promise<SaleRecord[]> {
  if (seller === _cachedSeller && Date.now() - _cacheTs < CACHE_TTL && _cachedSales.length >= 0) {
    return _cachedSales;
  }
  try {
    const res = await fetch(`/api/sales?seller=${encodeURIComponent(seller)}`);
    if (!res.ok) return [];
    const data = await res.json();
    _cachedSales = Array.isArray(data) ? data : [];
  } catch {
    _cachedSales = [];
  }
  _cachedSeller = seller;
  _cacheTs = Date.now();
  return _cachedSales;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SalesIndicator() {
  const { address } = useWallet();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback((addr: string | undefined, data?: SaleRecord[]) => {
    if (!addr) { setSales([]); return; }
    const records = data ?? _cachedSales;
    setSales(records);
    setSeenIds(getSeenSaleIds(addr));
  }, []);

  // Fetch on mount + listen for external updates
  useEffect(() => {
    let cancelled = false;
    if (address) {
      fetchSalesCached(address)
        .then(data => { if (!cancelled) refresh(address, data); });
    }

    const unsub = onSalesUpdated(data => {
      _cachedSales = data;
      _cacheTs = Date.now();
      if (!cancelled) refresh(address ?? undefined, data);
    });

    return () => { cancelled = true; unsub(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when wallet changes
  useEffect(() => {
    if (!address) { setSales([]); setOpen(false); return; }
    let cancelled = false;
    fetchSalesCached(address)
      .then(data => { if (!cancelled) refresh(address, data); });
    return () => { cancelled = true; };
  }, [address, refresh]);

  // Close dropdown on outside click
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

  if (!address || sales.length === 0) return null;

  const allIds = sales.map(s => s.listingId);
  const unseenIds = allIds.filter(id => !seenIds.has(id));
  const hasNew = unseenIds.length > 0;

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open && address) {
      markSaleIdsSeen(address, allIds);
      setSeenIds(new Set(allIds));
    }
  };

  const preview = sales.slice(0, 5);

  return (
    <div className="relative" ref={containerRef}>

      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
      >
        Sold: {sales.length}
        {hasNew && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand border border-surface" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-surface-border bg-surface shadow-xl z-50 overflow-hidden">

          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Your Sales
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Listings that have been sold
            </p>
          </div>

          <ul className="divide-y divide-surface-border max-h-64 overflow-y-auto">
            {preview.map(sale => {
              const isNew = !seenIds.has(sale.listingId);
              const shortTx = sale.txid
                ? `${sale.txid.slice(0, 8)}…${sale.txid.slice(-6)}`
                : '';
              return (
                <li key={sale.listingId}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {isNew && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                      )}
                      <Link
                        href={`/listing/${sale.listingId}`}
                        onClick={() => setOpen(false)}
                        className="font-mono text-slate-300 text-xs hover:text-white transition-colors"
                      >
                        Listing #{sale.listingId} sold
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {sale.txid && (
                        <a
                          href={getOpscanTxUrl(sale.txid)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-brand hover:underline font-mono"
                          title={sale.txid}
                        >
                          {shortTx}
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="px-4 py-2.5 border-t border-surface-border flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              {sales.length} sale{sales.length !== 1 ? 's' : ''} total
            </p>
            <Link
              href="/assets?status=sold"
              onClick={() => {
                setOpen(false);
                if (address) markSaleIdsSeen(address, allIds);
              }}
              className="text-[10px] text-brand hover:underline shrink-0"
            >
              View all →
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}
