'use client';

/**
 * useTxFlow — two-step transaction state machine for the Create Offer flow.
 *
 * Phases:
 *   idle → approve_simulating → approve_pending → approve_confirmed
 *        → create_simulating  → create_pending  → create_confirmed
 *
 * Approve polling (two modes):
 *   - confirmFn provided (OP-20): polls confirmFn() every POLL_MS as the primary
 *     signal (e.g. allowance(owner,spender) >= required). Also checks receipt as
 *     a secondary fast path. NO auto-advance timeout — only real on-chain state
 *     drives confirmation, eliminating premature green state.
 *   - no confirmFn (OP-721 / unknown): receipt-only, auto-advances after
 *     APPROVE_AUTO_S seconds as a last resort.
 *
 * Create polling:
 *   Calls getOffer(predictedOfferId) every POLL_MS until the offer appears on-chain.
 *   The predicted offerId comes from the simulation's decoded output — deterministic
 *   on a non-congested network. Times out after CREATE_TIMEOUT_S.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOffer, checkTxConfirmed } from '@/lib/opnet';

export type TxPhase =
  | 'idle'
  | 'approve_simulating'
  | 'approve_pending'
  | 'approve_confirmed'
  | 'approve_failed'
  | 'create_simulating'
  | 'create_pending'
  | 'create_confirmed'
  | 'create_failed';

export interface TxFlowState {
  phase: TxPhase;
  approveTxid: string | null;
  createTxid: string | null;
  offerId: bigint | null;
  error: string | null;
  /** Seconds elapsed since the current pending tx was submitted */
  elapsed: number;
}

const POLL_MS = 5_000;
const APPROVE_AUTO_S = 90; // auto-advance approve after this many seconds
const CREATE_TIMEOUT_S = 300; // give up polling create after 5 minutes

export function useTxFlow() {
  const [state, setState] = useState<TxFlowState>({
    phase: 'idle',
    approveTxid: null,
    createTxid: null,
    offerId: null,
    error: null,
    elapsed: 0,
  });

  // Stable refs — never cause re-renders or stale closures
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef(0);
  const currentTxidRef = useRef('');
  const predictedOfferIdRef = useRef<bigint | null>(null);
  /** Optional on-chain confirmation check (e.g. allowance check for OP-20 approvals). */
  const confirmFnRef = useRef<(() => Promise<boolean>) | null>(null);

  const clearTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // Tick every second to update elapsed display
  const startCountdown = useCallback(() => {
    startTsRef.current = Date.now();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setState(s => ({ ...s, elapsed: Math.floor((Date.now() - startTsRef.current) / 1000) }));
    }, 1000);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  // ── Approve phase actions ────────────────────────────────────────────────

  const setApproveSimulating = useCallback(() => {
    clearTimers();
    setState(s => ({ ...s, phase: 'approve_simulating', error: null, elapsed: 0 }));
  }, [clearTimers]);

  const setApproveFailed = useCallback((err: string) => {
    clearTimers();
    setState(s => ({ ...s, phase: 'approve_failed', error: err }));
  }, [clearTimers]);

  /**
   * Transition to approve_pending and start polling for confirmation.
   *
   * @param txid       The broadcast transaction hash.
   * @param confirmFn  Optional async predicate that returns true when the
   *                   approve is provably on-chain (e.g. allowance check).
   *                   When provided, this is the primary confirmation signal
   *                   and the auto-advance timeout is disabled so the UI never
   *                   turns green before the allowance is actually updated.
   */
  const setApprovePending = useCallback((
    txid: string,
    confirmFn?: () => Promise<boolean>,
  ) => {
    clearTimers();
    currentTxidRef.current = txid;
    confirmFnRef.current = confirmFn ?? null;
    setState(s => ({ ...s, phase: 'approve_pending', approveTxid: txid, elapsed: 0 }));
    startCountdown();
    pollRef.current = setInterval(async () => {
      const elapsedS = Math.floor((Date.now() - startTsRef.current) / 1000);

      // Primary: custom on-chain confirmation (e.g. allowance check)
      if (confirmFnRef.current) {
        try {
          const onChain = await confirmFnRef.current();
          if (onChain) {
            clearTimers();
            setState(s => ({ ...s, phase: 'approve_confirmed' }));
            return;
          }
        } catch { /* keep polling */ }
      }

      // Secondary: receipt-based fast path (also works as sole signal for NFT)
      const receiptOk = await checkTxConfirmed(currentTxidRef.current);

      // Auto-advance only when no confirmFn is provided (NFT path) and timed out.
      // When confirmFn is present the receipt alone is not enough — the allowance
      // must actually be reflected on-chain before we advance.
      if (receiptOk || (!confirmFnRef.current && elapsedS >= APPROVE_AUTO_S)) {
        clearTimers();
        setState(s => ({ ...s, phase: 'approve_confirmed' }));
      }
    }, POLL_MS);
  }, [clearTimers, startCountdown]);

  /** Manual "I confirmed it, skip the wait" button */
  const forceApproveConfirmed = useCallback(() => {
    clearTimers();
    setState(s => ({ ...s, phase: 'approve_confirmed' }));
  }, [clearTimers]);

  // ── Create phase actions ─────────────────────────────────────────────────

  const setCreateSimulating = useCallback(() => {
    clearTimers();
    setState(s => ({ ...s, phase: 'create_simulating', error: null, elapsed: 0 }));
  }, [clearTimers]);

  const setCreateFailed = useCallback((err: string) => {
    clearTimers();
    setState(s => ({ ...s, phase: 'create_failed', error: err }));
  }, [clearTimers]);

  const setCreatePending = useCallback((txid: string, predictedOfferId: bigint) => {
    clearTimers();
    currentTxidRef.current = txid;
    predictedOfferIdRef.current = predictedOfferId;
    setState(s => ({ ...s, phase: 'create_pending', createTxid: txid, elapsed: 0 }));
    startCountdown();
    pollRef.current = setInterval(async () => {
      const elapsedS = Math.floor((Date.now() - startTsRef.current) / 1000);
      if (elapsedS >= CREATE_TIMEOUT_S) {
        clearTimers();
        setState(s => ({
          ...s,
          phase: 'create_failed',
          error: `Timed out after ${CREATE_TIMEOUT_S}s. Check the explorer for txid: ${currentTxidRef.current}`,
        }));
        return;
      }
      try {
        const offer = await getOffer(predictedOfferIdRef.current!);
        if (offer !== null) {
          clearTimers();
          setState(s => ({ ...s, phase: 'create_confirmed', offerId: predictedOfferIdRef.current }));
        }
      } catch { /* still pending — keep polling */ }
    }, POLL_MS);
  }, [clearTimers, startCountdown]);

  // ── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    clearTimers();
    confirmFnRef.current = null;
    setState({ phase: 'idle', approveTxid: null, createTxid: null, offerId: null, error: null, elapsed: 0 });
  }, [clearTimers]);

  return {
    state,
    setApproveSimulating,
    setApproveFailed,
    setApprovePending,
    forceApproveConfirmed,
    setCreateSimulating,
    setCreateFailed,
    setCreatePending,
    reset,
  };
}
