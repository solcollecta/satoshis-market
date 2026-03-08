'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  listOffers,
  fetchNftCollectionInfo,
  fetchTokenInfo,
  formatBtcFromSats,
  shortAddr,
  getWalletOpnetAddressHex,
  p2trAddressToKeyHex,
  keyToHex,
  hex32ToP2TRAddress,
  normalizeToHex32,
  hexToBigint,
  type NftCollectionInfo,
} from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import type { BuyRequest } from '@/lib/requestsDb';
import { OfferCard } from '@/components/OfferCard';
import { OfferCardRow } from '@/components/OfferCardRow';
import { RequestCard } from '@/components/RequestCard';
import { StatusDropdown } from '@/components/StatusDropdown';
import { SortDropdown } from '@/components/SortDropdown';
import { ViewToggle } from '@/components/ViewToggle';
import { useWallet } from '@/context/WalletContext';
import { getAllListingTimestamps } from '@/lib/tokens';

type Sort      = 'price_asc' | 'price_desc' | 'id_desc' | 'id_asc';
type StatusKey = 'open' | 'sold' | 'cancelled';
type ViewMode  = 'listings' | 'requests';
type GridMode  = 'grid' | 'list';

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'open',      label: 'Open'      },
  { key: 'sold',      label: 'Sold'      },
  { key: 'cancelled', label: 'Cancelled' },
];

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'id_desc',    label: 'Latest'            },
  { key: 'id_asc',     label: 'Oldest'            },
  { key: 'price_asc',  label: 'Price: low → high' },
  { key: 'price_desc', label: 'Price: high → low' },
];

interface TokenMeta { name: string; symbol: string; decimals: number }

