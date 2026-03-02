'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Offer } from '@/types/offer';
import { OFFER_STATUS } from '@/types/offer';
import {
  formatBtcFromSats,
  shortAddr,
  fetchNftCollectionInfo,
  fetchTokenInfo,
  type NftCollectionInfo,
} from '@/lib/opnet';
import { formatRelativeTime, formatTokenCompact } from '@/lib/tokens';

// ── Status style map ──────────────────────────────────────────────────────────

const STATUS_STYLES: Record<number, string> = {
  0: 'bg-slate-800/60 text-slate-500 border border-slate-700/30',
  1: 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30',
  2: 'bg-sky-900/30 text-sky-400 border border-sky-700/30',
  3: 'bg-slate-800/60 text-slate-500 border border-slate-700/30',
};

interface Props {
  offer: Offer;
  createdAt?: number;
}

interface TokenMeta { symbol: string; decimals: number }

/** Module-level cache — shared across all cards, one fetch per token address */
const _tokenMetaCache = new Map<string, TokenMeta | null>();

async function getTokenMeta(address: string): Promise<TokenMeta | null> {
  if (_tokenMetaCache.has(address)) return _tokenMetaCache.get(address) ?? null;
  try {
    const info = await fetchTokenInfo(address);
    const meta: TokenMeta = {
      symbol:   info.symbol && info.symbol !== '???' ? info.symbol : 'TOKEN',
      decimals: info.decimals,
    };
    _tokenMetaCache.set(address, meta);
    return meta;
  } catch {
    _tokenMetaCache.set(address, null);
    return null;
  }
}

function NftImage({ icon, name, loaded }: { icon?: string; name?: string; loaded: boolean }) {
  const [imgError, setImgError] = useState(false);

  if (!loaded) {
    return <div className="w-full h-44 rounded-xl skeleton" />;
  }

  if (icon && !imgError) {
    return (
      <img
        src={icon}
        alt={name ?? ''}
        className="w-full h-44 rounded-xl object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-full h-44 rounded-xl flex items-center justify-center bg-surface border border-surface-border text-3xl text-slate-700">
      🖼
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function OfferCard({ offer, createdAt }: Props) {
  const statusClass = STATUS_STYLES[offer.status] ?? STATUS_STYLES[0];

  // NFT: collection icon + name
  const [collection, setCollection] = useState<NftCollectionInfo | null>(null);
  const [colLoaded, setColLoaded]   = useState(!offer.isNFT);

  // OP-20: token symbol + decimals
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);

  useEffect(() => {
    if (offer.isNFT) {
      fetchNftCollectionInfo(offer.token)
        .then((info) => { setCollection(info); setColLoaded(true); })
        .catch(() => setColLoaded(true));
    } else {
      getTokenMeta(offer.token)
        .then(setTokenMeta)
        .catch(() => { /* keep null */ });
    }
  }, [offer.isNFT, offer.token]);

  const nftLabel   = `${collection?.name ?? 'NFT'} #${offer.tokenId.toString()}`;
  const amountStr  = tokenMeta
    ? `${formatTokenCompact(offer.tokenAmount, tokenMeta.decimals)} ${tokenMeta.symbol}`
    : null;

  return (
    <Link
      href={`/offer/${offer.id.toString()}`}
      className="group flex flex-col bg-surface-card border border-surface-border rounded-2xl overflow-hidden hover:border-surface-bright transition-all duration-200 hover:shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
    >
      {/* Visual area */}
      {offer.isNFT ? (
        <div className="relative px-4 pt-4">
          <NftImage icon={collection?.icon} name={nftLabel} loaded={colLoaded} />
          <span className={`absolute top-7 right-7 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
            {OFFER_STATUS[offer.status] ?? 'Unknown'}
          </span>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <div className="w-full h-20 rounded-xl bg-surface border border-surface-border flex items-center justify-between px-5">
            <div>
              {amountStr ? (
                <p className="text-2xl font-bold text-white tracking-tight">{amountStr}</p>
              ) : (
                <p className="text-sm text-slate-600 italic">loading…</p>
              )}
            </div>
            <span className="text-3xl opacity-20">🪙</span>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {offer.isNFT ? (
              <p className="text-sm font-semibold text-white truncate">
                {colLoaded
                  ? nftLabel
                  : <span className="text-slate-600 text-xs italic">loading…</span>}
              </p>
            ) : (
              <p className="text-sm font-semibold text-white truncate">
                {tokenMeta?.symbol ?? <span className="text-slate-600 text-xs">OP-20 Token</span>}
              </p>
            )}
            <p className="text-[11px] text-slate-600 font-mono truncate mt-0.5">
              {shortAddr(offer.token)}
            </p>
          </div>
          {!offer.isNFT && (
            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
              {OFFER_STATUS[offer.status] ?? 'Unknown'}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Price */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-0.5">Price</p>
            <p className="text-base font-bold text-white font-mono">
              {formatBtcFromSats(offer.btcSatoshis)}
            </p>
          </div>
          {offer.allowedTaker !== 0n && (
            <span className="text-[10px] font-bold text-brand border border-brand/30 px-2 py-0.5 rounded-full">
              OTC
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-600 mt-auto">
          <span className="font-mono truncate">{shortAddr(offer.maker)}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-700">{offer.isNFT ? 'OP-721' : 'OP-20'}</span>
            {createdAt != null && (
              <span>{formatRelativeTime(createdAt)}</span>
            )}
          </div>
        </div>

        {/* Hover CTA */}
        <p className="text-[11px] text-brand opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-right">
          View details →
        </p>
      </div>
    </Link>
  );
}
