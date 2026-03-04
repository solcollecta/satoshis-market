'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  listOffers,
  getWalletOpnetAddressHex,
  p2trAddressToKeyHex,
  keyToHex,
} from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import { OfferCard } from '@/components/OfferCard';
import { AssetNav } from '@/components/AssetNav';
import { StatusDropdown } from '@/components/StatusDropdown';
import { useWallet } from '@/context/WalletContext';
import { getAllListingTimestamps } from '@/lib/tokens';

type Filter    = 'all' | 'nft' | 'token';
type Sort      = 'price_asc' | 'price_desc' | 'id_desc';
type StatusKey = 'open' | 'sold' | 'cancelled' | 'private';

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'open',      label: 'Open'      },
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
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(new Set(['open']));
  const [mineOnly, setMineOnly] = useState(false);
  const [myOpnetAddr, setMyOpnetAddr] = useState<string | null>(null);
  const [timestamps, setTimestamps] = useState<Record<string, number>>({});

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
      setOffers(await listOffers());
      setTimestamps(getAllListingTimestamps());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const openOffers     = useMemo(() => offers.filter(o => o.status === 1), [offers]);
  const nftOpenCount   = useMemo(() => openOffers.filter(o => o.isNFT).length, [openOffers]);
  const tokenOpenCount = useMemo(() => openOffers.filter(o => !o.isNFT).length, [openOffers]);

  // ── Filtered + sorted list ─────────────────────────────────────────────────
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
  }, [offers, filter, sort, search, statusFilters, mineOnly, myOpnetAddr]);

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
        <Link href="/create" target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0 text-sm">
          + Create Listing
        </Link>
      </div>

      {/* Controls */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search by ID, seller address, or contract…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 !rounded-lg !py-1.5 !text-sm"
        />

        {/* Type + own listings pills */}
        <div className="flex items-center gap-1 bg-surface border border-surface-border rounded-lg p-1 shrink-0">
          {(['all', 'nft', 'token'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
                filter === f ? 'bg-brand text-black shadow-sm' : 'text-slate-500 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'nft' ? 'OP-721' : 'OP-20'}
            </button>
          ))}
          <button
            onClick={() => address && setMineOnly(v => !v)}
            title={!address ? 'Connect your wallet first' : undefined}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
              !address
                ? 'text-slate-700 cursor-not-allowed'
                : mineOnly
                ? 'bg-brand text-black shadow-sm'
                : 'text-slate-500 hover:text-white'
            }`}
          >
            Own Listings
          </button>
        </div>

        {/* Status multi-select dropdown */}
        <StatusDropdown
          options={STATUS_OPTIONS}
          selected={statusFilters as Set<string>}
          onToggle={k => toggleStatus(k as StatusKey)}
        />

        <select
          value={sort}
          onChange={e => setSort(e.target.value as Sort)}
          className="w-auto !rounded-lg !py-1.5 !text-sm shrink-0"
        >
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
          <option value="id_desc">Newest first</option>
        </select>

        <button onClick={() => void load()} disabled={loading} className="btn-secondary !py-1.5 !text-sm shrink-0">
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-900/60 bg-red-950/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Flat grid */}
      {!loading && displayed.length > 0 && (
        <>
          {filter === 'nft' && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{displayed.length} NFT listing{displayed.length !== 1 ? 's' : ''}</p>
              <Link href="/collections" className="text-xs text-brand hover:underline">
                Browse NFT Collections →
              </Link>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayed.map(o => (
              <OfferCard key={o.id.toString()} offer={o} createdAt={timestamps[o.id.toString()]} />
            ))}
          </div>
        </>
      )}

      {/* No results */}
      {!loading && displayed.length === 0 && offers.length > 0 && (
        <div className="card text-center py-12 text-slate-500">
          <p className="font-semibold">No listings match your filters</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setFilter('all'); setStatusFilters(new Set(['open'])); setMineOnly(false); }}
            className="text-sm text-brand hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && offers.length === 0 && !error && (
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
