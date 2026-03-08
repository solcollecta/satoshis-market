/**
 * lib/sales.ts — Client-side helpers for seller sale notifications.
 * Pattern mirrors privateListings.ts: localStorage seen/unseen + event bus.
 */

export interface SaleRecord {
  listingId: string;
  txid: string;
  createdAt: string;
}

// ── localStorage: seen set ────────────────────────────────────────────────────

const seenKey = (addr: string) => `seen_sales_${addr.toLowerCase()}`;

export function getSeenSaleIds(walletAddr: string): Set<string> {
  if (typeof window === 'undefined' || !walletAddr) return new Set();
  try {
    const raw = localStorage.getItem(seenKey(walletAddr));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markSaleIdsSeen(walletAddr: string, ids: Iterable<string>): void {
  if (typeof window === 'undefined' || !walletAddr) return;
  try {
    const existing = getSeenSaleIds(walletAddr);
    for (const id of ids) existing.add(id);
    localStorage.setItem(seenKey(walletAddr), JSON.stringify([...existing]));
  } catch { /* ignore quota errors */ }
}

// ── Custom event helpers (client-only) ────────────────────────────────────────

export function dispatchSalesUpdated(sales: SaleRecord[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('salesUpdated', { detail: { sales } }));
}

export function onSalesUpdated(
  handler: (sales: SaleRecord[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    handler((e as CustomEvent<{ sales: SaleRecord[] }>).detail.sales);
  };
  window.addEventListener('salesUpdated', listener);
  return () => window.removeEventListener('salesUpdated', listener);
}
