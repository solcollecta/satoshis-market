'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getOffer,
  simulateFillOffer,
  simulateEscrowWrite,
  calcFeeSats,
  formatSats,
  formatBtcFromSats,
  fetchTokenInfo,
  fetchNftMetadata,
  fetchNftCollectionInfo,
  keyToHex,
  hexToBigint,
  p2trScript,
  normalizeToHex32,
  hex32ToP2TRAddress,
  getOpscanTxUrl,
  CONTRACT_ADDRESS,
  OP_NETWORK,
} from '@/lib/opnet';
import type { TokenInfo, NftMetadata, NftCollectionInfo } from '@/lib/opnet';
import { formatTokenCompact, formatUnits } from '@/lib/tokens';
import type { Offer, OfferStatusCode } from '@/types/offer';
import { OFFER_STATUS } from '@/types/offer';
import { Field } from '@/components/Field';
import { FillProgress } from '@/components/FillProgress';
import { useWallet } from '@/context/WalletContext';
import { useFillFlow } from '@/hooks/useFillFlow';
import { fetchBtcBalanceSats } from '@/lib/wallet';

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<number, string> = {
  0: 'bg-slate-800/60 text-slate-500 border border-slate-700/30',
  1: 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30',
  2: 'bg-sky-900/30 text-sky-400 border border-sky-700/30',
  3: 'bg-slate-800/60 text-slate-500 border border-slate-700/30',
};

// ── P2TR output requirement description ──────────────────────────────────────

interface FillRequirements {
  makerOutput: { script: string; minSats: bigint };
  feeOutput: { script: string; minSats: bigint } | null;
}

