'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  simulateFillOffer,
  getFeeRecipientKey,
  calcFeeSats,
  formatBtcFromSats,
  hexToBigint,
  normalizeToHex32,
  hex32ToP2TRAddress,
  keyToHex,
  OP_NETWORK,
} from '@/lib/opnet';
import type { Offer } from '@/types/offer';
import { useFillFlow } from '@/hooks/useFillFlow';
import { FillProgress } from './FillProgress';
import { fetchBtcBalanceSats } from '@/lib/wallet';

interface Props {
  offer: Offer;
  onClose: () => void;
}

export function QuickBuyModal({ offer, onClose }: Props) {
  const router = useRouter();
  const { address, connect } = useWallet();
  const fillFlow = useFillFlow(offer.id);

  const [feeRecipientKey, setFeeRecipientKey] = useState<bigint>(0n);
  const [feeLoading, setFeeLoading]           = useState(true);
  const [btcBalanceSats, setBtcBalanceSats]   = useState<bigint | null>(null);

  // Fetch fee recipient key once on mount
  useEffect(() => {
    getFeeRecipientKey()
      .then(k => setFeeRecipientKey(k))
      .catch(() => {})
      .finally(() => setFeeLoading(false));
  }, []);

  // Fetch BTC balance when wallet is connected
  useEffect(() => {
    if (!address) return;
    fetchBtcBalanceSats().then(setBtcBalanceSats).catch(() => {});
  }, [address]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // On confirmed purchase: close modal and go to listing detail
  useEffect(() => {
    if (fillFlow.state.phase === 'confirmed') {
      onClose();
      router.push(`/listing/${offer.id.toString()}`);
    }
  }, [fillFlow.state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const feeSats       = calcFeeSats(offer.btcSatoshis, offer.feeBps);
  const totalRequired = offer.btcSatoshis + (feeRecipientKey === 0n ? 0n : feeSats);

  const isSeller = (() => {
    if (!address) return false;
    try { return address.toLowerCase() === hex32ToP2TRAddress(keyToHex(offer.btcRecipientKey)).toLowerCase(); }
    catch { return false; }
  })();

  const hasAllowedTaker = offer.allowedTaker !== 0n;
  const isAllowedTaker  = (() => {
    if (!address || !hasAllowedTaker) return false;
    try { return hexToBigint(normalizeToHex32(address)) === offer.allowedTaker; }
    catch { return false; }
  })();

  const handleFill = async () => {
    if (!address) { await connect(); return; }
    fillFlow.setSimulating();
    try {
      const { simulation, extraOutputs } = await simulateFillOffer(
        offer.id, offer, feeRecipientKey, address,
      );
      const tx = await simulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: address,
        maximumAllowedSatToSpend: 100_000n,
        network: OP_NETWORK,
        extraOutputs,
      });
      fillFlow.setPending(tx.transactionId);
    } catch (e) {
      fillFlow.setFailed(e instanceof Error ? e.message : 'Transaction failed');
    }
  };

  const buyLabel = address
    ? `Buy · ${formatBtcFromSats(totalRequired)}`
    : 'Connect Wallet';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xs bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="text-white font-bold">
            Listing <span className="text-brand">#{offer.id.toString()}</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors leading-none ml-4"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">

          {/* Price breakdown */}
          <div className="bg-surface rounded-lg px-3 py-2.5 border border-surface-border space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Price</span>
              <span className="font-mono text-slate-200">{formatBtcFromSats(offer.btcSatoshis)}</span>
            </div>
            {!feeLoading && feeRecipientKey !== 0n && (
              <div className="flex justify-between">
                <span className="text-slate-400">Protocol fee</span>
                <span className="font-mono text-slate-200">{formatBtcFromSats(calcFeeSats(offer.btcSatoshis, offer.feeBps))}</span>
              </div>
            )}
            {address && (
              <div className="flex justify-between border-t border-surface-border pt-1.5 mt-0.5">
                <span className="text-slate-400">Your balance</span>
                <span className={`font-mono ${
                  btcBalanceSats == null
                    ? 'text-slate-600 italic'
                    : btcBalanceSats < totalRequired
                    ? 'text-red-400'
                    : 'text-green-400'
                }`}>
                  {btcBalanceSats == null ? 'loading…' : formatBtcFromSats(btcBalanceSats)}
                </span>
              </div>
            )}
          </div>

          {/* Own listing warning */}
          {isSeller && (
            <p className="text-xs text-brand bg-brand/10 border border-brand/30 rounded-lg px-3 py-2">
              This is your own listing — you cannot buy it yourself.
            </p>
          )}

          {/* Private listing warning */}
          {!isSeller && hasAllowedTaker && address && !isAllowedTaker && (
            <p className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-700/30 rounded-lg px-3 py-2">
              This is a private listing — you are not the designated buyer.
            </p>
          )}

          {/* Fill progress */}
          {!feeLoading && (
            <FillProgress
              state={fillFlow.state}
              onFill={handleFill}
              onReset={fillFlow.reset}
              onCheckStatus={() => void fillFlow.checkStatus()}
              disabled={isSeller || Boolean(address && hasAllowedTaker && !isAllowedTaker)}
              fillLabel={buyLabel}
              btcBalanceSats={address ? btcBalanceSats : undefined}
              requiredSats={totalRequired}
              hidePaymentSummary
            />
          )}

          {/* Link to full listing */}
          <Link
            href={`/listing/${offer.id.toString()}`}
            className="block text-center text-xs text-slate-600 hover:text-brand transition-colors"
            onClick={onClose}
          >
            View full listing →
          </Link>

        </div>
      </div>
    </div>,
    document.body
  );
}
