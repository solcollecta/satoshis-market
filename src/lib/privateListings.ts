/**
 * lib/privateListings.ts
 * Pure helpers for "private listings restricted to me" detection.
 * All logic is client-side + localStorage — no extra RPC.
 */

import type { Offer } from '@/types/offer';
import { normalizeToHex32, hexToBigint } from '@/lib/opnet';

/**
 * Return all open listings whose allowedTaker matches the connected wallet.
 * Uses the same comparison as listing/[id]/page.tsx:
 *   hexToBigint(normalizeToHex32(walletAddr)) === offer.allowedTaker
 */
export function getPrivateListingsForMe(offers: Offer[], walletAddr: string): Offer[] {
  if (!walletAddr || offers.length === 0) return [];
  let takerBigint: bigint;
  try {
    takerBigint = hexToBigint(normalizeToHex32(walletAddr));
  } catch {
    return [];
  }
  if (takerBigint === 0n) return [];
  return offers.filter(
    o => o.status === 1 && o.allowedTaker !== 0n && o.allowedTaker === takerBigint,
  );
}

// ── localStorage: seen set ────────────────────────────────────────────────────

const seenKey = (addr: string) => `seen_private_listings_${addr.toLowerCase()}`;

export function getSeenPrivateIds(walletAddr: string): Set<string> {
  if (typeof window === 'undefined' || !walletAddr) return new Set();
  try {
    const raw = localStorage.getItem(seenKey(walletAddr));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markPrivateIdsSeen(walletAddr: string, ids: Iterable<string>): void {
  if (typeof window === 'undefined' || !walletAddr) return;
  try {
    const existing = getSeenPrivateIds(walletAddr);
    for (const id of ids) existing.add(id);
    localStorage.setItem(seenKey(walletAddr), JSON.stringify([...existing]));
  } catch { /* ignore quota errors */ }
}

// ── Custom event helpers (client-only) ────────────────────────────────────────

/** Fired by the assets page after it fetches fresh offers. */
export function dispatchOffersUpdated(offers: Offer[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('offersUpdated', { detail: { offers } }));
}

export function onOffersUpdated(
  handler: (offers: Offer[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    handler((e as CustomEvent<{ offers: Offer[] }>).detail.offers);
  };
  window.addEventListener('offersUpdated', listener);
  return () => window.removeEventListener('offersUpdated', listener);
}
