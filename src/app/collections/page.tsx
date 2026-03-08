'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listOffers, fetchNftCollectionInfo } from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import { CollectionCard } from '@/components/CollectionCard';
import type { CollectionSummary } from '@/components/CollectionCard';
import { AssetNav } from '@/components/AssetNav';

function buildCollections(offers: Offer[]): CollectionSummary[] {
  const map = new Map<string, CollectionSummary>();

  for (const offer of offers) {
    if (!offer.isNFT) continue;
    const existing = map.get(offer.token);
    const isOpen = offer.status === 1;

    if (!existing) {
      map.set(offer.token, {
        address: offer.token,
        isNFT: true,
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

  return Array.from(map.values())
    .map((c) => ({ ...c, floorSats: c.openListings === 0 ? 0n : c.floorSats }))
    .sort((a, b) => b.openListings - a.openListings);
}

export default function CollectionsPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOffers(await listOffers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const allCollections = useMemo(() => buildCollections(offers), [offers]);
  const [nameCache, setNameCache] = useState<Map<string, string>>(new Map());

  // Fetch names for search
  useEffect(() => {
    if (allCollections.length === 0) return;
    const missing = allCollections.filter(c => !nameCache.has(c.address));
    if (missing.length === 0) return;
    const entries: [string, string][] = [];
    Promise.allSettled(
      missing.map(async c => {
        const info = await fetchNftCollectionInfo(c.address);
        if (info?.name) entries.push([c.address, info.name]);
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
  }, [allCollections]); // eslint-disable-line react-hooks/exhaustive-deps

  const collections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCollections;
    return allCollections.filter((c) => {
      if (c.address.toLowerCase().includes(q)) return true;
      const name = nameCache.get(c.address)?.toLowerCase();
      if (name && name.includes(q)) return true;
      return false;
    });
  }, [allCollections, search, nameCache]);

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-2 flex-wrap">
        <div>
          <AssetNav />
          {!loading && allCollections.length > 0 && (
            <p className="mt-1.5 text-xs text-slate-500">
              <span className="text-white font-semibold">{allCollections.length}</span> collection{allCollections.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search by name or contract address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 !rounded-lg !py-1.5 !text-sm"
        />
        <button
          onClick={() => void load()}
          disabled={loading}
          className="btn-secondary !py-1.5 !text-sm shrink-0"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-900/60 bg-red-950/30 text-red-400 text-sm">{error}</div>
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
          <p className="font-semibold">No collections match your search</p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-sm text-brand hover:underline mt-2"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && allCollections.length === 0 && !error && (
        <div className="card text-center py-20 text-slate-600">
          <span className="text-5xl mb-4 block opacity-20">🖼</span>
          <p className="font-semibold text-slate-400">No NFT collections yet</p>
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
