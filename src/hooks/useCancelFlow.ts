'use client';

/**
 * useCancelFlow — single-step transaction state machine for the Cancel Offer flow.
 *
 * Phases:
 *   idle → submitting → pending → confirmed | failed
 *
 * Confirmation detection (in order):
 *   1. checkTxConfirmed(txid) — btc_getTransactionReceipt via /api/opnet-rpc proxy
 *   2. getOffer(offerId).status === 3 — on-chain offer state fallback
 *      (critical: if receipt endpoint is unreliable, state check still confirms)
 *
 * "Recheck Status" is available in both pending and failed phases.
 * Times out after CANCEL_TIMEOUT_S (30 minutes).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkTxConfirmed, getOffer } from '@/lib/opnet';
import { addPendingTx, removePendingTx } from '@/lib/pendingTxs';

export type CancelPhase = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'failed';

export interface CancelFlowState {
  phase: CancelPhase;
  txid: string | null;
  error: string | null;
  /** Seconds elapsed since the pending tx was broadcast */
  elapsed: number;
}

const POLL_MS = 5_000;
const CANCEL_TIMEOUT_S = 1800; // 30 minutes

interface CancelPollEntry {
  pollId: ReturnType<typeof setInterval> | null;
  tickId: ReturnType<typeof setInterval> | null;
  startTs: number;
}

export function useCancelFlow(offerId: bigint) {
  const [state, setState] = useState<CancelFlowState>({
    phase: 'idle',
    txid: null,
    error: null,
    elapsed: 0,
  });

  const txPollsRef    = useRef<Map<string, CancelPollEntry>>(new Map());
  const activeTxidRef = useRef<string | null>(null);

  // Keep offerId current inside poll closures without re-registering intervals.
  const offerIdRef = useRef<bigint>(offerId);
  useEffect(() => { offerIdRef.current = offerId; }, [offerId]);

  // ── Interval helpers ────────────────────────────────────────────────────────

  const stopTxIntervals = useCallback((txid: string) => {
    const entry = txPollsRef.current.get(txid);
    if (!entry) return;
    if (entry.pollId !== null) { clearInterval(entry.pollId); entry.pollId = null; }
    if (entry.tickId !== null) { clearInterval(entry.tickId); entry.tickId = null; }
  }, []);

  const clearTxPoll = useCallback((txid: string) => {
    stopTxIntervals(txid);
    txPollsRef.current.delete(txid);
  }, [stopTxIntervals]);

  const clearAllPolls = useCallback(() => {
    for (const entry of txPollsRef.current.values()) {
      if (entry.pollId !== null) clearInterval(entry.pollId);
      if (entry.tickId !== null) clearInterval(entry.tickId);
    }
    txPollsRef.current.clear();
  }, []);

  useEffect(() => () => clearAllPolls(), [clearAllPolls]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Called before broadcasting — shows wallet confirmation spinner. */
  const setSubmitting = useCallback(() => {
    if (activeTxidRef.current) stopTxIntervals(activeTxidRef.current);
    setState({ phase: 'submitting', txid: null, error: null, elapsed: 0 });
  }, [stopTxIntervals]);

  const setFailed = useCallback((err: string) => {
    if (activeTxidRef.current) stopTxIntervals(activeTxidRef.current);
    setState(s => ({ ...s, phase: 'failed', error: err }));
  }, [stopTxIntervals]);

  /**
   * Called once the cancel tx is broadcast. Starts polling for confirmation.
   * Polling checks receipt first, then offer.status === 3 as fallback.
   */
  const setPending = useCallback((txid: string) => {
    if (activeTxidRef.current && activeTxidRef.current !== txid) {
      clearTxPoll(activeTxidRef.current);
    }
    activeTxidRef.current = txid;

    addPendingTx({ type: 'cancel', txid, offerId: offerIdRef.current.toString() });
    setState({ phase: 'pending', txid, error: null, elapsed: 0 });

    const entry: CancelPollEntry = {
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

    // Poll: receipt → offer-state fallback.
    entry.pollId = setInterval(async () => {
      const e = txPollsRef.current.get(txid);
      if (!e || e.pollId === null) return;

      const elapsedS = Math.floor((Date.now() - e.startTs) / 1000);

      if (elapsedS >= CANCEL_TIMEOUT_S) {
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

      // Fallback: offer state (status 3 = Cancelled).
      try {
        const offer = await getOffer(offerIdRef.current);
        if (!txPollsRef.current.get(txid)?.pollId) return;
        if (offer !== null && offer.status === 3) {
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
   * Checks receipt, then offer state. Advances to confirmed if either passes.
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
      if (offer !== null && offer.status === 3) {
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

  return { state, setSubmitting, setPending, setFailed, checkStatus, reset };
}
