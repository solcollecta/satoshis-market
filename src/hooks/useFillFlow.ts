'use client';

/**
 * useFillFlow — single-step transaction state machine for the Fill Offer flow.
 *
 * Phases:
 *   idle → simulating → pending → confirmed | failed
 *
 * Architecture — per-txid isolated polling:
 *   Each submitted txid gets its own entry in `txPollsRef` (Map<txid, FillPollEntry>).
 *   `stopTxIntervals(txid)` clears intervals but keeps the entry so the failed-state
 *   `checkStatus` can still operate. `clearTxPoll(txid)` fully removes on success / reset.
 *
 * Confirmation detection (in order):
 *   1. checkTxConfirmed(txid) — btc_getTransactionReceipt (fast when supported)
 *   2. getOffer(offerId).status === 2 — on-chain offer status fallback
 *
 * Times out after FILL_TIMEOUT_S (30 minutes).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkTxConfirmed, getOffer } from '@/lib/opnet';
import { addPendingTx, removePendingTx } from '@/lib/pendingTxs';

/** Fire-and-forget: save fill txid + seller to DB so all viewers can see it. */
function saveFillTxid(listingId: string, txid: string, seller: string) {
  fetch('/api/fill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId, txid, seller }),
  }).catch(err => console.warn('[saveFillTxid]', err));
}

export type FillPhase = 'idle' | 'simulating' | 'pending' | 'confirmed' | 'failed';

export interface FillFlowState {
  phase: FillPhase;
  txid: string | null;
  error: string | null;
  /** Seconds elapsed since the pending tx was broadcast */
  elapsed: number;
}

const POLL_MS = 5_000;
const FILL_TIMEOUT_S = 1800; // 30 minutes

/** Per-transaction polling state for the fill flow. */
interface FillPollEntry {
  pollId: ReturnType<typeof setInterval> | null;
  tickId: ReturnType<typeof setInterval> | null;
  startTs: number;
}

