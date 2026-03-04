/**
 * lib/nftCollections.ts — localStorage cache for OP-721 NFT collections.
 * Mirrors the CachedToken pattern from lib/tokens.ts.
 */

export interface CachedCollection {
  address: string;
  name: string;
  symbol: string;
  icon?: string;
  addedAt: number;
}

const CACHE_KEY = 'nft_collection_cache_v1';

function readCache(): CachedCollection[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedCollection[]) : [];
  } catch {
    return [];
  }
}

function writeCache(cols: CachedCollection[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cols));
  } catch { /* ignore quota errors */ }
}

export function loadCachedCollections(): CachedCollection[] {
  return readCache();
}

/** Upsert a collection by address (most-recently-added first). */
export function saveCachedCollection(col: CachedCollection): void {
  const existing = readCache().filter((c) => c.address !== col.address);
  writeCache([col, ...existing]);
}

export function removeCachedCollection(address: string): void {
  writeCache(readCache().filter((c) => c.address !== address));
}
