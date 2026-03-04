'use client';

/**
 * CancelProgress — visual status panel for the Cancel Offer single-step flow.
 *
 * Phases rendered:
 *   submitting → "Confirm in wallet…" spinner
 *   pending    → spinner + "Submitted" label + txid + Recheck button + elapsed
 *   confirmed  → green check + "Listing cancelled — state verified" + txid
 *   failed     → amber error + txid (if broadcast) + Recheck button
 *
 * Purely presentational — no business logic.
 */

import Link from 'next/link';
import { useState } from 'react';
import { getOpscanTxUrl } from '@/lib/opnet';
import type { CancelFlowState } from '@/hooks/useCancelFlow';

interface Props {
  state: CancelFlowState;
  onCheckStatus: () => void;
  onReset: () => void;
}

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      className="text-xs text-slate-400 hover:text-white transition-colors shrink-0"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function TxRow({ txid }: { txid: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 font-mono flex-1 min-w-0 truncate">
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

export function CancelProgress({ state, onCheckStatus, onReset }: Props) {
  const { phase, txid, error, elapsed } = state;

  return (
    <div className="space-y-3">

      {/* submitting — wallet confirmation pending */}
      {phase === 'submitting' && (
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Spinner />
          Confirm cancellation in wallet…
        </div>
      )}

      {/* pending — tx broadcast, waiting for on-chain confirmation */}
      {phase === 'pending' && (
        <>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Spinner />
            Cancellation submitted — waiting for on-chain confirmation…
          </div>
          {txid && (
            <div className="bg-surface rounded-lg px-3 py-2 border border-surface-border">
              <p className="text-xs text-slate-400 font-medium mb-0.5">Transaction submitted</p>
              <TxRow txid={txid} />
            </div>
          )}
          <p className="text-xs text-slate-500">
            {elapsed > 0 ? `${elapsed}s elapsed · ` : ''}
            Checking every 5 seconds. This can take a few minutes — please be patient.
          </p>
          <button type="button" onClick={onCheckStatus} className="btn-secondary text-sm w-full">
            Recheck Status
          </button>
        </>
      )}

      {/* confirmed — state verified on-chain */}
      {phase === 'confirmed' && (
        <>
          <div className="flex items-center gap-2 text-green-400">
            <span className="text-lg leading-none">✓</span>
            <p className="text-sm font-semibold">Listing cancelled — state verified on-chain.</p>
          </div>
          {txid && (
            <div className="bg-surface rounded-lg px-3 py-2 border border-surface-border">
              <TxRow txid={txid} />
            </div>
          )}
          <Link href="/assets" className="text-sm text-brand hover:underline inline-block">
            ← Browse listings
          </Link>
        </>
      )}

      {/* failed — wallet rejected (no txid) */}
      {phase === 'failed' && !txid && (
        <>
          <p className="text-sm text-amber-400 break-words">{error}</p>
          <p className="text-xs text-slate-500">
            No transaction was sent. You can try cancelling again.
          </p>
          <button type="button" onClick={onReset} className="btn-secondary text-sm w-full">
            Try Again
          </button>
        </>
      )}

      {/* failed — tx broadcast but confirmation timed out */}
      {phase === 'failed' && txid && (
        <>
          <p className="text-sm text-amber-400 break-words">{error}</p>
          <div className="bg-surface rounded-lg px-3 py-2 border border-surface-border">
            <p className="text-xs text-slate-400 font-medium mb-0.5">Transaction submitted</p>
            <TxRow txid={txid} />
          </div>
          <p className="text-xs text-slate-500">
            If your wallet shows the transaction as confirmed, click below to recheck on-chain state.
          </p>
          <button type="button" onClick={onCheckStatus} className="btn-secondary text-sm w-full">
            Recheck Status
          </button>
        </>
      )}

    </div>
  );
}
