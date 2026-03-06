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

export function OfferCardRow({ offer, createdAt }: Props) {
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

  const [collection, setCollection] = useState<NftCollectionInfo | null>(null);
  const [colLoaded, setColLoaded]   = useState(!offer.isNFT);
  const [tokenMeta, setTokenMeta]   = useState<TokenMeta | null>(null);

  useEffect(() => {
    if (offer.isNFT) {
      fetchNftCollectionInfo(offer.token)
        .then((info) => { setCollection(info); setColLoaded(true); })
        .catch(() => setColLoaded(true));
    } else {
      getTokenMeta(offer.token)
        .then(setTokenMeta)
        .catch(() => {});
    }
  }, [offer.isNFT, offer.token]);

  const nftLabel  = `${collection?.name ?? 'NFT'} #${offer.tokenId.toString()}`;
  const amountStr = tokenMeta
    ? `${formatTokenCompact(offer.tokenAmount, tokenMeta.decimals)} $${tokenMeta.symbol}`
    : null;

  const displayName = offer.isNFT
    ? (colLoaded ? nftLabel : 'Loading...')
    : (tokenMeta?.symbol ? `$${tokenMeta.symbol}` : 'OP-20 Token');

  return (
    <>
      {buyOpen && <QuickBuyModal offer={offer} onClose={() => setBuyOpen(false)} />}
      <div
        className="group flex items-center gap-4 bg-surface-card border border-surface-border rounded-xl px-4 py-3 transition-all duration-200 hover:border-surface-bright hover:bg-surface-card/80 cursor-pointer"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) return;
          router.push(`/listing/${offer.id.toString()}`);
        }}
      >
        {/* Avatar */}
        <div className="shrink-0">
          {offer.isNFT ? (
            collection?.icon ? (
              <img
                src={collection.icon}
                alt={nftLabel}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-surface border border-surface-border flex items-center justify-center text-lg text-slate-700">
                🖼
              </div>
            )
          ) : (
            <TokenAvatar address={offer.token} symbol={tokenMeta?.symbol ?? ''} size="md" />
          )}
        </div>

        {/* Name + contract */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{displayName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <CopyableAddress
              full={offer.token}
              display={shortAddr(offer.token)}
              className="text-[11px] text-slate-600"
            />
            {!offer.isNFT && amountStr && (
              <span className="text-[11px] text-slate-500">{amountStr}</span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
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
          {offer.status !== 1 && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
              {OFFER_STATUS[offer.status] ?? 'Unknown'}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="text-right shrink-0 min-w-[100px]">
          <p className="text-sm font-bold text-white font-mono">
            {formatBtcFromSats(offer.btcSatoshis)}
          </p>
          <p className="text-[10px] text-slate-600 mt-0.5">
            #{offer.id.toString()}
            {createdAt != null && (
              <span className="ml-1.5">{formatRelativeCompact(createdAt)}</span>
            )}
          </p>
        </div>

        {/* Buy button */}
        <div className="shrink-0 w-16">
          {isOpen && !isSeller ? (
            <button
              type="button"
              onClick={() => setBuyOpen(true)}
              className="w-full cursor-pointer text-[11px] font-bold bg-brand text-black px-3 py-1.5 rounded-lg border border-brand transition-all duration-150 drop-shadow-[0_0_6px_rgba(247,147,26,0.3)] hover:bg-transparent hover:text-brand hover:drop-shadow-[0_0_10px_rgba(247,147,26,0.85)] active:bg-brand active:text-black"
            >
              Buy
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </>
  );
}
