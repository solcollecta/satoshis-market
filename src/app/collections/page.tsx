'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listOffers } from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import { CollectionCard } from '@/components/CollectionCard';
import type { CollectionSummary } from '@/components/CollectionCard';

function buildCollections(offers: Offer[]): CollectionSummary[] {
  const map = new Map<string, CollectionSummary>();

  for (const offer of offers) {
    const existing = map.get(offer.token);
    const isOpen = offer.status === 1;

    if (!existing) {
      map.set(offer.token, {
        address: offer.token,
        isNFT: offer.isNFT,
        floorSats: isOpen ? offer.btcSatoshis : 9999999999999n,
        openListings: isOpen ? 1 : 0,
        totalListings: 1,
      });
    } else {
      existing.totalListings += 1;
      if (isOpen) {
        existing.openListings += 1;
        if (offer.btcSatoshis < existing.floorSats) {
          existing.floorSats = offer.btcSatoshis;
        }
      }
    }
  }

  const result = Array.from(map.values()).map((c) => ({
    ...c,
    floorSats: c.openListings === 0 ? 0n : c.floorSats,
  }));

  return result.sort((a, b) => b.openListings - a.openListings);
}

export default function CollectionsPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'nft' | 'token'>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await listOffers();
      setOffers(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const allCollections = useMemo(() => buildCollections(offers), [offers]);

  const collections = useMemo(() => {
    let list = allCollections;
    if (filter === 'nft') list = list.filter((c) => c.isNFT);
    if (filter === 'token') list = list.filter((c) => !c.isNFT);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.address.toLowerCase().includes(q));
    return list;
  }, [allCollections, filter, search]);

  const nftCount   = allCollections.filter((c) => c.isNFT).length;
  const tokenCount = allCollections.filter((c) => !c.isNFT).length;

  return (
    <div className="space-y-10">

      {/* Header */}
      <div className="space-y-1 pt-2">
        <h1 className="text-3xl font-bold text-white tracking-tight">Collections</h1>
        <p className="text-slate-500">
          OP-721 NFT collections and OP-20 tokens listed on Satoshi&apos;s Market
        </p>
      </div>

      {/* Stats */}
      {!loading && allCollections.length > 0 && (
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="card-sm flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{allCollections.length}</span>
            <span className="text-slate-500 text-xs">Collections</span>
          </div>
          <div className="card-sm flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{nftCount}</span>
            <span className="text-slate-500 text-xs">OP-721 NFT</span>
          </div>
          <div className="card-sm flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{tokenCount}</span>
            <span className="text-slate-500 text-xs">OP-20 Token</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Search by contract address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48"
        />

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-surface-card border border-surface-border rounded-xl p-1">
          {(['all', 'nft', 'token'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                filter === f
                  ? 'bg-brand text-black shadow-sm'
                  : 'text-slate-500 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'nft' ? 'OP-721' : 'OP-20'}
            </button>
          ))}
        </div>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="btn-secondary shrink-0"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>

        <Link href="/create" className="btn-primary shrink-0">
          + Create Listing
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-900/60 bg-red-950/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && collections.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {collections.map((c) => (
            <CollectionCard key={c.address} collection={c} />
          ))}
        </div>
      )}

      {/* No results */}
      {!loading && collections.length === 0 && allCollections.length > 0 && (
        <div className="card text-center py-12 text-slate-500">
          <p className="font-semibold">No collections match your filter</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setFilter('all'); }}
            className="text-sm text-brand hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && allCollections.length === 0 && !error && (
        <div className="card text-center py-20 text-slate-600">
          <span className="text-5xl mb-4 block opacity-20">🖼</span>
          <p className="font-semibold text-slate-400">No collections yet</p>
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
