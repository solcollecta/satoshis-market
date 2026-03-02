/**
 * lib/tokens.ts — Pure math utilities + localStorage cache for OP-20 tokens.
 * No SDK imports. Safe for SSR (localStorage guarded by `typeof window`).
 */

// ── Pure arithmetic ────────────────────────────────────────────────────────────

/**
 * Convert a human-readable decimal string to raw bigint units.
 * e.g. parseUnits("1.5", 18) → 1500000000000000000n
 * Returns 0n for empty/invalid input (silently truncates extra decimal places).
 */
export function parseUnits(value: string, decimals: number): bigint {
  if (!value || !/^\d*\.?\d*$/.test(value)) return 0n;
  const [intPart = '', fracPart = ''] = value.split('.');
  const int = BigInt(intPart || '0');
  const fracPadded = (fracPart || '').slice(0, decimals).padEnd(decimals, '0');
  const frac = BigInt(fracPadded || '0');
  return int * BigInt(10) ** BigInt(decimals) + frac;
}

/**
 * Convert raw bigint units to a human-readable decimal string.
 * e.g. formatUnits(1500000000000000000n, 18) → "1.5"
 * Removes trailing zeros; returns integer string when fractional part is zero.
 */
export function formatUnits(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const d = BigInt(10) ** BigInt(decimals);
  const intPart = raw / d;
  const fracRaw = raw % d;
  if (fracRaw === 0n) return intPart.toString();
  const fracStr = fracRaw.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${intPart}.${fracStr}`;
}

/** Convert a BTC decimal string to satoshis (bigint). e.g. "0.001" → 100000n */
export const parseBtcToSats = (btcStr: string): bigint => parseUnits(btcStr, 8);

// ── localStorage cache ────────────────────────────────────────────────────────

export interface CachedToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  addedAt: number;
}

const CACHE_KEY = 'op20_token_cache_v1';

function readCache(): CachedToken[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedToken[]) : [];
  } catch {
    return [];
  }
}

function writeCache(tokens: CachedToken[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(tokens));
  } catch { /* ignore quota errors */ }
}

export function loadCachedTokens(): CachedToken[] {
  return readCache();
}

/** Upsert a token by address (most-recently-added first). */
export function saveCachedToken(token: CachedToken): void {
  const existing = readCache().filter((t) => t.address !== token.address);
  writeCache([token, ...existing]);
}

export function removeCachedToken(address: string): void {
  writeCache(readCache().filter((t) => t.address !== address));
}

// ── Listing timestamp cache ────────────────────────────────────────────────────

const TIMESTAMP_KEY = 'listing_timestamps_v1';

type TimestampMap = Record<string, number>;

function readTimestamps(): TimestampMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TIMESTAMP_KEY);
    return raw ? (JSON.parse(raw) as TimestampMap) : {};
  } catch {
    return {};
  }
}

function writeTimestamps(map: TimestampMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TIMESTAMP_KEY, JSON.stringify(map));
  } catch { /* ignore quota errors */ }
}

/** Save the creation timestamp (now) for a listing by its offer ID. */
export function saveListingTimestamp(offerId: bigint | number | string): void {
  const map = readTimestamps();
  map[String(offerId)] = Date.now();
  writeTimestamps(map);
}

/** Get the saved ms timestamp for a listing, or null if not recorded. */
export function getListingTimestamp(offerId: bigint | number | string): number | null {
  const ts = readTimestamps()[String(offerId)];
  return ts != null ? ts : null;
}

/** Get all saved timestamps as offerId → ms map. */
export function getAllListingTimestamps(): TimestampMap {
  return readTimestamps();
}

/**
 * Format a ms timestamp as a relative time string.
 * e.g. "just now", "3 min ago", "2 hrs ago", "yesterday", "Mar 1"
 */
export function formatRelativeTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr > 1 ? 's' : ''} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Compact token amount formatter ────────────────────────────────────────────

/**
 * Format a raw token bigint in compact human-readable notation.
 * e.g. 12_400_000_000_000_000_000_000n with decimals=18 → "12.4K"
 *
 * Use formatUnits(raw, decimals) for the full precise value (e.g. for tooltips).
 * Do NOT use this for transaction amounts — internal raw values are unchanged.
 */
export function formatTokenCompact(raw: bigint, decimals: number): string {
  const d = BigInt(10) ** BigInt(decimals);
  // Split integer and fractional parts to avoid Number overflow on huge bigints
  const value = Number(raw / d) + Number(raw % d) / Number(d);
  const fmt = (n: number, suffix: string): string =>
    parseFloat(n.toPrecision(3)) + suffix;
  if (value >= 1e12) return fmt(value / 1e12, 'T');
  if (value >= 1e9)  return fmt(value / 1e9,  'B');
  if (value >= 1e6)  return fmt(value / 1e6,  'M');
  if (value >= 1e3)  return fmt(value / 1e3,  'K');
  return value === 0 ? '0' : String(parseFloat(value.toPrecision(4)));
}
