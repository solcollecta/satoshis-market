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
  type NftCollectionInfo,
} from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import { OfferCard } from '@/components/OfferCard';

interface TokenMeta { name: string; symbol: string; decimals: number }

export default function CollectionPage() {
  const { addr } = useParams<{ addr: string }>();

  const [offers, setOffers]       = useState<Offer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Metadata
  const [nftInfo, setNftInfo]     = useState<NftCollectionInfo | null>(null);
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);
  const [bannerErr, setBannerErr] = useState(false);
  const [iconErr, setIconErr]     = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [sort, setSort]                  = useState<'price_asc' | 'price_desc' | 'id_desc'>('price_asc');

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
    let list = statusFilter === 'open' ? openOffers : offers;
    if (sort === 'price_asc')  list = [...list].sort((a, b) => (a.btcSatoshis < b.btcSatoshis ? -1 : 1));
    if (sort === 'price_desc') list = [...list].sort((a, b) => (a.btcSatoshis > b.btcSatoshis ? -1 : 1));
    if (sort === 'id_desc')    list = [...list].sort((a, b) => (a.id > b.id ? -1 : 1));
    return list;
  }, [statusFilter, sort, offers, openOffers]);

  const bannerSrc = nftInfo?.banner && !bannerErr ? nftInfo.banner : null;
  const iconSrc   = nftInfo?.icon && !iconErr ? nftInfo.icon : null;
  const displayName =
    (isNFT ? nftInfo?.name : tokenMeta?.symbol ?? tokenMeta?.name)
    ?? shortAddr(addr);

  return (
    <div className="space-y-8">

      {/* Back */}
      <Link href="/collections" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors">
        ← Collections
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
            <div className="w-full h-full bg-gradient-to-br from-surface via-surface-card to-surface-elevated flex items-center justify-center">
              <span className="text-7xl opacity-[0.06]">{isNFT ? '🖼' : '🪙'}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-card/80 to-transparent" />

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
              <div className="w-16 h-16 rounded-xl bg-surface-elevated border-2 border-surface-card flex items-center justify-center text-2xl shrink-0 relative z-10 shadow-xl">
                {isNFT ? '🖼' : '🪙'}
              </div>
            )}
            <div className="min-w-0 pb-1">
              <h1 className="text-xl font-bold text-white truncate">{displayName}</h1>
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

      {/* Filters + sort */}
      {!loading && offers.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status toggle */}
          <div className="flex items-center gap-1 bg-surface-card border border-surface-border rounded-xl p-1">
            {(['open', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  statusFilter === f
                    ? 'bg-brand text-black shadow-sm'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                {f === 'open' ? `Open (${openOffers.length})` : `All (${offers.length})`}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="w-auto"
          >
            <option value="price_asc">Price: low → high</option>
            <option value="price_desc">Price: high → low</option>
            <option value="id_desc">Newest first</option>
          </select>

          <button
            onClick={() => void load()}
            disabled={loading}
            className="btn-secondary ml-auto"
          >
            Refresh
          </button>
        </div>
      )}

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
            <OfferCard key={o.id.toString()} offer={o} />
          ))}
        </div>
      )}

      {/* No open listings */}
      {!loading && displayed.length === 0 && offers.length > 0 && statusFilter === 'open' && (
        <div className="card text-center py-12 text-slate-500">
          <p className="font-semibold">No open listings</p>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className="text-sm text-brand hover:underline mt-2"
          >
            Show all ({offers.length})
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && offers.length === 0 && !error && (
        <div className="card text-center py-20 text-slate-600">
          <span className="text-5xl mb-4 block opacity-20">{isNFT ? '🖼' : '🪙'}</span>
          <p className="font-semibold text-slate-400">No listings for this collection</p>
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
