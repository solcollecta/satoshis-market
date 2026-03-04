'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Offer } from '@/types/offer';
import { OFFER_STATUS } from '@/types/offer';
import { QuickBuyModal } from './QuickBuyModal';
import {
  formatBtcFromSats,
  shortAddr,
  fetchNftCollectionInfo,
  fetchTokenInfo,
  hex32ToP2TRAddress,
  keyToHex,
  type NftCollectionInfo,
} from '@/lib/opnet';
import { CopyableAddress } from './CopyableAddress';
import { TokenAvatar } from './TokenAvatar';
import { formatRelativeCompact, formatTokenCompact } from '@/lib/tokens';
import { useWallet } from '@/context/WalletContext';

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
  const router = useRouter();
  const { address } = useWallet();
  const statusClass = STATUS_STYLES[offer.status] ?? STATUS_STYLES[0];
  const [buyOpen, setBuyOpen] = useState(false);
  const isOpen = offer.status === 1;

  const isSeller = (() => {
    if (!address) return false;
    try { return address.toLowerCase() === hex32ToP2TRAddress(keyToHex(offer.btcRecipientKey)).toLowerCase(); }
    catch { return false; }
  })();

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
    ? `${formatTokenCompact(offer.tokenAmount, tokenMeta.decimals)} $${tokenMeta.symbol}`
    : null;

  return (
    <>
    {buyOpen && <QuickBuyModal offer={offer} onClose={() => setBuyOpen(false)} />}
    <div className="flex flex-col bg-surface-card border border-surface-border rounded-2xl overflow-hidden transition-colors duration-200 hover:border-surface-bright">

      {/* Visual area */}
      {offer.isNFT ? (
        <div className="px-4 pt-4">
          <NftImage icon={collection?.icon} name={nftLabel} loaded={colLoaded} />
        </div>
      ) : (
        <div className="px-4 pt-4">
          <div className="w-full h-20 rounded-xl bg-surface border border-surface-border flex items-center gap-4 px-5">
            <TokenAvatar address={offer.token} symbol={tokenMeta?.symbol ?? ''} size="lg" />
            {amountStr ? (
              <p className="text-2xl font-bold text-white tracking-tight">{amountStr}</p>
            ) : (
              <p className="text-sm text-slate-600 italic">loading…</p>
            )}
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
                {tokenMeta?.symbol ? `$${tokenMeta.symbol}` : <span className="text-slate-600 text-xs">OP-20 Token</span>}
              </p>
            )}
            <CopyableAddress
              full={offer.token}
              display={shortAddr(offer.token)}
              className="text-[11px] text-slate-600 truncate mt-0.5"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isSeller && (
              <span className="text-[10px] font-bold text-emerald-400 border border-emerald-700/40 bg-emerald-900/20 px-2 py-0.5 rounded-full">
                Yours
              </span>
            )}
            {offer.allowedTaker !== 0n && (
              <span className="text-[10px] font-bold text-brand border border-brand/30 px-2 py-0.5 rounded-full">
                Private
              </span>
            )}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
              {OFFER_STATUS[offer.status] ?? 'Unknown'}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Price + Buy */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-0.5">Price</p>
            <p className="text-base font-bold text-white font-mono mb-1.5">
              {formatBtcFromSats(offer.btcSatoshis)}
            </p>
            {isOpen && !isSeller && (
              <button
                type="button"
                onClick={() => setBuyOpen(true)}
                className="cursor-pointer text-[11px] font-bold bg-brand text-black px-3 py-1 rounded-lg border border-brand transition-all duration-150 drop-shadow-[0_0_6px_rgba(247,147,26,0.3)] hover:bg-transparent hover:text-brand hover:drop-shadow-[0_0_10px_rgba(247,147,26,0.85)] active:bg-brand active:text-black"
              >
                Buy
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-600 mt-auto">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-brand shrink-0">#{offer.id.toString()}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">Seller</span>
            {(() => {
              try {
                const bech32 = hex32ToP2TRAddress(keyToHex(offer.btcRecipientKey));
                return (
                  <CopyableAddress
                    full={bech32}
                    display={`${bech32.slice(0, 8)}…${bech32.slice(-5)}`}
                    className="min-w-0 truncate"
                  />
                );
              } catch {
                return <span className="font-mono truncate">{shortAddr(offer.maker)}</span>;
              }
            })()}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {createdAt != null && (
              <span>
                {offer.status === 2 ? 'Sold' : 'Listed'} {formatRelativeCompact(createdAt)}
              </span>
            )}
            <div className="relative group/dots">
              <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1 bg-surface-card border border-brand/40 rounded-lg text-[11px] font-bold text-brand tracking-widest whitespace-nowrap opacity-0 group-hover/dots:opacity-100 transition-opacity duration-150 pointer-events-none">
                View Details
              </div>
              <button
                type="button"
                onClick={() => router.push(`/listing/${offer.id.toString()}`)}
                className="cursor-pointer text-slate-600 hover:text-brand hover:drop-shadow-[0_0_8px_rgba(247,147,26,0.9)] px-2 py-0.5 rounded-md transition-all duration-150 text-sm leading-none tracking-widest"
              >
                ···
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
    </>
  );
}
