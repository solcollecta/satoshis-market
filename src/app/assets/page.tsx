'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  listOffers,
  fetchCurrentBlock,
  getWalletOpnetAddressHex,
  p2trAddressToKeyHex,
  keyToHex,
  normalizeToHex32,
  hexToBigint,
  fetchTokenInfo,
  fetchNftCollectionInfo,
} from '@/lib/opnet';
import {
  getPrivateListingsForMe,
  markPrivateIdsSeen,
  dispatchOffersUpdated,
} from '@/lib/privateListings';
import type { Offer } from '@/types/offer';
import type { BuyRequest } from '@/lib/requestsDb';
import { OfferCard } from '@/components/OfferCard';
import { OfferCardRow } from '@/components/OfferCardRow';
import { RequestCard } from '@/components/RequestCard';
import { AssetNav } from '@/components/AssetNav';
import { StatusDropdown } from '@/components/StatusDropdown';
import { SortDropdown } from '@/components/SortDropdown';
import { ViewToggle } from '@/components/ViewToggle';
import { useWallet } from '@/context/WalletContext';
import { getAllListingTimestamps } from '@/lib/tokens';

type Filter    = 'all' | 'nft' | 'token';
type Sort      = 'price_asc' | 'price_desc' | 'id_desc' | 'id_asc';
type StatusKey = 'sold' | 'cancelled';
type ViewModeMarket  = 'listings' | 'requests';
type GridMode  = 'grid' | 'list';

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'sold',      label: 'Sold'      },
  { key: 'cancelled', label: 'Cancelled' },
];

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'id_desc',    label: 'Latest'            },
  { key: 'id_asc',     label: 'Oldest'            },
  { key: 'price_asc',  label: 'Price: low → high' },
  { key: 'price_desc', label: 'Price: high → low' },
];

export default function AssetsPageWrapper() {
  return (
    <Suspense>
      <AssetsPage />
    </Suspense>
  );
}

