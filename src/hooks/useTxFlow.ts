'use client';

/**
 * useTxFlow — two-step transaction state machine for the Create Offer flow.
 *
 * Phases:
 *   idle → approve_simulating → approve_pending → approve_confirmed
 *        → create_simulating  → create_pending  → create_confirmed
 *
 * Architecture — per-txid isolated polling:
 *   Each submitted txid gets its own entry in `txPollsRef` (Map<txid, TxPollEntry>).
 *   Stopping or resetting one transaction never affects another in-flight transaction.
 *   `stopTxIntervals(txid)` clears intervals but keeps the entry so failed-state
 *   recovery (checkApproveStatus / checkCreateStatus) can still read confirmFn /
 *   predictedOfferId. `clearTxPoll(txid)` fully removes the entry on success or reset.
 *
 * Approve polling (two modes):
 *   - confirmFn provided (OP-20 and OP-721): polls confirmFn() every POLL_MS as the
 *     PRIMARY and ONLY signal. Receipt alone CANNOT advance to approve_confirmed.
 *     green = on-chain truth, nothing else.
 *   - no confirmFn: receipt-only, auto-advances after APPROVE_AUTO_S seconds.
 *
 * Create polling:
 *   Calls getOffer(predictedOfferId) every POLL_MS until the offer appears on-chain.
 *   Times out after CREATE_TIMEOUT_S (30 minutes).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOffer, checkTxConfirmed } from '@/lib/opnet';
import { addPendingTx, removePendingTx } from '@/lib/pendingTxs';

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
/** After this many seconds with no receipt, show "taking longer than usual" in the UI. */
export const APPROVE_SLOW_S = 90;
const CREATE_TIMEOUT_S = 1800; // 30 minutes

/** Per-transaction polling state — one entry per submitted txid. */
interface TxPollEntry {
  pollId: ReturnType<typeof setInterval> | null;
  tickId: ReturnType<typeof setInterval> | null;
  startTs: number;
  /** OP-20 approve: allowance-check predicate. null for OP-721 / create phase. */
  confirmFn: (() => Promise<boolean>) | null;
  /** Create phase only: predicted offer ID from simulation output. */
  predictedOfferId: bigint | null;
}

