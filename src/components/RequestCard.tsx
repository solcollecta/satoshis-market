'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BuyRequest } from '@/lib/requestsDb';
import { CopyableAddress } from './CopyableAddress';
import { TokenAvatar } from './TokenAvatar';
import {
  shortAddr,
  fetchNftCollectionInfo,
  fetchTokenInfo,
  type NftCollectionInfo,
} from '@/lib/opnet';
import { formatRelativeCompact, formatTokenCompact, formatUnits } from '@/lib/tokens';

interface Props {
  request: BuyRequest;
}

// ── Module-level caches (same pattern as OfferCard) ───────────────────────────

interface TokenMeta { symbol: string; decimals: number; name: string }

const _tokenCache = new Map<string, TokenMeta | null>();
const _nftCache   = new Map<string, NftCollectionInfo | null>();

async function getTokenMeta(address: string): Promise<TokenMeta | null> {
  if (_tokenCache.has(address)) return _tokenCache.get(address) ?? null;
  try {
    const info = await fetchTokenInfo(address);
    const meta: TokenMeta = {
      symbol:   info.symbol && info.symbol !== '???' ? info.symbol : 'TOKEN',
      decimals: info.decimals,
      name:     info.name   && info.name   !== '???' ? info.name   : '',
    };
    _tokenCache.set(address, meta);
    return meta;
  } catch {
    _tokenCache.set(address, null);
    return null;
  }
}

async function getNftCollection(address: string): Promise<NftCollectionInfo | null> {
  if (_nftCache.has(address)) return _nftCache.get(address) ?? null;
  try {
    const info = await fetchNftCollectionInfo(address);
    _nftCache.set(address, info);
    return info;
  } catch {
    _nftCache.set(address, null);
    return null;
  }
}

// ── NFT visual (mirrors OfferCard's NftImage) ─────────────────────────────────

function NftVisual({ icon, name, loaded }: { icon?: string; name?: string; loaded: boolean }) {
  const [imgError, setImgError] = useState(false);
  if (!loaded) return <div className="w-full h-44 rounded-xl skeleton" />;
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

// ── Card ──────────────────────────────────────────────────────────────────────

export function RequestCard({ request }: Props) {
  const router = useRouter();

  const [collection, setCollection] = useState<NftCollectionInfo | null>(null);
  const [colLoaded, setColLoaded]   = useState(!request.assetType || request.assetType !== 'op721');
  const [tokenMeta, setTokenMeta]   = useState<TokenMeta | null>(null);

  // Prefer stored metadata; fall back to fetch only if missing
  useEffect(() => {
    if (request.assetType === 'op721') {
      // Use stored name as collection name if we have it
      if (request.tokenName) {
        setCollection({ name: request.tokenName, icon: undefined } as NftCollectionInfo);
        setColLoaded(true);
      } else {
        getNftCollection(request.contractAddress)
          .then(c => { setCollection(c); setColLoaded(true); })
          .catch(() => setColLoaded(true));
      }
    } else {
      if (request.tokenSymbol) {
        setTokenMeta({
          symbol:   request.tokenSymbol,
          decimals: request.tokenDecimals ?? 8,
          name:     request.tokenName ?? '',
        });
      } else {
        getTokenMeta(request.contractAddress)
          .then(setTokenMeta)
          .catch(() => {});
      }
    }
  }, [request.assetType, request.contractAddress, request.tokenName, request.tokenSymbol, request.tokenDecimals]);

  // ── Derived display values ────────────────────────────────────────────────

  const displayName = request.assetType === 'op721'
    ? (collection?.name ?? request.tokenName ?? null)
    : (tokenMeta?.symbol ? `$${tokenMeta.symbol}` : request.tokenSymbol ? `$${request.tokenSymbol}` : null);

  const nftLabel = request.tokenId
    ? `${collection?.name ?? request.tokenName ?? 'NFT'} #${request.tokenId}`
    : collection?.name ?? request.tokenName ?? 'Any NFT';

  const amountStr = (() => {
    if (request.assetType !== 'op20') return null;
    const raw = request.tokenAmountRaw;
    const dec = request.tokenDecimals;
    const sym = tokenMeta?.symbol ?? request.tokenSymbol;
    if (!raw || dec == null) return sym ? `$${sym}` : null;
    return `${formatTokenCompact(BigInt(raw), dec)}${sym ? ` $${sym}` : ''}`;
  })();

  const btcDisplay = (() => {
    try {
      const btc = Number(BigInt(request.btcSats)) / 1e8;
      return btc.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 }) + ' BTC';
    } catch { return request.btcSats + ' sats'; }
  })();

  return (
    <div
      className="flex flex-col bg-surface-card border border-surface-border rounded-2xl overflow-hidden transition-colors duration-200 hover:border-surface-bright cursor-pointer"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        router.push(`/request/${request.id}`);
      }}
    >
      {/* Visual area — mirrors OfferCard */}
      {request.assetType === 'op721' ? (
        <div className="px-4 pt-4">
          <NftVisual icon={collection?.icon} name={nftLabel} loaded={colLoaded} />
        </div>
      ) : (
        <div className="px-4 pt-4">
          <div className="w-full h-20 rounded-xl bg-surface border border-surface-border flex items-center gap-4 px-5">
            <TokenAvatar address={request.contractAddress} symbol={tokenMeta?.symbol ?? request.tokenSymbol ?? ''} size="lg" />
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

        {/* Name + badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {request.assetType === 'op721' ? (
              <p className="text-sm font-semibold text-white truncate">
                {colLoaded
                  ? nftLabel
                  : <span className="text-slate-600 text-xs italic">loading…</span>}
              </p>
            ) : (
              <p className="text-sm font-semibold text-white truncate">
                {displayName ?? <span className="text-slate-600 text-xs">OP-20 Token</span>}
              </p>
            )}
            <CopyableAddress
              full={request.contractAddress}
              display={shortAddr(request.contractAddress)}
              className="text-[11px] text-slate-600 truncate mt-0.5"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-bold text-amber-400 border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 rounded-full">
              REQUEST
            </span>
            {request.status !== 'open' && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                request.status === 'fulfilled'
                  ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30'
                  : 'bg-slate-800/60 text-slate-500 border border-slate-700/30'
              }`}>
                {request.status.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Offering price */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-0.5">Offering</p>
            <p className="text-base font-bold text-white font-mono">{btcDisplay}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-600 mt-auto">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="shrink-0">Buyer</span>
            <CopyableAddress
              full={request.requesterAddress}
              display={`${request.requesterAddress.slice(0, 8)}…${request.requesterAddress.slice(-5)}`}
              className="min-w-0 truncate"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span>Requested {formatRelativeCompact(request.createdAt)}</span>
            <div className="relative group/dots">
              <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1 bg-surface-card border border-brand/40 rounded-lg text-[11px] font-bold text-brand tracking-widest whitespace-nowrap opacity-0 group-hover/dots:opacity-100 transition-opacity duration-150 pointer-events-none">
                View Details
              </div>
              <button
                type="button"
                onClick={() => router.push(`/request/${request.id}`)}
                className="cursor-pointer text-slate-600 hover:text-brand hover:drop-shadow-[0_0_8px_rgba(247,147,26,0.9)] px-2 py-0.5 rounded-md transition-all duration-150 text-sm leading-none tracking-widest"
              >
                ···
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
