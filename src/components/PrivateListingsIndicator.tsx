'use client';

/**
 * PrivateListingsIndicator — Navbar widget showing open private listings
 * restricted to the connected wallet.
 *
 * Detection: offer.status === 1 (Open) AND allowedTaker === wallet's key.
 * Seen/unseen: tracked per-wallet-address in localStorage.
 *
 * Data source:
 *  - On mount: calls listOffers() once, result cached for 60 s.
 *  - Listens to 'offersUpdated' event (fired by the assets page) to refresh
 *    without an extra RPC call whenever the user is already on that page.
 *  - On wallet address change: recomputes from cached offers (no re-fetch).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/context/WalletContext';
import { listOffers, formatBtcFromSats } from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import {
  getPrivateListingsForMe,
  getSeenPrivateIds,
  markPrivateIdsSeen,
  onOffersUpdated,
} from '@/lib/privateListings';

// ── Module-level offer cache (shared across renders, cleared after 60 s) ──────

let _cachedOffers: Offer[] = [];
let _cacheTs = 0;
const CACHE_TTL = 60_000;

async function fetchOffersCached(): Promise<Offer[]> {
  if (Date.now() - _cacheTs < CACHE_TTL && _cachedOffers.length > 0) {
    return _cachedOffers;
  }
  _cachedOffers = await listOffers();
  _cacheTs = Date.now();
  return _cachedOffers;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PrivateListingsIndicator() {
  const { address } = useWallet();
  const [privateOffers, setPrivateOffers] = useState<Offer[]>([]);
  const [seenIds, setSeenIds]             = useState<Set<string>>(new Set());
  const [open, setOpen]                   = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Recompute from a given offers array + current wallet
  const recompute = useCallback((offers: Offer[], addr: string | undefined) => {
    if (!addr) { setPrivateOffers([]); return; }
    const mine = getPrivateListingsForMe(offers, addr);
    setPrivateOffers(mine);
    setSeenIds(getSeenPrivateIds(addr));
  }, []);

  // Initial fetch + listen for external updates
  useEffect(() => {
    let cancelled = false;
    fetchOffersCached()
      .then(offers => { if (!cancelled) recompute(offers, address ?? undefined); })
      .catch(() => {});

    // Assets page fires this when it loads fresh offers → piggyback for free
    const unsub = onOffersUpdated(offers => {
      _cachedOffers = offers;
      _cacheTs = Date.now();
      if (!cancelled) recompute(offers, address ?? undefined);
    });

    return () => { cancelled = true; unsub(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-filter when wallet changes (cache is already warm)
  useEffect(() => {
    recompute(_cachedOffers, address ?? undefined);
    setOpen(false);
  }, [address, recompute]);

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

  if (!address || privateOffers.length === 0) return null;

  const allIds    = privateOffers.map(o => o.id.toString());
  const unseenIds = allIds.filter(id => !seenIds.has(id));
  const hasNew    = unseenIds.length > 0;

  const handleOpen = () => {
    setOpen(o => !o);
    // Mark all as seen when user opens the dropdown
    if (!open && address) {
      markPrivateIdsSeen(address, allIds);
      setSeenIds(new Set(allIds));
    }
  };

  const preview = privateOffers.slice(0, 5);

  return (
    <div className="relative" ref={containerRef}>

      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 transition-colors"
      >
        <span className="text-sky-400 shrink-0">🔒</span>
        Private: {privateOffers.length}
        {hasNew && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand border border-surface" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-surface-border bg-surface shadow-xl z-50 overflow-hidden">

          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Private Listings for You
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Only your wallet can buy these
            </p>
          </div>

          <ul className="divide-y divide-surface-border max-h-64 overflow-y-auto">
            {preview.map(o => {
              const idStr   = o.id.toString();
              const isNew   = !seenIds.has(idStr);
              const typeTag = o.isNFT ? 'OP-721' : 'OP-20';
              return (
                <li key={idStr}>
                  <Link
                    href={`/listing/${idStr}`}
                    onClick={() => {
                      setOpen(false);
                      if (address) {
                        markPrivateIdsSeen(address, [idStr]);
                        setSeenIds(prev => new Set([...prev, idStr]));
                      }
                    }}
                    className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isNew && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                      )}
                      <span className="font-mono text-slate-300 text-xs">
                        #{idStr}
                      </span>
                      <span className="text-[10px] text-slate-600 border border-slate-700 rounded px-1">
                        {typeTag}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-white font-mono shrink-0">
                      {formatBtcFromSats(o.btcSatoshis)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="px-4 py-2.5 border-t border-surface-border flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              {privateOffers.length} listing{privateOffers.length !== 1 ? 's' : ''} restricted to you
            </p>
            <Link
              href="/assets?privateToMe=1"
              onClick={() => {
                setOpen(false);
                if (address) markPrivateIdsSeen(address, allIds);
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