function AssetsPage() {
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
  const [viewMode, setViewMode]   = useState<ViewModeMarket>(() => searchParams.get('view') === 'requests' ? 'requests' : 'listings');
  const [requests, setRequests]   = useState<BuyRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [privateToMe, setPrivateToMe] = useState(() => searchParams.get('privateToMe') === '1');
  const [nameCache, setNameCache] = useState<Map<string, string>>(new Map());
  const [gridMode, setGridMode]   = useState<GridMode>('grid');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n);

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
      const [fetched, hiddenRes, block] = await Promise.all([
        listOffers(),
        fetch('/api/hidden-listings').then(r => r.json()).catch(() => []),
        fetchCurrentBlock().catch(() => 0n),
      ]);
      setOffers(fetched);
      setTimestamps(getAllListingTimestamps());
      setHiddenIds(new Set(Array.isArray(hiddenRes) ? hiddenRes : []));
      setCurrentBlock(block);
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

  // Build token/collection name cache for text search
  useEffect(() => {
    if (offers.length === 0) return;
    const unique = [...new Set(offers.map(o => o.token))];
    const missing = unique.filter(addr => !nameCache.has(addr));
    if (missing.length === 0) return;

    const entries: [string, string][] = [];
    Promise.allSettled(
      missing.map(async addr => {
        const isNft = offers.find(o => o.token === addr)?.isNFT;
        if (isNft) {
          const info = await fetchNftCollectionInfo(addr);
          if (info?.name) entries.push([addr, info.name]);
        } else {
          const info = await fetchTokenInfo(addr);
          if (info?.symbol && info.symbol !== '???') entries.push([addr, info.symbol]);
          if (info?.name) entries.push([addr + ':name', info.name]);
        }
      })
    ).then(() => {
      if (entries.length > 0) {
        setNameCache(prev => {
          const next = new Map(prev);
          for (const [k, v] of entries) next.set(k, v);
          return next;
        });
      }
    });
  }, [offers]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Standard visibility: all open listings (public + private) shown by default.
      // Private listings display a "Private" badge; the contract enforces taker restriction.
      list = list.filter(o => {
        if (o.status === 1) return true;
        if (statusFilters.has('sold')      && o.status === 2) return true;
        if (statusFilters.has('cancelled') && o.status === 3) return true;
        return false;
      });
    }

    // ── Hidden listings: exclude unless viewer is seller or buyer ────────
    if (hiddenIds.size > 0) {
      let viewerTaker: bigint | null = null;
      if (address) {
        try { viewerTaker = hexToBigint(normalizeToHex32(address)); } catch { /* skip */ }
      }
      list = list.filter(o => {
        if (!hiddenIds.has(o.id.toString())) return true; // not hidden
        // Seller can always see their own hidden listings
        if (myOpnetAddr && o.maker.toLowerCase() === myOpnetAddr.toLowerCase()) return true;
        // Allowed taker (buyer) can see the hidden listing
        if (viewerTaker && o.allowedTaker === viewerTaker) return true;
        return false; // hidden from everyone else
      });
    }

    // ── Expired listings: hide open listings past their expiryBlock ──────
    if (currentBlock > 0n) {
      list = list.filter(o => {
        if (o.status !== 1) return true; // keep sold/cancelled regardless
        if (o.expiryBlock === 0n) return true; // no expiry set
        return currentBlock < o.expiryBlock; // still active
      });
    }

    if (filter === 'nft')   list = list.filter(o => o.isNFT);
    if (filter === 'token') list = list.filter(o => !o.isNFT);

    if (mineOnly && myOpnetAddr) {
      const norm = myOpnetAddr.toLowerCase();
      list = list.filter(o => o.maker.toLowerCase() === norm);
    } else if (myOpnetAddr) {
      const norm = myOpnetAddr.toLowerCase();
      list = list.filter(o => o.maker.toLowerCase() !== norm);
    }

    if (sort === 'price_asc')  list = [...list].sort((a, b) => a.btcSatoshis < b.btcSatoshis ? -1 : 1);
    if (sort === 'price_desc') list = [...list].sort((a, b) => a.btcSatoshis > b.btcSatoshis ? -1 : 1);
    if (sort === 'id_desc')    list = [...list].sort((a, b) => a.id > b.id ? -1 : 1);
    if (sort === 'id_asc')     list = [...list].sort((a, b) => a.id < b.id ? -1 : 1);

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
          list = list.filter(o => {
            if (o.token.toLowerCase().includes(q)) return true;
            const sym = nameCache.get(o.token)?.toLowerCase();
            if (sym && sym.includes(q)) return true;
            const name = nameCache.get(o.token + ':name')?.toLowerCase();
            if (name && name.includes(q)) return true;
            return false;
          });
        }
      }
    }

    return list;
  }, [offers, filter, sort, search, statusFilters, mineOnly, myOpnetAddr, privateToMe, address, nameCache, hiddenIds, currentBlock]);

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

  // ── Grid class based on view mode ────────────────────────────────────────
  const gridClass =
    gridMode === 'list' ? 'flex flex-col gap-2' :
                          'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

  const skeletonClass =
    gridMode === 'list' ? 'skeleton h-16 rounded-xl' :
                          'skeleton h-52 rounded-2xl';

  const skeletonCount = gridMode === 'list' ? 12 : 9;

  const isLoading = loading || (viewMode === 'requests' && requestsLoading);

  return (
    <div className="space-y-3">

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
      </div>

      {/* Controls — sticky */}
      <div className="sticky top-16 z-30 -mx-4 px-4 py-3 bg-surface/90 backdrop-blur-xl border-b border-surface-border/40">
        <div className="space-y-3">

          {/* Row 1: Filter pills + View toggle */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Asset type */}
            <div className={pillGroup}>
              {(['all', 'nft', 'token'] as Filter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)} className={pill(filter === f)}>
                  {f === 'all' ? 'All' : f === 'nft' ? 'OP-721 NFTs' : 'OP-20 Tokens'}
                </button>
              ))}
            </div>

            {/* Market type */}
            <div className={pillGroup}>
              {(['listings', 'requests'] as ViewModeMarket[]).map(vm => (
                <button key={vm} onClick={() => setViewMode(vm)} className={pill(viewMode === vm)}>
                  {vm === 'listings' ? 'Listings' : 'Requests'}
                </button>
              ))}
            </div>

            {/* Grid / List view */}
            {viewMode === 'listings' && (
              <ViewToggle value={gridMode} onChange={setGridMode} />
            )}

            {/* User filter (Listings only, wallet required) */}
            {viewMode === 'listings' && address && (
              <div className={pillGroup}>
                <button
                  onClick={() => setMineOnly(v => { if (v) return false; setPrivateToMe(false); return true; })}
                  className={pill(mineOnly, false)}
                >
                  My Listings
                </button>
                <button
                  onClick={() => setPrivateToMe(v => { if (v) return false; setMineOnly(false); return true; })}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
                    privateToMe
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                      : 'text-slate-500 hover:text-white'
                  }`}
                >
                  My Private Deals
                </button>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Status dropdown (Listings only) */}
            {viewMode === 'listings' && (
              <StatusDropdown
                options={STATUS_OPTIONS}
                selected={statusFilters as Set<string>}
                onToggle={k => toggleStatus(k as StatusKey)}
              />
            )}

            {/* Sort */}
            <SortDropdown
              options={SORT_OPTIONS}
              value={sort}
              onChange={s => setSort(s as Sort)}
            />

            {/* Refresh */}
            <button
              type="button"
              onClick={() => { void load(); if (viewMode === 'requests') void loadRequests(); }}
              disabled={loading}
              style={{
                display:         'inline-flex',
                alignItems:      'center',
                backgroundColor: '#0E1320',
                border:          '1px solid #1A2236',
                borderRadius:    '0.625rem',
                padding:         '0.375rem 1rem',
                fontSize:        '0.875rem',
                color:           loading ? '#334155' : '#F1F5F9',
                cursor:          loading ? 'not-allowed' : 'pointer',
                whiteSpace:      'nowrap',
                lineHeight:      '1.5',
                flexShrink:      0,
              }}
            >
              {loading ? '...' : 'Refresh'}
            </button>
          </div>

          {/* Row 2: Search */}
          <input
            type="search"
            placeholder="Search by name, ID, seller address, or contract..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full !rounded-lg !py-1.5 !text-sm"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-900/60 bg-red-950/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className={gridClass}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className={skeletonClass} />
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
            <EmptyState
              icon={<CartIcon />}
              title="No open buy requests"
              action={{ label: 'Post the first request', href: '/request/create' }}
            />
          )}
        </>
      )}

      {/* Listings — Grid view */}
      {viewMode === 'listings' && !loading && displayed.length > 0 && gridMode !== 'list' && (
        <div className={gridClass}>
          {displayed.map(o => (
            <OfferCard key={o.id.toString()} offer={o} createdAt={timestamps[o.id.toString()]} hidden={hiddenIds.has(o.id.toString())} currentBlock={currentBlock} />
          ))}
        </div>
      )}

      {/* Listings — List view */}
      {viewMode === 'listings' && !loading && displayed.length > 0 && gridMode === 'list' && (
        <div className={gridClass}>
          {displayed.map(o => (
            <OfferCardRow key={o.id.toString()} offer={o} createdAt={timestamps[o.id.toString()]} hidden={hiddenIds.has(o.id.toString())} currentBlock={currentBlock} />
          ))}
        </div>
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
        <EmptyState
          icon={<BoxIcon />}
          title="No listings yet"
          action={{ label: 'Create the first listing', href: '/create' }}
        />
      )}

    </div>
  );
}

// ── Empty state component ─────────────────────────────────────────────────────

function EmptyState({ icon, title, action }: {
  icon: JSX.Element;
  title: string;
  action: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center mb-4 text-slate-700">
        {icon}
      </div>
      <p className="font-semibold text-slate-400">{title}</p>
      <p className="text-sm mt-2">
        <Link href={action.href} className="text-brand hover:underline">
          {action.label} →
        </Link>
      </p>
    </div>
  );
}

function CartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
      <path d="M2.25 2.25a.75.75 0 000 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 00-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 000-1.5H5.378A2.25 2.25 0 017.5 15h11.218a.75.75 0 00.674-.421 60.358 60.358 0 002.96-7.228.75.75 0 00-.525-.965A60.864 60.864 0 005.68 4.509l-.232-.867A1.875 1.875 0 003.636 2.25H2.25zM3.75 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM16.5 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
      <path d="M3.375 3C2.339 3 1.5 3.84 1.5 4.875v.75c0 1.036.84 1.875 1.875 1.875h17.25c1.035 0 1.875-.84 1.875-1.875v-.75C22.5 3.839 21.66 3 20.625 3H3.375z" />
      <path fillRule="evenodd" d="M3.087 9l.54 9.176A3 3 0 006.62 21h10.757a3 3 0 002.995-2.824L20.913 9H3.087zm6.163 3.75A.75.75 0 0110 12h4a.75.75 0 010 1.5h-4a.75.75 0 01-.75-.75z" clipRule="evenodd" />
    </svg>
  );
}