export default function CollectionPage() {
  const { addr } = useParams<{ addr: string }>();
  const { address } = useWallet();

  const [offers, setOffers]       = useState<Offer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [timestamps, setTimestamps] = useState<Record<string, number>>({});

  // Metadata
  const [nftInfo, setNftInfo]     = useState<NftCollectionInfo | null>(null);
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);
  const [bannerErr, setBannerErr] = useState(false);
  const [iconErr, setIconErr]     = useState(false);

  // Filter state
  const [sort, setSort]           = useState<Sort>('id_desc');
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(new Set(['open']));
  const [search, setSearch]       = useState('');
  const [mineOnly, setMineOnly]   = useState(false);
  const [privateToMe, setPrivateToMe] = useState(false);
  const [myOpnetAddr, setMyOpnetAddr]  = useState<string | null>(null);
  const [viewMode, setViewMode]   = useState<ViewMode>('listings');
  const [gridMode, setGridMode]   = useState<GridMode>('grid');
  const [requests, setRequests]   = useState<BuyRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const toggleStatus = (key: StatusKey) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isNFT = useMemo(
    () => offers.find((o) => o.token.toLowerCase() === addr.toLowerCase())?.isNFT ?? null,
    [offers, addr],
  );

  useEffect(() => {
    if (!address) { setMyOpnetAddr(null); return; }
    getWalletOpnetAddressHex(address).then(setMyOpnetAddr).catch(() => setMyOpnetAddr(null));
  }, [address]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, hiddenRes] = await Promise.all([
        listOffers(),
        fetch('/api/hidden-listings').then(r => r.json()).catch(() => []),
      ]);
      setOffers(all.filter((o) => o.token.toLowerCase() === addr.toLowerCase()));
      setTimestamps(getAllListingTimestamps());
      setHiddenIds(new Set(Array.isArray(hiddenRes) ? hiddenRes : []));
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
      // Filter to this collection/token only
      setRequests(data.filter(r => r.contractAddress.toLowerCase() === addr.toLowerCase()));
    } catch { /* ignore */ } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  useEffect(() => {
    if (viewMode === 'requests') void loadRequests();
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isNFT === null) return;
    if (isNFT) {
      fetchNftCollectionInfo(addr)
        .then(setNftInfo)
        .catch(() => {});
    } else {
      fetchTokenInfo(addr)
        .then((info) =>
          setTokenMeta({
            name:     info.name ?? addr,
            symbol:   info.symbol && info.symbol !== '???' ? info.symbol : 'TOKEN',
            decimals: info.decimals,
          }),
        )
        .catch(() => {});
    }
  }, [addr, isNFT]);

  const openOffers = useMemo(() => offers.filter((o) => o.status === 1), [offers]);
  const floorSats  = useMemo(
    () => openOffers.reduce((min, o) => (o.btcSatoshis < min ? o.btcSatoshis : min), 9999999999999n),
    [openOffers],
  );

  // ── Filtered + sorted listings ─────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = offers;

    // ── Base visibility via status checkboxes ────────────────────────────
    if (privateToMe && address) {
      let takerBigint: bigint | null = null;
      try { takerBigint = hexToBigint(normalizeToHex32(address)); } catch { /* skip */ }
      if (takerBigint && takerBigint !== 0n) {
        const tk = takerBigint;
        list = list.filter(o => o.allowedTaker !== 0n && o.allowedTaker === tk);
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
      if (statusFilters.size > 0) {
        list = list.filter(o => {
          if (statusFilters.has('open')      && o.status === 1)        return true;
          if (statusFilters.has('sold')      && o.status === 2)        return true;
          if (statusFilters.has('cancelled') && o.status === 3)        return true;
          return false;
        });
      }
    }

    // ── Hidden listings: exclude unless viewer is seller or buyer ────────
    if (hiddenIds.size > 0) {
      let viewerTaker: bigint | null = null;
      if (address) {
        try { viewerTaker = hexToBigint(normalizeToHex32(address)); } catch { /* skip */ }
      }
      list = list.filter(o => {
        if (!hiddenIds.has(o.id.toString())) return true;
        if (myOpnetAddr && o.maker.toLowerCase() === myOpnetAddr.toLowerCase()) return true;
        if (viewerTaker && o.allowedTaker === viewerTaker) return true;
        return false;
      });
    }

    // Own listings filter
    if (mineOnly && myOpnetAddr) {
      const norm = myOpnetAddr.toLowerCase();
      list = list.filter(o => o.maker.toLowerCase() === norm);
    } else if (myOpnetAddr) {
      const norm = myOpnetAddr.toLowerCase();
      list = list.filter(o => o.maker.toLowerCase() !== norm);
    }

    // Sort
    if (sort === 'price_asc')  list = [...list].sort((a, b) => (a.btcSatoshis < b.btcSatoshis ? -1 : 1));
    if (sort === 'price_desc') list = [...list].sort((a, b) => (a.btcSatoshis > b.btcSatoshis ? -1 : 1));
    if (sort === 'id_desc')    list = [...list].sort((a, b) => (a.id > b.id ? -1 : 1));
    if (sort === 'id_asc')     list = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));

    // Text search
    const q = search.trim().toLowerCase();
    if (q) {
      if (/^\d+$/.test(q)) {
        list = list.filter((o) => o.id.toString().includes(q));
      } else {
        const inputKey = p2trAddressToKeyHex(q);
        if (inputKey) {
          const norm = inputKey.toLowerCase();
          list = list.filter((o) => keyToHex(o.btcRecipientKey).toLowerCase() === norm);
        } else {
          list = list.filter((o) => {
            try {
              const bech32 = hex32ToP2TRAddress(keyToHex(o.btcRecipientKey)).toLowerCase();
              if (bech32.includes(q)) return true;
            } catch { /* ignore */ }
            return (
              o.maker.toLowerCase().includes(q) ||
              o.token.toLowerCase().includes(q)
            );
          });
        }
      }
    }

    return list;
  }, [offers, sort, search, statusFilters, mineOnly, myOpnetAddr, privateToMe, address, hiddenIds]);

  const hue = (() => {
    let h = 0;
    for (let i = 0; i < Math.min(addr.length, 16); i++) h = (h * 31 + addr.charCodeAt(i)) & 0xffff;
    return h % 360;
  })();

  const bannerSrc  = nftInfo?.banner && !bannerErr ? nftInfo.banner : null;
  const iconSrc    = nftInfo?.icon && !iconErr ? nftInfo.icon : null;
  const displayName =
    (isNFT
      ? nftInfo?.name
      : tokenMeta?.symbol ?? tokenMeta?.name)
    ?? shortAddr(addr);

  const backHref  = isNFT === false ? '/tokens' : '/collections';
  const backLabel = isNFT === false ? 'OP-20 Coins' : 'NFT Collections';

  // ── Pill helpers ─────────────────────────────────────────────────────────────
  const pill = (active: boolean, disabled = false) =>
    `px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
      disabled
        ? 'text-slate-700 cursor-not-allowed'
        : active
        ? 'bg-brand text-black shadow-sm'
        : 'text-slate-500 hover:text-white'
    }`;

  const pillGroup = 'flex items-center gap-1 bg-surface border border-surface-border rounded-lg p-1 shrink-0';

  const gridClass =
    gridMode === 'list' ? 'flex flex-col gap-2' :
                          'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

  const skeletonClass =
    gridMode === 'list' ? 'skeleton h-16 rounded-xl' :
                          'skeleton h-52 rounded-2xl';

  const skeletonCount = gridMode === 'list' ? 8 : 6;
  const isLoading = loading || (viewMode === 'requests' && requestsLoading);

  return (
    <div className="space-y-6">

      {/* Back */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors pt-2"
      >
        ← {backLabel}
      </Link>

      {/* Collection header card */}
      <div className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden">
        {/* Banner */}
        <div className="relative h-40 bg-surface overflow-hidden">
          {bannerSrc ? (
            <img
              src={bannerSrc}
              alt=""
              className="w-full h-full object-cover opacity-60"
              onError={() => setBannerErr(true)}
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: `linear-gradient(135deg, hsl(${hue},35%,8%) 0%, hsl(${hue},50%,16%) 100%)` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-card via-surface-card/40 to-transparent" />

          {/* Type badge */}
          <span className="absolute top-3 right-3 text-[10px] font-semibold text-slate-400 bg-surface/80 backdrop-blur px-2.5 py-1 rounded-full border border-surface-border">
            {isNFT === true ? 'OP-721' : isNFT === false ? 'OP-20' : '…'}
          </span>
        </div>

        {/* Info row */}
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-8 mb-5">
            {iconSrc ? (
              <img
                src={iconSrc}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border-2 border-surface-card shadow-xl shrink-0 relative z-10"
                onError={() => setIconErr(true)}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-xl border-2 border-surface-card shadow-xl shrink-0 relative z-10 flex items-center justify-center text-2xl font-bold"
                style={{ background: `hsl(${hue},40%,16%)`, color: `hsl(${hue},65%,62%)` }}
              >
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 pb-1 relative z-10">
              <h1 className="text-xl font-bold text-white truncate">
                {isNFT === false && tokenMeta ? `$${displayName}` : displayName}
              </h1>
              {isNFT === false && tokenMeta && tokenMeta.name !== tokenMeta.symbol && (
                <p className="text-sm text-slate-500">{tokenMeta.name}</p>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-600 font-mono break-all mb-5">{addr}</p>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 pt-5 border-t border-surface-border">
            <div>
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-1">Floor</p>
              <p className="text-lg font-bold text-white font-mono">
                {openOffers.length > 0 ? formatBtcFromSats(floorSats) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-1">Open</p>
              <p className="text-lg font-bold text-white">{openOffers.length}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-1">Total</p>
              <p className="text-lg font-bold text-white">{offers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-900/60 bg-red-950/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Controls — sticky */}
      <div className="sticky top-16 z-30 -mx-4 px-4 py-3 bg-surface/90 backdrop-blur-xl border-b border-surface-border/40">
        <div className="space-y-3">

          {/* Row 1: Filter pills + View toggle */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Listings / Requests */}
            <div className={pillGroup}>
              {(['listings', 'requests'] as ViewMode[]).map(vm => (
                <button key={vm} onClick={() => setViewMode(vm)} className={pill(viewMode === vm)}>
                  {vm === 'listings' ? 'Listings' : 'Requests'}
                </button>
              ))}
            </div>

            {/* Grid / List view */}
            {viewMode === 'listings' && (
              <ViewToggle value={gridMode} onChange={setGridMode} />
            )}

            {/* User filter (Listings only) */}
            {viewMode === 'listings' && (
              <div className={pillGroup}>
                <button
                  onClick={() => address && setMineOnly(v => { if (v) return false; setPrivateToMe(false); return true; })}
                  title={!address ? 'Connect your wallet first' : undefined}
                  className={pill(mineOnly, !address)}
                >
                  My Listings
                </button>
                {address && (
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
                )}
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
            placeholder="Search by #ID or seller address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full !rounded-lg !py-1.5 !text-sm"
          />
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className={gridClass}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className={skeletonClass} />
          ))}
        </div>
      )}

      {/* Requests view */}
      {viewMode === 'requests' && !requestsLoading && (
        <>
          {requests.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {requests.map(r => <RequestCard key={r.id} request={r} />)}
            </div>
          ) : (
            <div className="card text-center py-12 text-slate-500">
              <p className="font-semibold">No open buy requests for this {isNFT ? 'collection' : 'token'}</p>
              <p className="text-sm mt-2">
                <Link href="/request/create" className="text-brand hover:underline">
                  Post a request →
                </Link>
              </p>
            </div>
          )}
        </>
      )}

      {/* Listings — Grid view */}
      {viewMode === 'listings' && !loading && displayed.length > 0 && gridMode !== 'list' && (
        <div className={gridClass}>
          {displayed.map((o) => (
            <OfferCard key={o.id.toString()} offer={o} createdAt={timestamps[o.id.toString()]} hidden={hiddenIds.has(o.id.toString())} />
          ))}
        </div>
      )}

      {/* Listings — List view */}
      {viewMode === 'listings' && !loading && displayed.length > 0 && gridMode === 'list' && (
        <div className={gridClass}>
          {displayed.map((o) => (
            <OfferCardRow key={o.id.toString()} offer={o} createdAt={timestamps[o.id.toString()]} hidden={hiddenIds.has(o.id.toString())} />
          ))}
        </div>
      )}

      {/* No results */}
      {viewMode === 'listings' && !loading && displayed.length === 0 && offers.length > 0 && (
        <div className="card text-center py-12 text-slate-500">
          <p className="font-semibold">No listings match your filters</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilters(new Set(['open'])); setMineOnly(false); setPrivateToMe(false); }}
            className="text-sm text-brand hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Empty state */}
      {viewMode === 'listings' && !loading && offers.length === 0 && !error && (
        <div className="card text-center py-20 text-slate-600">
          <span className="text-5xl mb-4 block opacity-20">{isNFT ? '🖼' : '🪙'}</span>
          <p className="font-semibold text-slate-400">No listings for this {isNFT ? 'collection' : 'token'}</p>
          <p className="text-sm mt-2">
            <Link href="/create" className="text-brand hover:underline">
              Create a listing →
            </Link>
          </p>
        </div>
      )}

    </div>
  );
}