export function useFillFlow(offerId: bigint, sellerAddress?: string) {
  const [state, setState] = useState<FillFlowState>({
    phase: 'idle',
    txid: null,
    error: null,
    elapsed: 0,
  });

  /** Per-txid polling map — each submitted fill tx has its own isolated entry. */
  const txPollsRef  = useRef<Map<string, FillPollEntry>>(new Map());
  const activeTxidRef = useRef<string | null>(null);

  // Keep offerId + sellerAddress current inside poll closures without causing re-registration.
  const offerIdRef = useRef<bigint>(offerId);
  useEffect(() => { offerIdRef.current = offerId; }, [offerId]);
  const sellerRef = useRef(sellerAddress ?? '');
  useEffect(() => { sellerRef.current = sellerAddress ?? ''; }, [sellerAddress]);

  // ── Interval helpers ────────────────────────────────────────────────────

  /** Stop intervals but keep entry (for failed-state recovery). */
  const stopTxIntervals = useCallback((txid: string) => {
    const entry = txPollsRef.current.get(txid);
    if (!entry) return;
    if (entry.pollId !== null) { clearInterval(entry.pollId); entry.pollId = null; }
    if (entry.tickId !== null) { clearInterval(entry.tickId); entry.tickId = null; }
  }, []);

  /** Stop intervals AND remove entry (success / reset). */
  const clearTxPoll = useCallback((txid: string) => {
    stopTxIntervals(txid);
    txPollsRef.current.delete(txid);
  }, [stopTxIntervals]);

  /** Clear every tracked poll — called on unmount. */
  const clearAllPolls = useCallback(() => {
    for (const entry of txPollsRef.current.values()) {
      if (entry.pollId !== null) clearInterval(entry.pollId);
      if (entry.tickId !== null) clearInterval(entry.tickId);
    }
    txPollsRef.current.clear();
  }, []);

  useEffect(() => () => clearAllPolls(), [clearAllPolls]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const setSimulating = useCallback(() => {
    if (activeTxidRef.current) stopTxIntervals(activeTxidRef.current);
    setState({ phase: 'simulating', txid: null, error: null, elapsed: 0 });
  }, [stopTxIntervals]);

  const setFailed = useCallback((err: string) => {
    // Stop polling but keep entry so checkStatus can still use activeTxidRef.
    if (activeTxidRef.current) stopTxIntervals(activeTxidRef.current);
    setState(s => ({ ...s, phase: 'failed', error: err }));
  }, [stopTxIntervals]);

  const setPending = useCallback((txid: string) => {
    // Discard any previous fill poll.
    if (activeTxidRef.current && activeTxidRef.current !== txid) {
      clearTxPoll(activeTxidRef.current);
    }
    activeTxidRef.current = txid;

    addPendingTx({ type: 'fill', txid, offerId: offerIdRef.current.toString() });
    setState({ phase: 'pending', txid, error: null, elapsed: 0 });

    // Persist txid + seller to DB so all viewers can see it + seller gets notified
    saveFillTxid(offerIdRef.current.toString(), txid, sellerRef.current);

    const entry: FillPollEntry = {
      pollId: null,
      tickId: null,
      startTs: Date.now(),
    };
    txPollsRef.current.set(txid, entry);

    // Tick: update elapsed every second.
    entry.tickId = setInterval(() => {
      const e = txPollsRef.current.get(txid);
      if (!e || e.tickId === null) return;
      setState(s => {
        if (s.txid !== txid) return s;
        return { ...s, elapsed: Math.floor((Date.now() - e.startTs) / 1000) };
      });
    }, 1000);

    // Poll: check receipt then offer status.
    entry.pollId = setInterval(async () => {
      const e = txPollsRef.current.get(txid);
      if (!e || e.pollId === null) return;

      const elapsedS = Math.floor((Date.now() - e.startTs) / 1000);

      if (elapsedS >= FILL_TIMEOUT_S) {
        clearTxPoll(txid);
        if (activeTxidRef.current === txid) activeTxidRef.current = null;
        setState(s => {
          if (s.txid !== txid) return s;
          return {
            ...s,
            phase: 'failed',
            error: `Still waiting after 30 minutes. Your transaction may still confirm — check the explorer for txid: ${txid}`,
          };
        });
        return;
      }

      // Fast path: receipt-based confirmation.
      const receiptOk = await checkTxConfirmed(txid);
      if (!txPollsRef.current.get(txid)?.pollId) return;

      if (receiptOk === true) {
        clearTxPoll(txid);
        if (activeTxidRef.current === txid) activeTxidRef.current = null;
        removePendingTx(txid);

        setState(s => {
          if (s.txid !== txid) return s;
          return { ...s, phase: 'confirmed' };
        });
        return;
      }

      // Fallback: poll offer status (status 2 = Filled).
      try {
        const offer = await getOffer(offerIdRef.current);
        if (!txPollsRef.current.get(txid)?.pollId) return;
        if (offer !== null && offer.status === 2) {
          clearTxPoll(txid);
          if (activeTxidRef.current === txid) activeTxidRef.current = null;
          removePendingTx(txid);
  
          setState(s => {
            if (s.txid !== txid) return s;
            return { ...s, phase: 'confirmed' };
          });
        }
      } catch { /* still pending — keep polling */ }
    }, POLL_MS);
  }, [clearTxPoll]);

  /**
   * One-shot manual recheck — safe to call from both pending and failed states.
   * Checks receipt first, then offer status. Advances to confirmed if either passes.
   * Clears the poll interval on success so it stops running.
   */
  const checkStatus = useCallback(async () => {
    const txid = activeTxidRef.current;
    if (!txid) return;

    const receiptOk = await checkTxConfirmed(txid).catch(() => false);
    if (receiptOk === true) {
      clearTxPoll(txid);
      if (activeTxidRef.current === txid) activeTxidRef.current = null;
      removePendingTx(txid);
      setState(s => {
        if (s.txid !== txid) return s;
        return { ...s, phase: 'confirmed' };
      });
      return;
    }

    try {
      const offer = await getOffer(offerIdRef.current);
      if (offer !== null && offer.status === 2) {
        clearTxPoll(txid);
        if (activeTxidRef.current === txid) activeTxidRef.current = null;
        removePendingTx(txid);

        setState(s => {
          if (s.txid !== txid) return s;
          return { ...s, phase: 'confirmed' };
        });
      }
    } catch { /* still not confirmed */ }
  }, [clearTxPoll]);

  const reset = useCallback(() => {
    if (activeTxidRef.current) {
      clearTxPoll(activeTxidRef.current);
      removePendingTx(activeTxidRef.current);
      activeTxidRef.current = null;
    }
    setState({ phase: 'idle', txid: null, error: null, elapsed: 0 });
  }, [clearTxPoll]);

  return { state, setSimulating, setPending, setFailed, checkStatus, reset };
}
