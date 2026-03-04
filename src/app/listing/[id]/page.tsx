'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getOffer,
  simulateFillOffer,
  simulateEscrowWrite,
  calcFeeSats,
  formatBtcFromSats,
  getOpscanAccountUrl,
  getOpscanTokenUrl,
  getOpscanContractUrl,
  resolveNftImageUrls,
  fetchTokenInfo,
  fetchNftMetadata,
  fetchNftCollectionInfo,
  keyToHex,
  hexToBigint,
  p2trScript,
  normalizeToHex32,
  hex32ToP2TRAddress,
  getWalletOpnetAddressHex,
  CONTRACT_ADDRESS,
  OP_NETWORK,
} from '@/lib/opnet';
import type { TokenInfo, NftMetadata, NftCollectionInfo } from '@/lib/opnet';
import { formatTokenCompact, formatUnits, getListingTimestamp, formatRelativeCompact } from '@/lib/tokens';
import type { Offer, OfferStatusCode } from '@/types/offer';
import { OFFER_STATUS } from '@/types/offer';
import { DetailsGrid, DCell } from '@/components/DetailsGrid';
import { CopyableAddress } from '@/components/CopyableAddress';
import { TokenAvatar } from '@/components/TokenAvatar';
import { FillProgress } from '@/components/FillProgress';
import { CancelProgress } from '@/components/CancelProgress';
import { useWallet } from '@/context/WalletContext';
import { useFillFlow } from '@/hooks/useFillFlow';
import { useCancelFlow } from '@/hooks/useCancelFlow';
import { fetchBtcBalanceSats } from '@/lib/wallet';
import { getPendingTxs, removePendingTx } from '@/lib/pendingTxs';

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

  const fillFlow   = useFillFlow(BigInt(id));
  const cancelFlow = useCancelFlow(BigInt(id));
  const resumedRef       = useRef(false);
  const cancelResumedRef = useRef(false);

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

  const [isMaker, setIsMaker] = useState(false);
  useEffect(() => {
    if (!offer || !address) { setIsMaker(false); return; }
    let cancelled = false;
    getWalletOpnetAddressHex(address)
      .then(opnetAddr => {
        if (cancelled) return;
        if (!opnetAddr) { setIsMaker(false); return; }
        setIsMaker(opnetAddr.toLowerCase() === offer.maker.toLowerCase());
      })
      .catch(() => { if (!cancelled) setIsMaker(false); });
    return () => { cancelled = true; };
  }, [offer?.maker, address]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (resumedRef.current || !offer || fillFlow.state.phase !== 'idle') return;
    resumedRef.current = true;
    const pending = getPendingTxs().find(t => t.type === 'fill' && t.offerId === id);
    if (!pending) return;
    if (offer.status === 2) {
      removePendingTx(pending.txid);
      return;
    }
    if (offer.status === 1) {
      fillFlow.setPending(pending.txid);
    }
  }, [offer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cancelResumedRef.current || !offer || cancelFlow.state.phase !== 'idle') return;
    cancelResumedRef.current = true;
    const pending = getPendingTxs().find(t => t.type === 'cancel' && t.offerId === id);
    if (!pending) return;
    if (offer.status === 3) {
      removePendingTx(pending.txid);
      return;
    }
    if (offer.status === 1) {
      cancelFlow.setPending(pending.txid);
    }
  }, [offer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fillFlow.state.phase !== 'confirmed') return;
    setOffer((prev) => (prev ? { ...prev, status: 2 as OfferStatusCode } : null));
  }, [fillFlow.state.phase]);

  useEffect(() => {
    if (cancelFlow.state.phase !== 'confirmed') return;
    setOffer((prev) => (prev ? { ...prev, status: 3 as OfferStatusCode } : null));
  }, [cancelFlow.state.phase]);

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
    if (!address) { await connect(); return; }

    cancelFlow.setSubmitting();
    try {
      const simulation = await simulateEscrowWrite('cancelOffer', [offer.id], address);
      const tx = await simulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: address,
        maximumAllowedSatToSpend: 100_000n,
        network: OP_NETWORK,
      });
      cancelFlow.setPending(tx.transactionId);
    } catch (e) {
      cancelFlow.setFailed(e instanceof Error ? e.message : 'Transaction failed');
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
        <Link href="/assets" className="text-brand hover:underline text-sm mt-3 inline-block">
          ← Back to listings
        </Link>
      </div>
    );
  }

  const feeSats = calcFeeSats(offer.btcSatoshis, offer.feeBps);
  const totalRequired = offer.btcSatoshis + (feeRecipientKey === 0n ? 0n : feeSats);
  const createdAt = getListingTimestamp(id);

  const buyLabel = offer.isNFT
    ? `Buy NFT · ${formatBtcFromSats(totalRequired)}`
    : `Buy tokens · ${formatBtcFromSats(totalRequired)}`;
  const isOpen = offer.status === 1;

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

  const showActions = isOpen || fillFlow.state.phase !== 'idle' || cancelFlow.state.phase !== 'idle';

  const nftName = nftMeta?.name ?? nftCollection?.name
    ? `${nftMeta?.name ?? nftCollection?.name} #${offer.tokenId.toString()}`
    : `NFT #${offer.tokenId.toString()}`;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-2">

      {/* Back + collection filter */}
      <div className="flex items-center justify-between">
        <Link href="/assets" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors">
          ← All listings
        </Link>
        {(() => {
          const label = offer.isNFT
            ? (nftCollection?.name ?? null)
            : (tokenInfo?.symbol ? `$${tokenInfo.symbol}` : null);
          if (!label) return null;
          return (
            <Link
              href={`/assets?token=${encodeURIComponent(offer.token)}`}
              className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
            >
              All {label} Listings →
            </Link>
          );
        })()}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-1">
            {offer.isNFT ? 'OP-721' : 'OP-20'}
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Listing <span className="text-brand">#{offer.id.toString()}</span>
          </h1>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {offer.status !== 1 && (
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[offer.status]}`}>
              {OFFER_STATUS[offer.status]}
            </span>
          )}
          {createdAt != null && (
            <span className="text-[11px] text-slate-500">
              {offer.status === 2 ? 'Sold' : 'Listed'} {formatRelativeCompact(createdAt)}
            </span>
          )}
        </div>
      </div>

      {/* ── Single card ───────────────────────────────────────────────── */}
      <div className="card space-y-5">

        {/* Hero: You receive | You pay */}
        <DetailsGrid>
          <DCell label="You receive" hero>
            {offer.isNFT ? (
              <>
                {(() => {
                  const rawSrc = nftMeta?.image ?? nftCollection?.icon;
                  if (!rawSrc) return null;
                  const { primary, fallback } = resolveNftImageUrls(rawSrc);
                  return (
                    <img
                      src={primary}
                      alt={nftName}
                      className="w-full max-w-[140px] aspect-square rounded-xl object-cover border border-surface-border mb-3 shadow-lg"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        if (fallback && el.src !== fallback) { el.src = fallback; }
                        else { el.style.display = 'none'; }
                      }}
                    />
                  );
                })()}
                <p className="text-xl font-bold text-white leading-tight">{nftName}</p>
                <p className="text-[11px] text-slate-600 font-mono mt-1.5 truncate">
                  {offer.token.slice(0, 10)}…
                </p>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <TokenAvatar address={offer.token} symbol={tokenInfo?.symbol ?? ''} size="lg" />
                <p
                  className="text-3xl font-bold text-white cursor-default leading-none"
                  title={
                    tokenInfo
                      ? `${formatUnits(offer.tokenAmount, tokenInfo.decimals)} ${tokenInfo.symbol}`
                      : offer.tokenAmount.toString()
                  }
                >
                  {tokenInfo
                    ? `${formatTokenCompact(offer.tokenAmount, tokenInfo.decimals)} $${tokenInfo.symbol}`
                    : '—'}
                </p>
              </div>
            )}
          </DCell>
          <DCell label="You pay" hero bordered>
            <p className="text-3xl font-bold text-white leading-none">{formatBtcFromSats(offer.btcSatoshis)}</p>
            <p className="text-xs text-slate-600 font-mono mt-2">
              {offer.btcSatoshis.toLocaleString()} sats
            </p>
            {feeRecipientKey !== 0n && feeSats > 0n && (
              <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-surface-border">
                + {formatBtcFromSats(feeSats)} platform fee
              </p>
            )}
          </DCell>
        </DetailsGrid>

        <div className="border-t border-surface-border" />

        {/* Details */}
        <DetailsGrid>
          <DCell label="Seller">
            {(() => {
              try {
                const bech32 = hex32ToP2TRAddress(keyToHex(offer.btcRecipientKey));
                return (
                  <>
                    <CopyableAddress full={bech32} orange />
                    <a href={getOpscanAccountUrl(bech32)} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-semibold text-brand hover:underline mt-1 block">OPScan</a>
                  </>
                );
              } catch {
                return <CopyableAddress full={offer.maker} orange />;
              }
            })()}
          </DCell>
          <DCell label={offer.isNFT ? 'Collection contract' : 'Token contract'}>
            <CopyableAddress full={offer.token} orange />
            <a href={offer.isNFT ? getOpscanContractUrl(offer.token) : getOpscanTokenUrl(offer.token)}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-semibold text-brand hover:underline mt-1 block">OPScan</a>
          </DCell>
          <DCell label="Private buyer">
            {hasAllowedTaker ? (
              <CopyableAddress full={allowedTakerBech32 || keyToHex(offer.allowedTaker)} className="text-yellow-400" />
            ) : (
              <span className="text-emerald-400">Public — anyone can fill</span>
            )}
          </DCell>
          <DCell label="Standard">{offer.isNFT ? 'OP-721 NFT' : 'OP-20 Token'}</DCell>
        </DetailsGrid>

        {/* Actions / non-open state */}
        {(showActions || (!isOpen && fillFlow.state.phase === 'idle' && cancelFlow.state.phase === 'idle')) && (
          <>
            <div className="border-t border-surface-border" />

            {showActions && (
              <div className="space-y-4">
                {isOpen && cancelFlow.state.phase === 'idle' && hasAllowedTaker && address && !isAllowedTaker && (
                  <div className="bg-yellow-950/30 border border-yellow-700/30 rounded-xl p-4 text-xs text-yellow-400">
                    <span className="font-semibold">Private listing — restricted to:</span>{' '}
                    <span className="font-mono break-all">{allowedTakerBech32 || keyToHex(offer.allowedTaker)}</span>
                  </div>
                )}

                {!isMaker && cancelFlow.state.phase === 'idle' && (
                  <FillProgress
                    state={fillFlow.state}
                    onFill={handleFill}
                    onReset={fillFlow.reset}
                    onCheckStatus={() => void fillFlow.checkStatus()}
                    disabled={Boolean(address && hasAllowedTaker && !isAllowedTaker)}
                    fillLabel={address ? buyLabel : 'Connect Wallet'}
                    btcBalanceSats={address ? btcBalanceSats : undefined}
                    requiredSats={isOpen ? totalRequired : undefined}
                  />
                )}

                {isMaker && (
                  <div className="space-y-3">
                    {cancelFlow.state.phase === 'idle' && isOpen && (
                      <button
                        type="button"
                        onClick={() => void handleCancel()}
                        className="btn-danger"
                      >
                        Cancel Listing
                      </button>
                    )}
                    {cancelFlow.state.phase !== 'idle' && (
                      <CancelProgress
                        state={cancelFlow.state}
                        onCheckStatus={() => void cancelFlow.checkStatus()}
                        onReset={cancelFlow.reset}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {!isOpen && fillFlow.state.phase === 'idle' && cancelFlow.state.phase === 'idle' && (
              <p className="text-sm text-slate-500 text-center">This listing is no longer active.</p>
            )}
          </>
        )}

      </div>

    </div>
  );
}