function buildFillRequirements(offer: Offer, feeRecipientKey: bigint): FillRequirements {
  const feeSats = calcFeeSats(offer.btcSatoshis, offer.feeBps);

  const makerScript = p2trScript(offer.btcRecipientKey);
  const feeScript = feeRecipientKey > 0n ? p2trScript(feeRecipientKey) : null;

  if (offer.feeBps === 0 || feeRecipientKey === 0n) {
    return {
      makerOutput: { script: makerScript, minSats: offer.btcSatoshis },
      feeOutput: null,
    };
  }

  if (feeRecipientKey === offer.btcRecipientKey) {
    return {
      makerOutput: {
        script: makerScript,
        minSats: offer.btcSatoshis + feeSats,
      },
      feeOutput: null,
    };
  }

  return {
    makerOutput: { script: makerScript, minSats: offer.btcSatoshis },
    feeOutput: { script: feeScript!, minSats: feeSats },
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OfferDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const { address, connect } = useWallet();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [feeRecipientKey, setFeeRecipientKey] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fillFlow = useFillFlow(BigInt(id));

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);

  useEffect(() => {
    setTokenInfo(null);
    if (!offer || offer.isNFT) return;
    fetchTokenInfo(offer.token).then(setTokenInfo).catch(() => { /* keep null */ });
  }, [offer?.token, offer?.isNFT]); // eslint-disable-line react-hooks/exhaustive-deps

  const [nftMeta, setNftMeta]       = useState<NftMetadata | null>(null);
  const [nftCollection, setNftCollection] = useState<NftCollectionInfo | null>(null);

  useEffect(() => {
    setNftMeta(null);
    setNftCollection(null);
    if (!offer?.isNFT) return;
    fetchNftMetadata(offer.token, offer.tokenId)
      .then(setNftMeta).catch(() => { /* keep null */ });
    fetchNftCollectionInfo(offer.token)
      .then(setNftCollection).catch(() => { /* keep null */ });
  }, [offer?.isNFT, offer?.token, offer?.tokenId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [btcBalanceSats, setBtcBalanceSats] = useState<bigint | null>(null);

  useEffect(() => {
    setBtcBalanceSats(null);
    if (!address) return;
    fetchBtcBalanceSats().then((bal) => setBtcBalanceSats(bal));
  }, [address]);

  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelTxid, setCancelTxid] = useState<string | null>(null);

  useEffect(() => {
    const offerId = BigInt(id);
    Promise.all([
      getOffer(offerId),
      import('@/lib/opnet').then((m) => m.getFeeRecipientKey()),
    ])
      .then(([o, feeKey]) => {
        setOffer(o);
        setFeeRecipientKey(feeKey);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (fillFlow.state.phase !== 'confirmed') return;
    setOffer((prev) => (prev ? { ...prev, status: 2 as OfferStatusCode } : null));
  }, [fillFlow.state.phase]);

  // ── Fill offer ─────────────────────────────────────────────────────────────
  const handleFill = async () => {
    if (!offer) return;

    if (!address) {
      await connect();
      return;
    }

    fillFlow.setSimulating();
    try {
      const { simulation, extraOutputs } = await simulateFillOffer(
        offer.id,
        offer,
        feeRecipientKey,
        address,
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

  // ── Cancel offer ──────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!offer) return;
    setCancelError(null);

    if (!address) {
      await connect();
      return;
    }

    setCancelLoading(true);
    try {
      const simulation = await simulateEscrowWrite('cancelOffer', [offer.id], address);
      const tx = await simulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: address,
        maximumAllowedSatToSpend: 100_000n,
        network: OP_NETWORK,
      });
      setCancelTxid(tx.transactionId);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setCancelLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto card border-red-900/60 bg-red-950/30 text-red-400">
        {error}
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="max-w-2xl mx-auto card text-center text-slate-500 py-16">
        <p className="text-3xl mb-4 text-slate-700">?</p>
        <p className="font-semibold text-slate-400">Listing #{id} not found</p>
        <Link href="/" className="text-brand hover:underline text-sm mt-3 inline-block">
          ← Back to explore
        </Link>
      </div>
    );
  }

  const feeSats = calcFeeSats(offer.btcSatoshis, offer.feeBps);
  const totalRequired = offer.btcSatoshis + (feeRecipientKey === 0n ? 0n : feeSats);
  const fillReqs = buildFillRequirements(offer, feeRecipientKey);

  const buyLabel = offer.isNFT
    ? `Buy NFT · ${formatBtcFromSats(totalRequired)}`
    : `Buy tokens · ${formatBtcFromSats(totalRequired)}`;
  const isOpen = offer.status === 1;
  const isMaker = address?.toLowerCase() === offer.maker.toLowerCase();

  const hasAllowedTaker = offer.allowedTaker !== 0n;
  const isAllowedTaker = (() => {
    if (!address || !hasAllowedTaker) return false;
    try {
      return hexToBigint(normalizeToHex32(address)) === offer.allowedTaker;
    } catch {
      return false;
    }
  })();

  const allowedTakerBech32 = (() => {
    if (!hasAllowedTaker) return '';
    try {
      return hex32ToP2TRAddress(keyToHex(offer.allowedTaker));
    } catch {
      return keyToHex(offer.allowedTaker);
    }
  })();

  const showActions = isOpen || fillFlow.state.phase !== 'idle';

  // NFT display name
  const nftName = nftMeta?.name ?? nftCollection?.name
    ? `${nftMeta?.name ?? nftCollection?.name} #${offer.tokenId.toString()}`
    : `NFT #${offer.tokenId.toString()}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-2">

      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors">
        ← Explore
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-1">
            {offer.isNFT ? 'OP-721 Listing' : 'OP-20 Listing'}
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            #{offer.id.toString()}
          </h1>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[offer.status]}`}>
          {OFFER_STATUS[offer.status]}
        </span>
      </div>

      {/* ── Hero: You receive / You pay ──────────────────────────────── */}
      <div className="card">
        <div className="grid grid-cols-2 gap-6">
          {/* You receive */}
          <div>
            <p className="section-label mb-4">You receive</p>
            {offer.isNFT ? (
              <>
                {(() => {
                  const imgSrc = nftMeta?.image ?? nftCollection?.icon;
                  return imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={nftName}
                      className="w-full max-w-[140px] aspect-square rounded-xl object-cover border border-surface-border mb-3 shadow-lg"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : null;
                })()}
                <p className="text-xl font-bold text-white leading-tight">{nftName}</p>
                <p className="text-[11px] text-slate-600 font-mono mt-1.5 truncate">
                  {offer.token.slice(0, 10)}…
                </p>
              </>
            ) : (
              <>
                <p
                  className="text-3xl font-bold text-white cursor-default leading-none"
                  title={
                    tokenInfo
                      ? `${formatUnits(offer.tokenAmount, tokenInfo.decimals)} ${tokenInfo.symbol}`
                      : offer.tokenAmount.toString()
                  }
                >
                  {tokenInfo ? formatTokenCompact(offer.tokenAmount, tokenInfo.decimals) : '—'}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {tokenInfo?.symbol ?? <span className="text-slate-600 italic text-xs">loading…</span>}
                </p>
              </>
            )}
          </div>

          {/* You pay */}
          <div className="border-l border-surface-border pl-6">
            <p className="section-label mb-4">You pay</p>
            <p className="text-3xl font-bold text-white leading-none">{formatBtcFromSats(offer.btcSatoshis)}</p>
            <p className="text-xs text-slate-600 font-mono mt-2">
              {offer.btcSatoshis.toLocaleString()} sats
            </p>
            {feeRecipientKey !== 0n && feeSats > 0n && (
              <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-surface-border">
                + {formatBtcFromSats(feeSats)} platform fee
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Seller" value={offer.maker} mono />
        <Field label="Token contract" value={offer.token} mono />

        <Field
          label="Buyer restriction"
          value={
            hasAllowedTaker ? (
              <span>
                <span className="text-yellow-400 break-all">{allowedTakerBech32}</span>
                <details className="mt-1">
                  <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-400 select-none w-fit">
                    Advanced (hex)
                  </summary>
                  <span className="block text-slate-700 font-mono text-xs mt-0.5 break-all">
                    {keyToHex(offer.allowedTaker)}
                  </span>
                </details>
              </span>
            ) : (
              <span className="text-emerald-400">Public — anyone can fill</span>
            )
          }
        />

        <Field label="Standard" value={offer.isNFT ? 'OP-721 NFT' : 'OP-20 Token'} />
      </div>

      {/* Transaction details — collapsible */}
      {isOpen && (
        <details className="card border-surface-border group">
          <summary className="cursor-pointer select-none text-sm font-semibold text-slate-500 hover:text-white transition-colors list-none flex items-center gap-2">
            <span className="text-slate-700 group-open:rotate-90 transition-transform duration-150 inline-block">▶</span>
            Transaction requirements
          </summary>

          <div className="mt-5 space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Your Bitcoin transaction <span className="text-slate-300 font-medium">must</span> include
              the following P2TR outputs so the contract can verify payment during simulation:
            </p>

            <div className="bg-surface rounded-xl p-4 border border-surface-border">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3">
                Output 1 — Seller payment
                {fillReqs.feeOutput === null && offer.feeBps > 0 ? ' (includes fee)' : ''}
              </p>
              <div className="space-y-2">
                <div className="flex gap-3 text-xs">
                  <span className="text-slate-600 w-24 shrink-0">scriptPubKey</span>
                  <span className="font-mono text-brand break-all">{fillReqs.makerOutput.script}</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-slate-600 w-24 shrink-0">min value</span>
                  <span className="font-mono text-emerald-400">{formatSats(fillReqs.makerOutput.minSats)}</span>
                </div>
              </div>
            </div>

            {fillReqs.feeOutput && (
              <div className="bg-surface rounded-xl p-4 border border-surface-border">
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3">
                  Output 2 — Platform fee
                </p>
                <div className="space-y-2">
                  <div className="flex gap-3 text-xs">
                    <span className="text-slate-600 w-24 shrink-0">scriptPubKey</span>
                    <span className="font-mono text-brand break-all">{fillReqs.feeOutput.script}</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-slate-600 w-24 shrink-0">min value</span>
                    <span className="font-mono text-emerald-400">{formatSats(fillReqs.feeOutput.minSats)}</span>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-700">
              Format:{' '}
              <code className="text-slate-600">5120{'<'}32-byte tweaked pubkey{'>'}</code>
            </p>
          </div>
        </details>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      {showActions && (
        <div className="card space-y-4">
          <h2 className="text-base font-bold text-white">Trade</h2>

          {/* OTC restriction notice */}
          {isOpen && hasAllowedTaker && address && !isAllowedTaker && (
            <div className="bg-yellow-950/30 border border-yellow-700/30 rounded-xl p-4 text-xs text-yellow-400">
              <span className="font-semibold">OTC offer — restricted to one buyer.</span>{' '}
              Only{' '}
              <span className="font-mono break-all">{allowedTakerBech32 || keyToHex(offer.allowedTaker)}</span>{' '}
              can fill this offer.
            </div>
          )}

          {/* Fill progress */}
          <FillProgress
            state={fillFlow.state}
            onFill={handleFill}
            onReset={fillFlow.reset}
            disabled={Boolean(address && hasAllowedTaker && !isAllowedTaker)}
            fillLabel={address ? buyLabel : 'Connect Wallet'}
            btcBalanceSats={address ? btcBalanceSats : undefined}
            requiredSats={isOpen ? totalRequired : undefined}
          />

          {/* Cancel — maker only */}
          {isOpen && isMaker && (
            <div className="border-t border-surface-border pt-4 space-y-3">
              {cancelTxid && (
                <div className="bg-surface rounded-xl px-4 py-3 border border-surface-border">
                  <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-1">
                    Cancel transaction sent
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono flex-1 min-w-0 truncate">
                      {cancelTxid.slice(0, 12)}…{cancelTxid.slice(-8)}
                    </span>
                    <a
                      href={getOpscanTxUrl(cancelTxid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand hover:underline shrink-0"
                    >
                      OPScan →
                    </a>
                  </div>
                </div>
              )}
              {cancelError && (
                <p className="text-sm text-red-400">{cancelError}</p>
              )}
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancelLoading}
                className="btn-danger"
              >
                {cancelLoading ? 'Submitting…' : 'Cancel Offer'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Non-open state */}
      {!isOpen && fillFlow.state.phase === 'idle' && (
        <div className="card text-center text-slate-500 py-10">
          <p className="text-lg font-bold text-slate-300">
            {OFFER_STATUS[offer.status]}
          </p>
          <p className="text-sm mt-1.5">This listing is no longer active.</p>
          <Link href="/" className="text-brand hover:underline text-sm mt-4 inline-block">
            ← Browse listings
          </Link>
        </div>
      )}

      {/* Contract reference */}
      {CONTRACT_ADDRESS && (
        <p className="text-[11px] text-slate-700 font-mono text-center">
          Contract: {CONTRACT_ADDRESS.slice(0, 14)}…{CONTRACT_ADDRESS.slice(-6)}
        </p>
      )}

    </div>
  );
}
