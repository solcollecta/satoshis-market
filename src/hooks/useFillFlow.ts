'use client';

/**
 * useFillFlow — single-step transaction state machine for the Fill Offer flow.
 *
 * Phases:
 *   idle → simulating → pending → confirmed | failed
 *
 * Confirmation detection (in order):
 *   1. checkTxConfirmed(txid) — btc_getTransactionReceipt (fast when supported)
 *   2. getOffer(offerId).status === 2 — on-chain offer status fallback
 *
 * Times out after FILL_TIMEOUT_S seconds.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkTxConfirmed, getOffer } from '@/lib/opnet';

export type FillPhase = 'idle' | 'simulating' | 'pending' | 'confirmed' | 'failed';

export interface FillFlowState {
  phase: FillPhase;
  txid: string | null;
  error: string | null;
  /** Seconds elapsed since the pending tx was broadcast */
  elapsed: number;
}

const POLL_MS = 5_000;
const FILL_TIMEOUT_S = 300; // 5 minutes

export function useFillFlow(offerId: bigint) {
  const [state, setState] = useState<FillFlowState>({
    phase: 'idle',
    txid: null,
    error: null,
    elapsed: 0,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef(0);
  const currentTxidRef = useRef('');
  // Store offerId in ref so the poll closure always sees the latest value
  const offerIdRef = useRef<bigint>(offerId);
  useEffect(() => { offerIdRef.current = offerId; }, [offerId]);

  const clearTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const startCountdown = useCallback(() => {
    startTsRef.current = Date.now();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setState(s => ({ ...s, elapsed: Math.floor((Date.now() - startTsRef.current) / 1000) }));
    }, 1000);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const setSimulating = useCallback(() => {
    clearTimers();
    setState({ phase: 'simulating', txid: null, error: null, elapsed: 0 });
  }, [clearTimers]);

  const setFailed = useCallback((err: string) => {
    clearTimers();
    setState(s => ({ ...s, phase: 'failed', error: err }));
  }, [clearTimers]);

  const setPending = useCallback((txid: string) => {
    clearTimers();
    currentTxidRef.current = txid;
    setState({ phase: 'pending', txid, error: null, elapsed: 0 });
    startCountdown();

    pollRef.current = setInterval(async () => {
      const elapsedS = Math.floor((Date.now() - startTsRef.current) / 1000);
      if (elapsedS >= FILL_TIMEOUT_S) {
        clearTimers();
        setState(s => ({
          ...s,
          phase: 'failed',
          error: `Timed out after ${FILL_TIMEOUT_S}s. Check the explorer for txid: ${currentTxidRef.current}`,
        }));
        return;
      }

      // Fast path: receipt-based confirmation
      const receiptOk = await checkTxConfirmed(currentTxidRef.current);
      if (receiptOk) {
        clearTimers();
        setState(s => ({ ...s, phase: 'confirmed' }));
        return;
      }

      // Fallback: poll offer status (status 2 = Filled)
      try {
        const offer = await getOffer(offerIdRef.current);
        if (offer !== null && offer.status === 2) {
          clearTimers();
          setState(s => ({ ...s, phase: 'confirmed' }));
        }
      } catch { /* still pending — keep polling */ }
    }, POLL_MS);
  }, [clearTimers, startCountdown]);

  const reset = useCallback(() => {
    clearTimers();
    setState({ phase: 'idle', txid: null, error: null, elapsed: 0 });
  }, [clearTimers]);

  return { state, setSimulating, setPending, setFailed, reset };
}
