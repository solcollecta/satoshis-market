'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  listOffers,
  getWalletOpnetAddressHex,
  p2trAddressToKeyHex,
  keyToHex,
  normalizeToHex32,
  hexToBigint,
} from '@/lib/opnet';
import {
  getPrivateListingsForMe,
  markPrivateIdsSeen,
  dispatchOffersUpdated,
} from '@/lib/privateListings';
import type { Offer } from '@/types/offer';
import type { BuyRequest } from '@/lib/requestsDb';
import { OfferCard } from '@/components/OfferCard';
import { RequestCard } from '@/components/RequestCard';
import { AssetNav } from '@/components/AssetNav';
import { StatusDropdown } from '@/components/StatusDropdown';
import { useWallet } from '@/context/WalletContext';
import { getAllListingTimestamps } from '@/lib/tokens';

type Filter    = 'all' | 'nft' | 'token';
type Sort      = 'price_asc' | 'price_desc' | 'id_desc';
type StatusKey = 'sold' | 'cancelled' | 'private';
type ViewMode  = 'listings' | 'requests';

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'sold',      label: 'Sold'      },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'private',   label: 'Private'   },
];

export default function AssetsPage() {
  const { address } = useWallet();
  const searchParams = useSearchParams();
  const [offers, setOffers]   = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [search, setSearch]     = useState(searchParams.get('token') ?? '');
  const [filter, setFilter]     = useState<Filter>('all');
  const [sort, setSort]         = useState<Sort>('id_desc');
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(new Set());
  const [mineOnly, setMineOnly] = useState(false);
  const [myOpnetAddr, setMyOpnetAddr] = useState<string | null>(null);
  const [timestamps, setTimestamps] = useState<Record<string, number>>({});
  const [viewMode, setViewMode]   = useState<ViewMode>(() => searchParams.get('view') === 'requests' ? 'requests' : 'listings');
  const [requests, setRequests]   = useState<BuyRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [privateToMe, setPrivateToMe] = useState(() => searchParams.get('privateToMe') === '1');

  const toggleStatus = (key: StatusKey) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (!address) { setMyOpnetAddr(null); return; }
    getWalletOpnetAddressHex(address).then(setMyOpnetAddr).catch(() => setMyOpnetAddr(null));
  }, [address]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await listOffers();
      setOffers(fetched);
      setTimestamps(getAllListingTimestamps());
      dispatchOffersUpdated(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const res  = await fetch('/api/requests?status=open');
      const data = await res.json() as BuyRequest[];
      setRequests(data);
    } catch { /* ignore */ } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (viewMode === 'requests') void loadRequests();
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark private-to-me listings as seen when filter is active
  useEffect(() => {
    if (!privateToMe || !address || offers.length === 0) return;
    const mine = getPrivateListingsForMe(offers, address);
    if (mine.length > 0) markPrivateIdsSeen(address, mine.map(o => o.id.toString()));
  }, [privateToMe, address, offers]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const openOffers     = useMemo(() => offers.filter(o => o.status === 1), [offers]);
  const nftOpenCount   = useMemo(() => openOffers.filter(o => o.isNFT).length, [openOffers]);
  const tokenOpenCount = useMemo(() => openOffers.filter(o => !o.isNFT).length, [openOffers]);

  // ── Filtered + sorted listings ─────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = offers;

    // ── Base visibility filter ────────────────────────────────────────────
    if (privateToMe && address) {
      // "Private to me": show only listings restricted to my address.
      // Sort, search, asset type, and status filters still apply after this.
      let takerBigint: bigint | null = null;
      try { takerBigint = hexToBigint(normalizeToHex32(address)); } catch { /* skip */ }
      if (takerBigint && takerBigint !== 0n) {
        const tk = takerBigint;
        list = list.filter(o => o.allowedTaker !== 0n && o.allowedTaker === tk);
        // Within private-to-me: open always shown; sold/cancelled opt-in via status filter
        list = list.filter(o => {
          if (o.status === 1) return true;
          if (statusFilters.has('sold')      && o.status === 2) return true;
          if (statusFilters.has('cancelled') && o.status === 3) return true;
          return false;
        });
      } else {
        list = [];
      }
    } else {
      // Standard visibility: open public is always the base.
      // Sold / Cancelled / Private are additive opt-in via status filter.
      // Own open private listings are always shown when "Own Listings" is active.
      const myNorm = mineOnly && myOpnetAddr ? myOpnetAddr.toLowerCase() : null;
      list = list.filter(o => {
        if (o.status === 1 && o.allowedTaker === 0n) return true;                             // open public: always
        if (myNorm && o.status === 1 && o.allowedTaker !== 0n
            && o.maker.toLowerCase() === myNorm)        return true;                          // own private open: always when mineOnly
        if (statusFilters.has('sold')      && o.status === 2)                   return true;
        if (statusFilters.has('cancelled') && o.status === 3)                   return true;
        if (statusFilters.has('private')   && o.allowedTaker !== 0n && o.status === 1) return true;
        return false;
      });
    }

    if (filter === 'nft')   list = list.filter(o => o.isNFT);
    if (filter === 'token') list = list.filter(o => !o.isNFT);

    if (mineOnly && myOpnetAddr) {
      const norm = myOpnetAddr.toLowerCase();
      list = list.filter(o => o.maker.toLowerCase() === norm);
    }

    if (sort === 'price_asc')  list = [...list].sort((a, b) => a.btcSatoshis < b.btcSatoshis ? -1 : 1);
    if (sort === 'price_desc') list = [...list].sort((a, b) => a.btcSatoshis > b.btcSatoshis ? -1 : 1);
    if (sort === 'id_desc')    list = [...list].sort((a, b) => a.id > b.id ? -1 : 1);

    const q = search.trim().toLowerCase();
    if (q) {
      if (/^\d+$/.test(q)) {
        list = list.filter(o => o.id.toString().includes(q));
      } else {
        const inputKey = p2trAddressToKeyHex(q);
        if (inputKey) {
          const norm = inputKey.toLowerCase();
          list = list.filter(o => keyToHex(o.btcRecipientKey).toLowerCase() === norm);
        } else {
          list = list.filter(o => o.token.toLowerCase().includes(q));
        }
      }
    }

    return list;
  }, [offers, filter, sort, search, statusFilters, mineOnly, myOpnetAddr, privateToMe, address]);

  // ── Filtered requests (asset type only) ───────────────────────────────────
  const displayedRequests = useMemo(() => {
    let list = requests;
    if (filter === 'nft')   list = list.filter(r => r.assetType === 'op721');
    if (filter === 'token') list = list.filter(r => r.assetType === 'op20');
    return list;
  }, [requests, filter]);

  // ── Pill button helper ─────────────────────────────────────────────────────
  const pill = (active: boolean, disabled = false) =>
    `px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
      disabled
        ? 'text-slate-700 cursor-not-allowed'
        : active
        ? 'bg-brand text-black shadow-sm'
        : 'text-slate-500 hover:text-white'
    }`;

  const pillGroup = 'flex items-center gap-1 bg-surface border border-surface-border rounded-lg p-1 shrink-0';

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-2 flex-wrap">
        <div>
          <AssetNav />
          {!loading && offers.length > 0 && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
              <span><span className="text-white font-semibold">{openOffers.length}</span> open</span>
              <span className="text-slate-700">·</span>
              <span><span className="text-white font-semibold">{nftOpenCount}</span> NFTs</span>
              <span className="text-slate-700">·</span>
              <span><span className="text-white font-semibold">{tokenOpenCount}</span> tokens</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/create" className="btn-secondary shrink-0 text-sm">
            + List Asset
          </Link>
          <Link href="/request/create" className="btn-secondary shrink-0 text-sm">
            + Request Asset
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-3 space-y-3">

        {/* Row 1: Filter pills */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Level 1 — Asset type */}
          <div className={pillGroup}>
            {(['all', 'nft', 'token'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={pill(filter === f)}>
                {f === 'all' ? 'All' : f === 'nft' ? 'OP-721 NFTs' : 'OP-20 Tokens'}
              </button>
            ))}
          </div>

          {/* Level 2 — Market type */}
          <div className={pillGroup}>
            {(['listings', 'requests'] as ViewMode[]).map(vm => (
              <button key={vm} onClick={() => setViewMode(vm)} className={pill(viewMode === vm)}>
                {vm === 'listings' ? 'Listings' : 'Requests'}
              </button>
            ))}
          </div>

          {/* Level 3 — User filter (Listings only) */}
          {viewMode === 'listings' && (
            <div className={pillGroup}>
              <button
                onClick={() => { setMineOnly(false); setPrivateToMe(false); }}
                className={pill(!mineOnly && !privateToMe)}
              >
                All
              </button>
              <button
                onClick={() => address && setMineOnly(v => !v)}
                title={!address ? 'Connect your wallet first' : undefined}
                className={pill(mineOnly, !address)}
              >
                Own Listings
              </button>
              {address && (
                <button
                  onClick={() => setPrivateToMe(v => !v)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 flex items-center gap-1 ${
                    privateToMe
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                      : 'text-slate-500 hover:text-white'
                  }`}
                >
                  🔒 Private to me
                </button>
              )}
            </div>
          )}

          {/* Status dropdown (Listings only) */}
          {viewMode === 'listings' && (
            <StatusDropdown
              options={STATUS_OPTIONS}
              selected={statusFilters as Set<string>}
              onToggle={k => toggleStatus(k as StatusKey)}
            />
          )}

        </div>

        {/* Row 2: Search + sort + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            placeholder="Search by ID, seller address, or contract…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 !rounded-lg !py-1.5 !text-sm"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            className="w-auto !rounded-lg !py-[7px] !text-sm shrink-0"
          >
            <option value="price_asc">Price: low → high</option>
            <option value="price_desc">Price: high → low</option>
            <option value="id_desc">Newest first</option>
          </select>
          <button
            onClick={() => { void load(); if (viewMode === 'requests') void loadRequests(); }}
            disabled={loading}
            className="btn-secondary !rounded-lg !py-[7px] !text-sm shrink-0"
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-900/60 bg-red-950/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Loading skeleton */}
      {(loading || (viewMode === 'requests' && requestsLoading)) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Requests grid */}
      {viewMode === 'requests' && !requestsLoading && (
        <>
          {displayedRequests.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedRequests.map(r => <RequestCard key={r.id} request={r} />)}
            </div>
          ) : requests.length > 0 ? (
            <div className="card text-center py-12 text-slate-500">
              <p className="font-semibold">No requests match your filters</p>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="text-sm text-brand hover:underline mt-2"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="card text-center py-20 text-slate-600">
              <span className="text-5xl mb-4 block opacity-20">🛒</span>
              <p className="font-semibold text-slate-400">No open buy requests</p>
              <p className="text-sm mt-2">
                <Link href="/request/create" className="text-brand hover:underline">
                  Post the first request →
                </Link>
              </p>
            </div>
          )}
        </>
      )}

      {/* Listings grid */}
      {viewMode === 'listings' && !loading && displayed.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayed.map(o => (
              <OfferCard key={o.id.toString()} offer={o} createdAt={timestamps[o.id.toString()]} />
            ))}
          </div>
        </>
      )}

      {/* No results (listings mode) */}
      {viewMode === 'listings' && !loading && displayed.length === 0 && offers.length > 0 && (
        <div className="card text-center py-12 text-slate-500">
          <p className="font-semibold">No listings match your filters</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setFilter('all'); setStatusFilters(new Set()); setMineOnly(false); setPrivateToMe(false); }}
            className="text-sm text-brand hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Empty state (listings mode) */}
      {viewMode === 'listings' && !loading && offers.length === 0 && !error && (
        <div className="card text-center py-20 text-slate-600">
          <span className="text-5xl mb-4 block opacity-20">📦</span>
          <p className="font-semibold text-slate-400">No listings yet</p>
          <p className="text-sm mt-2">
            <Link href="/create" className="text-brand hover:underline">
              Create the first listing →
            </Link>
          </p>
        </div>
      )}

    </div>
  );
}
