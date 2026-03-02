'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchNftCollectionInfo, fetchTokenInfo, formatBtcFromSats } from '@/lib/opnet';

export interface CollectionSummary {
  address: string;
  isNFT: boolean;
  /** Lowest BTC price among open offers */
  floorSats: bigint;
  openListings: number;
  totalListings: number;
}

interface Props {
  collection: CollectionSummary;
}

export function CollectionCard({ collection }: Props) {
  const [name, setName]       = useState<string | null>(null);
  const [icon, setIcon]       = useState<string | null>(null);
  const [banner, setBanner]   = useState<string | null>(null);
  const [imgError, setImgError]   = useState(false);
  const [bannerError, setBannerError] = useState(false);

  useEffect(() => {
    if (collection.isNFT) {
      fetchNftCollectionInfo(collection.address).then((info) => {
        if (info?.name)   setName(info.name);
        if (info?.icon)   setIcon(info.icon);
        if (info?.banner) setBanner(info.banner);
      }).catch(() => {});
    } else {
      fetchTokenInfo(collection.address).then((info) => {
        const sym = info.symbol && info.symbol !== '???' ? info.symbol : null;
        setName(sym ?? info.name ?? null);
      }).catch(() => {});
    }
  }, [collection.address, collection.isNFT]);

  const displayName = name
    ?? (collection.isNFT ? 'NFT Collection' : 'Token')
    + ' ' + collection.address.slice(0, 6) + '…';

  const bgSrc = banner && !bannerError ? banner : (icon && !imgError ? icon : null);

  return (
    <Link
      href={`/collection/${collection.address}`}
      className="group flex flex-col bg-surface-card border border-surface-border rounded-2xl overflow-hidden hover:border-surface-bright transition-all duration-200 hover:shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
    >
      {/* Banner / visual header */}
      <div className="relative h-28 bg-surface overflow-hidden">
        {bgSrc ? (
          <img
            src={bgSrc}
            alt=""
            className="w-full h-full object-cover opacity-50 group-hover:opacity-65 transition-opacity duration-300"
            onError={() => { if (bgSrc === banner) setBannerError(true); else setImgError(true); }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface to-surface-elevated">
            <span className="text-5xl opacity-[0.07]">{collection.isNFT ? '🖼' : '🪙'}</span>
          </div>
        )}

        {/* Floating icon when banner is showing */}
        {banner && !bannerError && icon && !imgError && (
          <img
            src={icon}
            alt=""
            className="absolute bottom-2.5 left-3.5 w-9 h-9 rounded-lg object-cover border-2 border-surface-card shadow-lg"
            onError={() => setImgError(true)}
          />
        )}

        {/* Type badge */}
        <span className="absolute top-2.5 right-2.5 text-[10px] font-semibold text-slate-500 bg-surface/90 backdrop-blur px-2 py-0.5 rounded-full border border-surface-border">
          {collection.isNFT ? 'OP-721' : 'OP-20'}
        </span>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-white truncate">{displayName}</p>
          <p className="text-[11px] text-slate-600 font-mono truncate mt-0.5">
            {collection.address.slice(0, 14)}…
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-surface-border">
          <div>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-0.5">Floor</p>
            <p className="text-sm font-bold text-white font-mono">
              {collection.openListings > 0 ? formatBtcFromSats(collection.floorSats) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-0.5">Listed</p>
            <p className="text-sm font-bold text-white">
              {collection.openListings}
              {collection.totalListings > collection.openListings && (
                <span className="text-slate-700 font-normal text-xs ml-1">
                  / {collection.totalListings}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Hover CTA */}
        <p className="text-[11px] text-brand opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-right">
          View collection →
        </p>
      </div>
    </Link>
  );
}