export function useTxFlow() {
  const [state, setState] = useState<TxFlowState>({
    phase: 'idle',
    approveTxid: null,
    createTxid: null,
    offerId: null,
    error: null,
    elapsed: 0,
  });

  /**
   * Per-txid polling map.
   * Each in-flight transaction has its own isolated entry.
   * Entries are stopped-but-kept on failure (for recovery reads),
   * and fully removed on success or reset.
   */
  const txPollsRef = useRef<Map<string, TxPollEntry>>(new Map());

  /** Which txid is currently the "active" approve / create for this component. */
  const activeApproveRef = useRef<string | null>(null);
  const activeCreateRef  = useRef<string | null>(null);

  // ── Interval helpers ──────────────────────────────────────────────────────

  /** Stop intervals for a txid but keep the Map entry (for failed-state recovery). */
  const stopTxIntervals = useCallback((txid: string) => {
    const entry = txPollsRef.current.get(txid);
    if (!entry) return;
    if (entry.pollId !== null) { clearInterval(entry.pollId); entry.pollId = null; }
    if (entry.tickId !== null) { clearInterval(entry.tickId); entry.tickId = null; }
  }, []);

  /** Stop intervals AND remove the Map entry (success / reset). */
  const clearTxPoll = useCallback((txid: string) => {
    stopTxIntervals(txid);
    txPollsRef.current.delete(txid);
  }, [stopTxIntervals]);

  /** Clear every tracked poll — called on component unmount. */
  const clearAllPolls = useCallback(() => {
    for (const entry of txPollsRef.current.values()) {
      if (entry.pollId !== null) clearInterval(entry.pollId);
      if (entry.tickId !== null) clearInterval(entry.tickId);
    }
    txPollsRef.current.clear();
  }, []);

  useEffect(() => () => clearAllPolls(), [clearAllPolls]);

  // ── Approve phase ─────────────────────────────────────────────────────────

  const setApproveSimulating = useCallback(() => {
    if (activeApproveRef.current) stopTxIntervals(activeApproveRef.current);
    setState(s => ({ ...s, phase: 'approve_simulating', error: null, elapsed: 0 }));
  }, [stopTxIntervals]);

  const setApproveFailed = useCallback((err: string) => {
    // Stop polling but keep entry so checkApproveStatus can still read confirmFn.
    if (activeApproveRef.current) stopTxIntervals(activeApproveRef.current);
    setState(s => ({ ...s, phase: 'approve_failed', error: err }));
  }, [stopTxIntervals]);

  /**
   * Transition to approve_pending and start isolated polling for this txid.
   *
   * @param txid       The broadcast transaction hash.
   * @param confirmFn  Optional async predicate that returns true when the
   *                   approve is provably on-chain (e.g. allowance >= required).
   *                   When provided, auto-advance timeout is disabled.
   */
  const setApprovePending = useCallback((
    txid: string,
    confirmFn?: () => Promise<boolean>,
  ) => {
    // Discard any previous approve poll (shouldn't normally happen, but be safe).
    if (activeApproveRef.current && activeApproveRef.current !== txid) {
      clearTxPoll(activeApproveRef.current);
    }
    activeApproveRef.current = txid;

    addPendingTx({ type: 'approve', txid });
    setState(s => ({ ...s, phase: 'approve_pending', approveTxid: txid, elapsed: 0 }));

    const entry: TxPollEntry = {
      pollId: null,
      tickId: null,
      startTs: Date.now(),
      confirmFn: confirmFn ?? null,
      predictedOfferId: null,
    };
    txPollsRef.current.set(txid, entry);

    // Tick: update elapsed every second.
    entry.tickId = setInterval(() => {
      const e = txPollsRef.current.get(txid);
      if (!e || e.tickId === null) return;
      setState(s => {
        if (s.approveTxid !== txid) return s;
        return { ...s, elapsed: Math.floor((Date.now() - e.startTs) / 1000) };
      });
    }, 1000);

    // Poll: check on-chain state every POLL_MS.
    entry.pollId = setInterval(async () => {
      const e = txPollsRef.current.get(txid);
      if (!e || e.pollId === null) return; // stopped (e.g. mid-await when clearTxPoll was called)

      const elapsedS = Math.floor((Date.now() - e.startTs) / 1000);

      // When confirmFn exists: it is the SOLE arbiter of approval.
      // Receipt alone MUST NOT advance state — a receipt only proves the tx landed,
      // not that the on-chain approval state (allowance / NFT approved) is correct.
      if (e.confirmFn) {
        try {
          const onChain = await e.confirmFn();
          // Guard: check the poll wasn't stopped while we were awaiting.
          if (!txPollsRef.current.get(txid)?.pollId) return;
          if (onChain) {
            clearTxPoll(txid);
            if (activeApproveRef.current === txid) activeApproveRef.current = null;
            removePendingTx(txid);
            console.log('[useTxFlow] → approve_confirmed', {
              path: 'confirmFn',
              txid,
              confirmFnPresent: true,
              receiptChecked: false,
              elapsed: elapsedS,
            });
            setState(s => {
              if (s.approveTxid !== txid) return s;
              return { ...s, phase: 'approve_confirmed' };
            });
          }
        } catch { /* keep polling */ }
        // confirmFn path ends here — NEVER fall through to receipt check.
        return;
      }

      // No confirmFn: receipt is the only signal. No auto-advance on timeout —
      // confirmed must be on-chain truth (receipt), never time-based.
      const receiptOk = await checkTxConfirmed(txid).catch(() => false);
      if (!txPollsRef.current.get(txid)?.pollId) return;

      if (receiptOk === true) {
        clearTxPoll(txid);
        if (activeApproveRef.current === txid) activeApproveRef.current = null;
        removePendingTx(txid);
        console.log('[useTxFlow] → approve_confirmed', {
          path: 'receipt',
          txid,
          confirmFnPresent: false,
          receiptOk: true,
          elapsed: elapsedS,
        });
        setState(s => {
          if (s.approveTxid !== txid) return s;
          return { ...s, phase: 'approve_confirmed' };
        });
      }
    }, POLL_MS);
  }, [clearTxPoll]);

  /**
   * Transition directly to approve_confirmed without sending an approve tx.
   * Used when a pre-check shows the existing on-chain allowance is already >= required.
   * Only transitions from idle or approve_failed — never overrides an in-flight tx.
   */
  const setApproveSufficient = useCallback(() => {
    setState(s => {
      if (!['idle', 'approve_failed'].includes(s.phase)) return s;
      return { ...s, phase: 'approve_confirmed', approveTxid: null, error: null };
    });
  }, []);

  // ── Create phase ──────────────────────────────────────────────────────────

  const setCreateSimulating = useCallback(() => {
    if (activeCreateRef.current) stopTxIntervals(activeCreateRef.current);
    setState(s => ({ ...s, phase: 'create_simulating', error: null, elapsed: 0 }));
  }, [stopTxIntervals]);

  const setCreateFailed = useCallback((err: string) => {
    // Stop polling but keep entry so checkCreateStatus can still read predictedOfferId.
    if (activeCreateRef.current) stopTxIntervals(activeCreateRef.current);
    setState(s => ({ ...s, phase: 'create_failed', error: err }));
  }, [stopTxIntervals]);

  const setCreatePending = useCallback((txid: string, predictedOfferId: bigint) => {
    // Approve is complete — clear its poll and remove from pending indicator.
    if (activeApproveRef.current) {
      clearTxPoll(activeApproveRef.current);
      removePendingTx(activeApproveRef.current);
      activeApproveRef.current = null;
    }

    // Discard any previous create poll.
    if (activeCreateRef.current && activeCreateRef.current !== txid) {
      clearTxPoll(activeCreateRef.current);
    }
    activeCreateRef.current = txid;

    addPendingTx({ type: 'create', txid, offerId: predictedOfferId.toString() });
    setState(s => ({ ...s, phase: 'create_pending', createTxid: txid, elapsed: 0 }));

    const entry: TxPollEntry = {
      pollId: null,
      tickId: null,
      startTs: Date.now(),
      confirmFn: null,
      predictedOfferId,
    };
    txPollsRef.current.set(txid, entry);

    // Tick.
    entry.tickId = setInterval(() => {
      const e = txPollsRef.current.get(txid);
      if (!e || e.tickId === null) return;
      setState(s => {
        if (s.createTxid !== txid) return s;
        return { ...s, elapsed: Math.floor((Date.now() - e.startTs) / 1000) };
      });
    }, 1000);

    // Poll: wait for the predicted offer to appear on-chain.
    entry.pollId = setInterval(async () => {
      const e = txPollsRef.current.get(txid);
      if (!e || e.pollId === null) return;

      const elapsedS = Math.floor((Date.now() - e.startTs) / 1000);

      if (elapsedS >= CREATE_TIMEOUT_S) {
        clearTxPoll(txid);
        if (activeCreateRef.current === txid) activeCreateRef.current = null;
        setState(s => {
          if (s.createTxid !== txid) return s;
          return {
            ...s,
            phase: 'create_failed',
            error: `Still waiting after 30 minutes. Your transaction may still confirm — check the explorer for txid: ${txid}`,
          };
        });
        return;
      }

      try {
        const offer = await getOffer(e.predictedOfferId!);
        if (!txPollsRef.current.get(txid)?.pollId) return;
        if (offer !== null) {
          const pid = e.predictedOfferId;
          clearTxPoll(txid);
          if (activeCreateRef.current === txid) activeCreateRef.current = null;
          removePendingTx(txid);
          setState(s => {
            if (s.createTxid !== txid) return s;
            return { ...s, phase: 'create_confirmed', offerId: pid };
          });
        }
      } catch { /* still pending — keep polling */ }
    }, POLL_MS);
  }, [clearTxPoll]);

  // ── Manual status checks ("Check Status Again" button) ───────────────────

  /**
   * One-shot approve status check — safe to call from approve_failed.
   * Uses the stored confirmFn if available, otherwise falls back to receipt.
   */
  const checkApproveStatus = useCallback(async () => {
    const txid = activeApproveRef.current;
    if (!txid) return;
    // Entry may have intervals stopped (failed state) but confirmFn is still readable.
    const entry = txPollsRef.current.get(txid);

    // When confirmFn exists: it is the SOLE arbiter — do NOT fall back to receipt.
    if (entry?.confirmFn) {
      try {
        const onChain = await entry.confirmFn();
        if (onChain) {
          removePendingTx(txid);
          console.log('[useTxFlow] checkApproveStatus → approve_confirmed', {
            path: 'confirmFn',
            txid,
          });
          setState(s => {
            if (s.approveTxid !== txid) return s;
            return { ...s, phase: 'approve_confirmed' };
          });
        }
      } catch { /* not confirmed yet — no state change */ }
      return; // never fall through to receipt when confirmFn exists
    }

    const receiptOk = await checkTxConfirmed(txid).catch(() => false);
    if (receiptOk === true) {
      removePendingTx(txid);
      console.log('[useTxFlow] checkApproveStatus → approve_confirmed', {
        path: 'receipt',
        txid,
      });
      setState(s => {
        if (s.approveTxid !== txid) return s;
        return { ...s, phase: 'approve_confirmed' };
      });
    }
  }, []);

  /**
   * One-shot create status check — safe to call from both create_pending and create_failed.
   * Checks if the predicted offer already exists on-chain.
   * Clears the poll interval on success so it stops running.
   */
  const checkCreateStatus = useCallback(async () => {
    const txid = activeCreateRef.current;
    if (!txid) return;
    const entry = txPollsRef.current.get(txid);
    if (!entry?.predictedOfferId) return;

    try {
      const offer = await getOffer(entry.predictedOfferId);
      if (offer !== null) {
        const pid = entry.predictedOfferId;
        clearTxPoll(txid);
        if (activeCreateRef.current === txid) activeCreateRef.current = null;
        removePendingTx(txid);
        setState(s => {
          if (s.createTxid !== txid) return s;
          return { ...s, phase: 'create_confirmed', offerId: pid };
        });
      }
    } catch { /* still pending */ }
  }, [clearTxPoll]);

  // ── Retry (no-broadcast failures) ────────────────────────────────────────

  /**
   * Go back to approve_confirmed without re-approving.
   * Called when the create tx was never broadcast (wallet rejected, simulation
   * reverted) — the approval is still valid so the user just retries create.
   */
  const retryCreate = useCallback(() => {
    if (activeCreateRef.current) {
      clearTxPoll(activeCreateRef.current);
      removePendingTx(activeCreateRef.current);
      activeCreateRef.current = null;
    }
    setState(s => ({ ...s, phase: 'approve_confirmed', createTxid: null, error: null, elapsed: 0 }));
  }, [clearTxPoll]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    // Only stop THIS component's active txids — never touches unrelated entries.
    if (activeApproveRef.current) {
      clearTxPoll(activeApproveRef.current);
      removePendingTx(activeApproveRef.current);
      activeApproveRef.current = null;
    }
    if (activeCreateRef.current) {
      clearTxPoll(activeCreateRef.current);
      removePendingTx(activeCreateRef.current);
      activeCreateRef.current = null;
    }
    setState({ phase: 'idle', approveTxid: null, createTxid: null, offerId: null, error: null, elapsed: 0 });
  }, [clearTxPoll]);

  return {
    state,
    setApproveSimulating,
    setApproveFailed,
    setApprovePending,
    setApproveSufficient,
    setCreateSimulating,
    setCreateFailed,
    setCreatePending,
    checkApproveStatus,
    checkCreateStatus,
    retryCreate,
    reset,
  };
}
