'use client';

/**
 * FillProgress — visual status panel for the Fill Offer single-step flow.
 *
 * Phases rendered:
 *   idle       → "Fill Offer" / "Connect & Fill" button
 *   simulating → "Confirm in wallet…" spinner
 *   pending    → spinner + txid + Copy + OPScan link + elapsed
 *   confirmed  → green check + "Offer filled successfully!" + txid links
 *   failed     → red error + Retry + Reset
 *
 * Purely presentational — no business logic.
 */

import { useState } from 'react';
import { getOpscanTxUrl, formatSats } from '@/lib/opnet';
import type { FillFlowState } from '@/hooks/useFillFlow';

interface Props {
  state: FillFlowState;
  onFill: () => void;
  onReset: () => void;
  onCheckStatus: () => void;
  /** Disable the Fill button (e.g. OTC restriction) */
  disabled?: boolean;
  /** Label for the primary action button in idle state */
  fillLabel?: string;
  /** Wallet's confirmed BTC balance in satoshis. null = unavailable/loading. */
  btcBalanceSats?: bigint | null;
  /** Total BTC required to fill this offer (maker payment + fee) in satoshis. */
  requiredSats?: bigint;
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

function TxRow({ txid }: { txid: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
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

export function FillProgress({
  state,
  onFill,
  onReset,
  onCheckStatus,
  disabled = false,
  fillLabel = 'Fill Offer',
  btcBalanceSats,
  requiredSats,
}: Props) {
  const { phase, txid, error, elapsed } = state;

  const balanceKnown = btcBalanceSats != null && requiredSats !== undefined;
  const insufficientBalance = balanceKnown && btcBalanceSats < requiredSats!;
  const ctaDisabled = disabled || insufficientBalance;

  return (
    <div className="space-y-3">

      {/* idle */}
      {phase === 'idle' && (
        <>
          {/* Payment summary */}
          {requiredSats !== undefined && (
            <div className="bg-surface rounded-lg px-3 py-2.5 border border-surface-border space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Required</span>
                <span className="font-mono text-slate-200">{formatSats(requiredSats)}</span>
              </div>
              {btcBalanceSats != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Your balance</span>
                  <span className={`font-mono ${insufficientBalance ? 'text-red-400' : 'text-green-400'}`}>
                    {formatSats(btcBalanceSats)}
                  </span>
                </div>
              )}
              {btcBalanceSats == null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Your balance</span>
                  <span className="text-slate-600 italic">loading…</span>
                </div>
              )}
            </div>
          )}

          {/* Insufficient balance warning */}
          {insufficientBalance && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <span aria-hidden>⚠</span> Insufficient BTC balance
            </p>
          )}

          <button
            type="button"
            onClick={onFill}
            disabled={ctaDisabled}
            className={`btn-primary w-full${ctaDisabled ? ' opacity-40 cursor-not-allowed' : ''}`}
          >
            {fillLabel}
          </button>
        </>
      )}

      {/* simulating — waiting for wallet confirmation */}
      {phase === 'simulating' && (
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Spinner />
          Confirm in wallet…
        </div>
      )}

      {/* pending — tx broadcast, waiting for on-chain confirmation */}
      {phase === 'pending' && (
        <>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Spinner />
            Waiting for confirmation…
          </div>
          {txid && (
            <div className="bg-surface rounded-lg px-3 py-2 border border-surface-border">
              <p className="text-xs text-slate-400 font-medium mb-0.5">Transaction sent</p>
              <TxRow txid={txid} />
            </div>
          )}
          <p className="text-xs text-slate-500">
            {elapsed > 0 ? `${elapsed}s elapsed · ` : ''}
            Checking every 5 seconds. This can take a few minutes — please be patient.
          </p>
        </>
      )}

      {/* confirmed */}
      {phase === 'confirmed' && (
        <>
          <div className="flex items-center gap-2 text-green-400">
            <span className="text-lg leading-none">✓</span>
            <p className="text-sm font-semibold">Purchase complete!</p>
          </div>
          {txid && (
            <div className="bg-surface rounded-lg px-3 py-2 border border-surface-border">
              <TxRow txid={txid} />
            </div>
          )}
        </>
      )}

      {/* failed / timed-out */}
      {phase === 'failed' && (
        <>
          <p className="text-sm text-amber-400 break-words">{error}</p>
          {txid && (
            <div className="bg-surface rounded-lg px-3 py-2 border border-surface-border">
              <p className="text-xs text-slate-400 font-medium mb-0.5">Transaction</p>
              <TxRow txid={txid} />
            </div>
          )}
          <p className="text-xs text-slate-500">
            If your wallet shows the transaction as confirmed, click below to check on-chain status.
          </p>
          <button type="button" onClick={onCheckStatus} className="btn-secondary text-sm w-full">
            Check Status Again
          </button>
        </>
      )}

    </div>
  );
}
