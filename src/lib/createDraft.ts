/**
 * createDraft — localStorage persistence for an in-progress Create Offer flow.
 *
 * Saves the complete form state + transaction phase so the user can close
 * the tab and resume exactly where they left off.
 *
 * Session isolation:
 *   Each browser tab gets a unique session ID stored in sessionStorage.
 *   The draft key is suffixed with this ID so multiple tabs can each maintain
 *   their own independent draft — opening /create in two tabs at once no longer
 *   causes cross-contamination.
 *
 * Lifecycle:
 *   - Saved when the approve tx is broadcast (phase: 'approve_pending')
 *   - Updated when the create tx is broadcast (phase: 'create_pending')
 *   - Cleared when create_confirmed fires or the user resets the form
 *   - Expires automatically after 24 hours
 */

export interface CreateDraftData {
  // Form state
  mode: 'op20' | 'op721';
  tokenAddress: string;
  tokenAmountHuman: string;
  tokenId: string;
  btcValue: string;
  /** Human-readable P2TR address the user entered (opt1p… / bc1p… / tb1p…) */
  payoutAddress: string;
  /** Resolved 0x-prefixed 64-char tweaked pubkey — used directly in createOffer() */
  makerRecipientKey: string;
  allowedTaker: string;
  tokenDecimals: number;
  // Flow state
  phase: 'approve_pending' | 'create_pending';
  approveTxid: string;
  createTxid: string | null;
  predictedOfferId: string | null; // bigint serialised as string
  timestamp: number;
}

const KEY_PREFIX = 'satoshismarket_create_draft';
const EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Returns a session-scoped localStorage key.
 *
 * The session ID lives in sessionStorage (per-tab, cleared when tab closes).
 * This means each open tab has its own isolated draft — no cross-tab overwriting.
 */
function getDraftKey(): string {
  if (typeof window === 'undefined') return KEY_PREFIX;
  try {
    let id = sessionStorage.getItem('satoshismarket_session_id');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('satoshismarket_session_id', id);
    }
    return `${KEY_PREFIX}_${id}`;
  } catch {
    return KEY_PREFIX; // sessionStorage blocked — fall back to shared key
  }
}

export function saveCreateDraft(data: Omit<CreateDraftData, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getDraftKey(), JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch { /* storage quota */ }
}

export function loadCreateDraft(): CreateDraftData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getDraftKey());
    if (!raw) return null;
    const d = JSON.parse(raw) as CreateDraftData;
    if (Date.now() - d.timestamp > EXPIRE_MS) {
      localStorage.removeItem(getDraftKey());
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function clearCreateDraft(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(getDraftKey()); } catch { /* ignore */ }
}
