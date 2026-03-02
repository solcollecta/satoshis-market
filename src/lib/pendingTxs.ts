/**
 * pendingTxs — localStorage-backed tracker for in-flight transactions.
 *
 * Saves a record when a transaction is broadcast and clears it when confirmed
 * or dismissed by the user. The Navbar indicator reads from this so users can
 * find their pending transactions after accidentally closing the page.
 *
 * Entries expire automatically after 24 hours.
 * Dispatches a custom 'pendingTxsChanged' browser event on every write so
 * any mounted PendingTxsIndicator re-renders immediately.
 */

export type PendingTxType = 'fill' | 'create' | 'approve' | 'cancel';

export interface PendingTx {
  txid: string;
  type: PendingTxType;
  /** For 'fill' / 'cancel': the offer ID. For 'create': the predicted new offer ID. */
  offerId?: string;
  timestamp: number; // ms since epoch
}

const STORAGE_KEY = 'satoshismarket_pending_txs';
const EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 hours

function readRaw(): PendingTx[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingTx[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(txs: PendingTx[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
    window.dispatchEvent(new Event('pendingTxsChanged'));
  } catch { /* storage quota exceeded or SSR */ }
}

/** Returns all non-expired pending transactions. */
export function getPendingTxs(): PendingTx[] {
  const now = Date.now();
  return readRaw().filter(t => now - t.timestamp < EXPIRE_MS);
}

/** Save a new pending transaction. No-op if the txid already exists (preserves original timestamp). */
export function addPendingTx(tx: Omit<PendingTx, 'timestamp'>): void {
  const existing = getPendingTxs();
  if (existing.some(t => t.txid === tx.txid)) return; // already tracked — keep original timestamp
  writeRaw([...existing, { ...tx, timestamp: Date.now() }]);
}

/** Remove a pending transaction by txid (safe to call even if not present). */
export function removePendingTx(txid: string): void {
  if (!txid) return;
  writeRaw(getPendingTxs().filter(t => t.txid !== txid));
}
