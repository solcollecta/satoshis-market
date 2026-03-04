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
  p2trAddressToKeyHex,
  keyToHex,
  hex32ToP2TRAddress,
  type NftCollectionInfo,
} from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import { OfferCard } from '@/components/OfferCard';
import { StatusDropdown } from '@/components/StatusDropdown';
import { getAllListingTimestamps } from '@/lib/tokens';

type StatusKey = 'open' | 'sold' | 'cancelled' | 'private';

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'open',      label: 'Open'      },
  { key: 'sold',      label: 'Sold'      },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'private',   label: 'Private'   },
];

interface TokenMeta { name: string; symbol: string; decimals: number }

export default function CollectionPage() {
  const { addr } = useParams<{ addr: string }>();

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
  const [sort, setSort]         = useState<'price_asc' | 'price_desc' | 'id_desc'>('id_desc');
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(new Set(['open']));
  const [search, setSearch]     = useState('');

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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listOffers();
      setOffers(all.filter((o) => o.token.toLowerCase() === addr.toLowerCase()));
      setTimestamps(getAllListingTimestamps());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

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

  const displayed = useMemo(() => {
    let list = offers;

    // Status checkboxes — empty set means show all
    if (statusFilters.size > 0) {
      list = list.filter(o => {
        if (statusFilters.has('open')      && o.status === 1)        return true;
        if (statusFilters.has('sold')      && o.status === 2)        return true;
        if (statusFilters.has('cancelled') && o.status === 3)        return true;
        if (statusFilters.has('private')   && o.allowedTaker !== 0n) return true;
        return false;
      });
    }

    // Always exclude private listings unless "Private" is explicitly selected
    if (!statusFilters.has('private')) {
      list = list.filter(o => o.allowedTaker === 0n);
    }

    if (sort === 'price_asc')  list = [...list].sort((a, b) => (a.btcSatoshis < b.btcSatoshis ? -1 : 1));
    if (sort === 'price_desc') list = [...list].sort((a, b) => (a.btcSatoshis > b.btcSatoshis ? -1 : 1));
    if (sort === 'id_desc')    list = [...list].sort((a, b) => (a.id > b.id ? -1 : 1));

    const q = search.trim().toLowerCase();
    if (q) {
      if (/^\d+$/.test(q)) {
        // Numeric → match by listing ID
        list = list.filter((o) => o.id.toString().includes(q));
      } else {
        // Try to interpret as a bech32 P2TR address and compare key hex
        const inputKey = p2trAddressToKeyHex(q);
        if (inputKey) {
          const norm = inputKey.toLowerCase();
          list = list.filter((o) => keyToHex(o.btcRecipientKey).toLowerCase() === norm);
        } else {
          // Partial match: bech32 seller address, OPNet maker address, or contract
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
  }, [offers, sort, search, statusFilters]);

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
          {/* Stronger gradient so text below is always readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-card via-surface-card/40 to-transparent" />

          {/* Type badge */}
          <span className="absolute top-3 right-3 text-[10px] font-semibold text-slate-400 bg-surface/80 backdrop-blur px-2.5 py-1 rounded-full border border-surface-border">
            {isNFT === true ? 'OP-721' : isNFT === false ? 'OP-20' : '…'}
          </span>
        </div>

        {/* Info row */}
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-8 mb-5">
            {/* Icon */}
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

      {/* Controls — always visible */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search by #ID, seller address, or contract…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 !rounded-lg !py-1.5 !text-sm"
        />

        {/* Status multi-select dropdown */}
        <StatusDropdown
          options={STATUS_OPTIONS}
          selected={statusFilters as Set<string>}
          onToggle={k => toggleStatus(k as StatusKey)}
        />

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="w-auto !rounded-lg !py-1.5 !text-sm shrink-0"
        >
          <option value="id_desc">Newest first</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
        </select>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="btn-secondary !py-1.5 !text-sm shrink-0"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Offer grid */}
      {!loading && displayed.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((o) => (
            <OfferCard key={o.id.toString()} offer={o} createdAt={timestamps[o.id.toString()]} />
          ))}
        </div>
      )}

      {/* No results */}
      {!loading && displayed.length === 0 && offers.length > 0 && (
        <div className="card text-center py-12 text-slate-500">
          <p className="font-semibold">No listings match your filters</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilters(new Set(['open'])); }}
            className="text-sm text-brand hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && offers.length === 0 && !error && (
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
