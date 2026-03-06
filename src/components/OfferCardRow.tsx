'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Offer } from '@/types/offer';
import { OFFER_STATUS } from '@/types/offer';
import { QuickBuyModal } from './QuickBuyModal';
import {
  formatBtcFromSats,
  fetchNftCollectionInfo,
  fetchTokenInfo,
  hex32ToP2TRAddress,
  keyToHex,
  type NftCollectionInfo,
} from '@/lib/opnet';
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
        className="group grid items-center bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 transition-all duration-150 hover:border-surface-bright cursor-pointer"
        style={{ gridTemplateColumns: '2.5rem 2.5rem minmax(0,1fr) auto auto auto auto' }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) return;
          router.push(`/listing/${offer.id.toString()}`);
        }}
      >
        {/* Col 1: Avatar */}
        {offer.isNFT ? (
          collection?.icon ? (
            <img src={collection.icon} alt={nftLabel} className="w-9 h-9 rounded-lg object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-surface border border-surface-border flex items-center justify-center text-base text-slate-700">
              🖼
            </div>
          )
        ) : (
          <TokenAvatar address={offer.token} symbol={tokenMeta?.symbol ?? ''} size="sm" />
        )}

        {/* Col 2: ID */}
        <span className="text-[11px] text-brand font-mono">#{offer.id.toString()}</span>

        {/* Col 3: Name + Amount */}
        <div className="min-w-0 px-1">
          <p className="text-sm font-semibold text-white truncate">{displayName}</p>
          {!offer.isNFT && amountStr && (
            <p className="text-[11px] text-slate-500 truncate">{amountStr}</p>
          )}
        </div>

        {/* Col 4: Badges */}
        <div className="flex items-center gap-1 px-2">
          {isSeller && (
            <span className="text-[9px] font-bold text-emerald-400 border border-emerald-700/40 bg-emerald-900/20 px-1.5 py-0.5 rounded-full">
              Yours
            </span>
          )}
          {offer.allowedTaker !== 0n && (
            <span className="text-[9px] font-bold text-brand border border-brand/30 px-1.5 py-0.5 rounded-full">
              Private
            </span>
          )}
          {offer.status !== 1 && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusClass}`}>
              {OFFER_STATUS[offer.status] ?? 'Unknown'}
            </span>
          )}
        </div>

        {/* Col 5: Time */}
        <span className="text-[11px] text-slate-600 px-2 hidden sm:block">
          {createdAt != null ? formatRelativeCompact(createdAt) : ''}
        </span>

        {/* Col 6: Price */}
        <span className="text-sm font-bold text-white font-mono text-right px-2 whitespace-nowrap">
          {formatBtcFromSats(offer.btcSatoshis)}
        </span>

        {/* Col 7: Buy */}
        <div className="w-14 flex justify-end">
          {isOpen && !isSeller ? (
            <button
              type="button"
              onClick={() => setBuyOpen(true)}
              className="cursor-pointer text-[11px] font-bold bg-brand text-black px-3 py-1 rounded-lg border border-brand transition-all duration-150 drop-shadow-[0_0_6px_rgba(247,147,26,0.3)] hover:bg-transparent hover:text-brand hover:drop-shadow-[0_0_10px_rgba(247,147,26,0.85)] active:bg-brand active:text-black"
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
