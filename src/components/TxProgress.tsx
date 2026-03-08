'use client';

/**
 * TxProgress — visual two-step progress panel for the Create Offer flow.
 *
 * Renders:
 *  - A step indicator: Approve → Create → Done
 *  - A detail panel that updates based on the current TxPhase:
 *    idle / simulating / pending (with txid + elapsed) / confirmed / failed
 *
 * All business logic lives in useTxFlow (hook) and the page.
 * This component is purely presentational.
 */

import { useState } from 'react';
import Link from 'next/link';
import { getOpscanTxUrl } from '@/lib/opnet';
import type { TxFlowState } from '@/hooks/useTxFlow';
import { APPROVE_SLOW_S } from '@/hooks/useTxFlow';

interface Props {
  state: TxFlowState;
  mode: 'op20' | 'op721';
  onApprove: () => void;
  onCreate: () => void;
  onReset: () => void;
  onCheckApproveStatus: () => void;
  onCheckCreateStatus: () => void;
  /** Called when create failed before broadcast (wallet rejected / simulation reverted). */
  onRetryCreate: () => void;
  /** Disable Approve / Create buttons (e.g. live validation failure). */
  disabled?: boolean;
}

type StepStatus = 'waiting' | 'active' | 'done' | 'error';

function StepIndicator({ status, label }: { status: StepStatus; label: string }) {
  const dotClass = {
    waiting: 'border border-surface-border text-slate-600',
    active:  'border-2 border-brand',
    done:    'bg-green-600 text-white',
    error:   'bg-red-600 text-white',
  }[status];

  const labelClass = {
    waiting: 'text-slate-500',
    active:  'text-white',
    done:    'text-green-400',
    error:   'text-red-400',
  }[status];

  return (
    <div className="flex items-center gap-2">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${dotClass}`}>
        {status === 'done' && '✓'}
        {status === 'error' && '✗'}
        {status === 'active' && (
          <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse" />
        )}
      </span>
      <span className={`text-xs font-medium ${labelClass}`}>{label}</span>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-slate-400 hover:text-white transition-colors shrink-0"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function TxidRow({ txid }: { txid: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 font-mono min-w-0 truncate" title={txid}>
        {txid.slice(0, 12)}…{txid.slice(-8)}
      </span>
      <CopyButton text={txid} />
      <a
        href={getOpscanTxUrl(txid)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brand hover:underline shrink-0"
      >
        OPScan →
      </a>
    </div>
  );
}

export function TxProgress({ state, mode, onApprove, onCreate, onReset, onCheckApproveStatus, onCheckCreateStatus, onRetryCreate, disabled }: Props) {
  const { phase, approveTxid, createTxid, offerId, error, elapsed } = state;

  const approveStatus = (): StepStatus => {
    if (['approve_confirmed', 'create_simulating', 'create_pending', 'create_confirmed', 'create_failed'].includes(phase)) return 'done';
    if (phase === 'approve_failed') return 'error';
    if (['approve_simulating', 'approve_pending'].includes(phase)) return 'active';
    return 'waiting';
  };

  const createStatus = (): StepStatus => {
    if (phase === 'create_confirmed') return 'done';
    if (phase === 'create_failed') return 'error';
    if (['create_simulating', 'create_pending'].includes(phase)) return 'active';
    return 'waiting';
  };

  const doneStatus: StepStatus = phase === 'create_confirmed' ? 'done' : 'waiting';
  const tokenLabel = mode === 'op20' ? 'tokens' : 'NFT';

  return (
    <div className="rounded-xl border border-surface-border overflow-hidden">

      {/* ── Step header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 bg-surface">
        <StepIndicator status={approveStatus()} label={`Approve ${tokenLabel}`} />
        <div className="flex-1 border-t border-surface-border" />
        <StepIndicator status={createStatus()} label="Create listing" />
        <div className="flex-1 border-t border-surface-border" />
        <StepIndicator status={doneStatus} label="Done" />
      </div>

      {/* ── Detail panel ──────────────────────────────────────────────── */}
      <div className="p-4 space-y-3 border-t border-surface-border">

        {/* idle */}
        {phase === 'idle' && (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={disabled}
              className="btn-secondary text-sm w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Step 1 — Approve {tokenLabel}
            </button>
          </>
        )}

        {/* approve simulating */}
        {phase === 'approve_simulating' && (
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Spinner />
            Preparing approval transaction…
          </div>
        )}

        {/* approve pending */}
        {phase === 'approve_pending' && (
          <>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <Spinner />
              Waiting for on-chain approval state…
            </div>
            {approveTxid && <TxidRow txid={approveTxid} />}
            <p className="text-xs text-slate-500">
              {elapsed > 0 ? `${elapsed}s elapsed · ` : ''}
              Polling every 5 seconds. Advances only when on-chain state is verified.
            </p>
            {elapsed >= APPROVE_SLOW_S && (
              <p className="text-xs text-yellow-500/80">
                This can take a few minutes — please be patient.
              </p>
            )}
            {elapsed >= 600 && (
              <button type="button" onClick={onCheckApproveStatus} className="btn-secondary text-sm w-full">
                Recheck Status
              </button>
            )}
          </>
        )}

        {/* approve failed — wallet rejected (no txid) */}
        {phase === 'approve_failed' && !approveTxid && (
          <>
            <p className="text-sm text-amber-400 break-words">{error}</p>
            <p className="text-xs text-slate-500">
              No transaction was sent. You can adjust your settings and try again.
            </p>
            <button type="button" onClick={onReset} className="btn-secondary text-sm w-full">
              Try Again
            </button>
          </>
        )}

        {/* approve failed — tx was broadcast but confirmation timed out / failed */}
        {phase === 'approve_failed' && approveTxid && (
          <>
            <p className="text-sm text-amber-400 break-words">{error}</p>
            <TxidRow txid={approveTxid} />
            <p className="text-xs text-slate-500">
              If your wallet shows the approval as confirmed, click below to check on-chain status and continue.
            </p>
            <button type="button" onClick={onCheckApproveStatus} className="btn-secondary text-sm w-full">
              Check Status Again
            </button>
          </>
        )}

        {/* approve confirmed → ready for create */}
        {phase === 'approve_confirmed' && (
          <>
            {approveTxid === null ? (
              <p className="text-sm text-green-400 font-medium">
                ✓ Approval sufficient — existing allowance covers this listing
              </p>
            ) : (
              <p className="text-sm text-green-400 font-medium">✓ Approval confirmed</p>
            )}
            {approveTxid && <TxidRow txid={approveTxid} />}
            <button
              type="button"
              onClick={onCreate}
              disabled={disabled}
              className="btn-primary text-sm w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Step 2 — Create Listing →
            </button>
          </>
        )}

        {/* create simulating */}
        {phase === 'create_simulating' && (
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Spinner />
            Preparing listing transaction…
          </div>
        )}

        {/* create pending */}
        {phase === 'create_pending' && (
          <>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <Spinner />
              Listing submitted — waiting for on-chain state…
            </div>
            {createTxid && <TxidRow txid={createTxid} />}
            <p className="text-xs text-slate-500">
              {elapsed > 0 ? `${elapsed}s elapsed · ` : ''}
              Checking every 5 seconds. This can take a few minutes — please be patient.
            </p>
            {elapsed >= 600 && (
              <button type="button" onClick={onCheckCreateStatus} className="btn-secondary text-sm w-full">
                Recheck Status
              </button>
            )}
          </>
        )}

        {/* create failed — wallet rejected or simulation reverted (no txid) */}
        {phase === 'create_failed' && !createTxid && (
          <>
            <p className="text-sm text-amber-400 break-words">{error}</p>
            <p className="text-xs text-slate-500">
              No transaction was sent. Your approval is still valid — you can try creating the listing again.
            </p>
            <button type="button" onClick={onRetryCreate} className="btn-secondary text-sm w-full">
              Try Again
            </button>
          </>
        )}

        {/* create failed — tx was broadcast but confirmation timed out */}
        {phase === 'create_failed' && createTxid && (
          <>
            <p className="text-sm text-amber-400 break-words">{error}</p>
            <TxidRow txid={createTxid} />
            <p className="text-xs text-slate-500">
              If your wallet shows the transaction as confirmed, click below to check if the listing appeared on-chain.
            </p>
            <button type="button" onClick={onCheckCreateStatus} className="btn-secondary text-sm w-full">
              Check Status Again
            </button>
          </>
        )}

        {/* create confirmed */}
        {phase === 'create_confirmed' && offerId !== null && (
          <>
            <p className="text-base font-semibold text-green-400">Listing created!</p>
            <p className="text-sm text-slate-400">
              Listing <span className="text-white font-mono">#{offerId.toString()}</span> is live on-chain.
            </p>
            {createTxid && <TxidRow txid={createTxid} />}
            <p className="text-xs text-slate-500">Redirecting in 2 seconds…</p>
            <Link
              href={`/listing/${offerId.toString()}`}
              className="btn-primary text-sm w-full inline-block text-center"
            >
              View Listing →
            </Link>
          </>
        )}

      </div>
    </div>
  );
}
