'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/context/WalletContext';
import type { BuyRequest } from '@/lib/requestsDb';
import { CopyableAddress } from '@/components/CopyableAddress';
import { TokenAvatar } from '@/components/TokenAvatar';
import { DetailsGrid, DCell } from '@/components/DetailsGrid';
import { formatRelativeCompact, formatUnits } from '@/lib/tokens';
import {
  getOpscanAccountUrl,
  getOpscanTokenUrl,
  getOpscanContractUrl,
  fetchNftCollectionInfo,
  fetchTokenInfo,
  type NftCollectionInfo,
} from '@/lib/opnet';

const STATUS_STYLES: Record<string, string> = {
  open:      'bg-amber-900/30 text-amber-400 border border-amber-700/30',
  fulfilled: 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30',
  cancelled: 'bg-slate-800/60 text-slate-500 border border-slate-700/30',
};

function formatBtcFromSatsStr(satsStr: string): string {
  try {
    const btc = Number(BigInt(satsStr)) / 1e8;
    return btc.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 }) + ' BTC';
  } catch {
    return satsStr + ' sats';
  }
}

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const { address } = useWallet();

  const [request, setRequest]       = useState<BuyRequest | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [collection, setCollection]         = useState<NftCollectionInfo | null>(null);
  const [resolvedSymbol, setResolvedSymbol] = useState<string | null>(null);
  const [resolvedDecimals, setResolvedDecimals] = useState<number>(8);
  const [imgError, setImgError]             = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/requests?id=${params.id}`);
      const data = await res.json() as BuyRequest & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Not found');
      setRequest(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!request) return;
    if (request.assetType === 'op721') {
      if (request.tokenName) {
        setCollection({ name: request.tokenName, icon: undefined } as NftCollectionInfo);
      } else {
        fetchNftCollectionInfo(request.contractAddress).then(setCollection).catch(() => {});
      }
    } else {
      if (request.tokenSymbol) {
        setResolvedSymbol(request.tokenSymbol);
        setResolvedDecimals(request.tokenDecimals ?? 8);
      } else {
        fetchTokenInfo(request.contractAddress)
          .then(info => {
            setResolvedSymbol(info.symbol && info.symbol !== '???' ? info.symbol : 'TOKEN');
            setResolvedDecimals(info.decimals);
          }).catch(() => {});
      }
    }
  }, [request?.assetType, request?.contractAddress, request?.tokenName, request?.tokenSymbol, request?.tokenDecimals]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async () => {
    if (!request || !address) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/requests/${request.id}/cancel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requesterAddress: address }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Cancel failed');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const buildFulfillUrl = (r: BuyRequest): string => {
    const p = new URLSearchParams();
    p.set('mode',            r.assetType);
    p.set('contractAddress', r.contractAddress);
    p.set('btcSats',         r.btcSats);
    p.set('privateBuyer',    r.requesterAddress);
    p.set('requestId',       r.id);
    if (r.assetType === 'op20' && r.tokenAmountRaw && r.tokenDecimals != null) {
      p.set('tokenAmountRaw', r.tokenAmountRaw);
      p.set('tokenDecimals',  r.tokenDecimals.toString());
      if (r.tokenSymbol) p.set('tokenSymbol', r.tokenSymbol);
      if (r.tokenName)   p.set('tokenName',   r.tokenName);
    }
    if (r.assetType === 'op721' && r.tokenId) p.set('tokenId', r.tokenId);
    if (r.sharedFees) p.set('sharedFees', '1');
    return `/create?${p.toString()}`;
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="max-w-2xl mx-auto card border-red-900/60 bg-red-950/30 text-red-400">
        {error}
      </div>
    );
  }

  if (!request) {
    return (
      <div className="max-w-2xl mx-auto card text-center text-slate-500 py-16">
        <p className="text-3xl mb-4 text-slate-700">?</p>
        <p className="font-semibold text-slate-400">Request not found</p>
        <Link href="/assets" className="text-brand hover:underline text-sm mt-3 inline-block">
          ← Back to listings
        </Link>
      </div>
    );
  }

  const isRequester = !!address && address.toLowerCase() === request.requesterAddress.toLowerCase();
  const isOpen      = request.status === 'open';
  const statusClass = STATUS_STYLES[request.status] ?? STATUS_STYLES.cancelled;

  const sym = resolvedSymbol ?? request.tokenSymbol;
  const dec = resolvedDecimals ?? request.tokenDecimals ?? 8;

  const wantsLabel = request.assetType === 'op721'
    ? (request.tokenId
        ? `${collection?.name ?? request.tokenName ?? 'NFT'} #${request.tokenId}`
        : `Any NFT from ${collection?.name ?? request.tokenName ?? 'collection'}`)
    : (request.tokenAmountRaw && dec != null
        ? `${formatUnits(BigInt(request.tokenAmountRaw), dec)} ${sym ? `$${sym}` : 'TOKEN'}`
        : sym ? `$${sym}` : 'TOKEN');

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-2">

      {/* Back */}
      <Link href="/assets?view=requests" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors">
        ← All requests
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-1">
            {request.assetType === 'op721' ? 'OP-721' : 'OP-20'}
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">Buy Request</h1>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {request.status !== 'open' && (
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${statusClass}`}>
              {request.status.toUpperCase()}
            </span>
          )}
          <span className="text-[11px] text-slate-500">
            Requested {formatRelativeCompact(request.createdAt)}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-3">
        <span className="text-amber-400 shrink-0 text-sm mt-px">ℹ</span>
        <p className="text-xs text-amber-300/80 leading-relaxed">
          {isRequester
            ? 'Requests do not execute trades. If a seller fulfills this request, they will create a private listing for your wallet. You\'ll be notified when it\'s available.'
            : 'To fulfill this request, you\'ll be redirected to create a private listing accessible only to the buyer\'s wallet. The buyer will be notified once they connect their wallet.'}
        </p>
      </div>

      {/* ── Single card ────────────────────────────────────────────────────── */}
      <div className="card space-y-5">

        {/* Hero: Wants | Offering */}
        <DetailsGrid>
          <DCell label="Wants" hero>
            {request.assetType === 'op721' ? (
              <>
                {collection?.icon && !imgError && (
                  <img
                    src={collection.icon}
                    alt={wantsLabel}
                    className="w-full max-w-[140px] aspect-square rounded-xl object-cover border border-surface-border mb-3 shadow-lg"
                    onError={() => setImgError(true)}
                  />
                )}
                <p className="text-xl font-bold text-white leading-tight">{wantsLabel}</p>
                <p className="text-[11px] text-slate-600 font-mono mt-1.5 truncate">
                  {request.contractAddress.slice(0, 10)}…
                </p>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <TokenAvatar address={request.contractAddress} symbol={sym ?? ''} size="lg" />
                <p className="text-2xl font-bold text-white leading-none break-all">{wantsLabel}</p>
              </div>
            )}
          </DCell>
          <DCell label="Offering" hero bordered>
            <p className="text-3xl font-bold text-white leading-none">
              {formatBtcFromSatsStr(request.btcSats)}
            </p>
            <p className="text-xs text-slate-600 font-mono mt-2">{request.btcSats} sats</p>
          </DCell>
        </DetailsGrid>

        <div className="border-t border-surface-border" />

        {/* Details */}
        <DetailsGrid>
          <DCell label="Buyer">
            <CopyableAddress full={request.requesterAddress} orange />
            <a href={getOpscanAccountUrl(request.requesterAddress)} target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-semibold text-brand hover:underline mt-1 block">OPScan</a>
          </DCell>
          <DCell label={request.assetType === 'op721' ? 'Collection contract' : 'Token contract'}>
            <CopyableAddress full={request.contractAddress} orange />
            <a href={request.assetType === 'op721'
                ? getOpscanContractUrl(request.contractAddress)
                : getOpscanTokenUrl(request.contractAddress)}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-semibold text-brand hover:underline mt-1 block">OPScan</a>
          </DCell>
          <DCell label="Standard">{request.assetType === 'op721' ? 'OP-721 NFT' : 'OP-20 Token'}</DCell>
          {request.sharedFees && (
            <DCell label="Fee split">
              <span className="text-emerald-400 text-sm font-semibold">50/50 shared</span>
            </DCell>
          )}
          {request.assetType === 'op721' && (
            <DCell label="Token ID">{request.tokenId ? `#${request.tokenId}` : 'Any from collection'}</DCell>
          )}
        </DetailsGrid>

        {/* Fulfilled info */}
        {request.status === 'fulfilled' && request.listingId && (
          <>
            <div className="border-t border-surface-border" />
            <DetailsGrid>
              <DCell label="Fulfilled listing">
                <Link href={`/listing/${request.listingId}`} className="text-brand hover:underline font-mono">
                  #{request.listingId}
                </Link>
              </DCell>
              {request.fulfilledBy && (
                <DCell label="Fulfilled by">
                  <CopyableAddress full={request.fulfilledBy} orange />
                  <a href={getOpscanAccountUrl(request.fulfilledBy)} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-semibold text-brand hover:underline mt-1 block">OPScan</a>
                </DCell>
              )}
            </DetailsGrid>
          </>
        )}

        {/* Action */}
        {isOpen && (
          <>
            <div className="border-t border-surface-border" />
            {isRequester ? (
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancelling}
                className="btn-danger w-full"
              >
                {cancelling ? 'Cancelling…' : 'Cancel Request'}
              </button>
            ) : (
              <a
                href={buildFulfillUrl(request)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full text-center block"
              >
                Create Listing for Request
              </a>
            )}
          </>
        )}

        {/* Non-open state */}
        {!isOpen && (
          <>
            <div className="border-t border-surface-border" />
            <p className="text-sm text-slate-500 text-center">This request is no longer active.</p>
          </>
        )}

      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">{error}</p>
      )}

    </div>
  );
}
