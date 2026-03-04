'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchOwnedNfts, fetchNftCollectionInfo, fetchNftMetadata, type NftEntry, type NftMetadata } from '@/lib/opnet';
import {
  loadCachedCollections,
  saveCachedCollection,
  removeCachedCollection,
  type CachedCollection,
} from '@/lib/nftCollections';

interface Props {
  walletAddress: string;
  /** Pre-fill the contract input (e.g. from the page's token address field). */
  initialContract?: string;
  onSelect(entry: NftEntry): void;
  onClose(): void;
}

export function NftPicker({ walletAddress, initialContract = '', onSelect, onClose }: Props) {
  const [collections, setCollections] = useState<CachedCollection[]>([]);
  const [contractInput, setContractInput] = useState(initialContract);

  const [activeContract, setActiveContract] = useState('');
  const [activeName, setActiveName]         = useState('');
  const [nfts, setNfts]                     = useState<NftEntry[]>([]);
  const [nftLoading, setNftLoading]         = useState(false);
  const [nftError, setNftError]             = useState<string | null>(null);
  const [nftFetched, setNftFetched]         = useState(false);
  // tokenId → metadata (undefined = not yet fetched, null = fetch failed/no image)
  const [nftMeta, setNftMeta] = useState<Map<string, NftMetadata | null>>(new Map());

  // Guard: only auto-load once on mount
  const autoLoadedRef = useRef(false);
  // Incremented on each loadNftsFor call — stale metadata fetches check this
  const loadIdRef = useRef(0);

  // Load saved collections on mount
  useEffect(() => {
    setCollections(loadCachedCollections());
  }, []);

  // Auto-load NFTs if initialContract looks valid
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (!initialContract || initialContract.length < 10) return;
    autoLoadedRef.current = true;
    void loadNftsFor(initialContract);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNftsFor = async (contract: string) => {
    const addr = contract.trim();
    if (!addr) return;
    setActiveContract(addr);
    setContractInput(addr);
    loadIdRef.current++;  // invalidate any in-flight metadata workers for previous load
    setNftFetched(false);
    setNftError(null);
    setNfts([]);
    setNftMeta(new Map());
    setNftLoading(true);
    try {
      const info = await fetchNftCollectionInfo(addr).catch(() => null);
      const name = info?.name || addr.slice(0, 10) + '…';
      setActiveName(name);

      const result = await fetchOwnedNfts(addr, walletAddress);
      setNfts(result);
      setNftFetched(true);

      // Fetch metadata with max 4 concurrent requests.
      // loadId guard prevents stale results from a previous collection load
      // from overwriting state after the user has switched collection.
      const loadId = ++loadIdRef.current;
      let taskIdx = 0;
      const runWorker = async () => {
        while (true) {
          const idx = taskIdx++;
          if (idx >= result.length) break;
          const nft = result[idx];
          const tid = nft.tokenId.toString();
          try {
            const meta = await fetchNftMetadata(addr, nft.tokenId);
            if (loadIdRef.current !== loadId) return;
            setNftMeta((prev) => { const m = new Map(prev); m.set(tid, meta); return m; });
          } catch {
            if (loadIdRef.current !== loadId) return;
            setNftMeta((prev) => { const m = new Map(prev); m.set(tid, null); return m; });
          }
        }
      };
      void Promise.all(Array.from({ length: Math.min(4, result.length) }, runWorker));

      // Save to cache
      saveCachedCollection({
        address: addr,
        name,
        symbol: info?.symbol ?? '',
        icon: info?.icon,
        addedAt: Date.now(),
      });
      setCollections(loadCachedCollections());
    } catch (e) {
      setNftError(e instanceof Error ? e.message : 'Failed to fetch NFTs');
      setNftFetched(true);
    } finally {
      setNftLoading(false);
    }
  };

  const handleRemove = (address: string) => {
    removeCachedCollection(address);
    setCollections((prev) => prev.filter((c) => c.address !== address));
    if (activeContract === address) {
      setActiveContract('');
      setActiveName('');
      setNfts([]);
      setNftFetched(false);
      setNftError(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 w-full max-w-md mx-4 space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Select NFT</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Saved collections */}
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {collections.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              No saved collections yet. Add one below.
            </p>
          ) : (
            collections.map((col) => (
              <div
                key={col.address}
                className={`flex items-center gap-2 bg-surface rounded-lg p-3 border transition-colors ${
                  activeContract === col.address
                    ? 'border-brand'
                    : 'border-surface-border hover:border-brand'
                }`}
              >
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => void loadNftsFor(col.address)}
                >
                  <div className="flex items-center gap-2">
                    {col.icon ? (
                      <img
                        src={col.icon}
                        alt=""
                        className="w-8 h-8 rounded-lg object-cover shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-surface-border flex items-center justify-center text-xs text-slate-500 shrink-0">
                        🖼
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-white truncate block">
                        {col.name || 'Unknown Collection'}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {col.address.slice(0, 10)}…
                      </span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(col.address)}
                  className="text-slate-500 hover:text-red-400 text-sm px-1 shrink-0"
                  title="Remove collection"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add collection input */}
        <div className="border-t border-surface-border pt-4 space-y-2">
          <p className="text-xs text-slate-400">Add collection by contract address:</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="opt1sq…"
              value={contractInput}
              onChange={(e) => setContractInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void loadNftsFor(contractInput); }}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => void loadNftsFor(contractInput)}
              disabled={nftLoading || !contractInput.trim()}
              className="btn-secondary text-sm shrink-0 px-3"
            >
              {nftLoading ? '…' : 'Load NFTs'}
            </button>
          </div>
        </div>

        {/* NFT list — shown once a collection has been loaded */}
        {(nftLoading || nftFetched) && (
          <div className="border-t border-surface-border pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {activeName ? `NFTs in "${activeName}"` : 'Your NFTs'}
              </p>
              {nftFetched && !nftLoading && (
                <button
                  type="button"
                  onClick={() => void loadNftsFor(activeContract)}
                  className="text-xs text-brand hover:underline"
                >
                  Refresh
                </button>
              )}
            </div>

            {nftLoading && (
              <p className="text-sm text-slate-500 animate-pulse py-2">Loading NFTs…</p>
            )}

            {nftError && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
                <p className="font-semibold mb-1">Could not load NFTs</p>
                <p>{nftError}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Close and enter the Token ID manually if you know it.
                </p>
              </div>
            )}

            {nftFetched && !nftLoading && nfts.length === 0 && !nftError && (
              <p className="text-sm text-slate-400 text-center py-4">
                No NFTs found in this collection for your wallet.
              </p>
            )}

            {nfts.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {nfts.map((nft) => {
                  const tid = nft.tokenId.toString();
                  const meta = nftMeta.get(tid);          // undefined = loading, null = no image
                  const imgSrc = meta?.image ?? null;
                  const imgLoading = !nftMeta.has(tid);
                  return (
                    <button
                      key={tid}
                      onClick={() => onSelect(nft)}
                      className="w-full text-left bg-surface rounded-lg p-3 border border-surface-border hover:border-brand transition-colors flex items-center gap-3"
                    >
                      {/* Thumbnail */}
                      <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-border flex items-center justify-center">
                        {imgLoading ? (
                          <div className="w-full h-full skeleton" />
                        ) : imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={`#${tid}`}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <span className="text-2xl text-slate-600">🖼</span>
                        )}
                      </div>
                      {/* Info */}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {meta?.name ?? nft.collectionName} #{tid}
                        </p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                          Token ID: {tid}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300 w-full text-center"
        >
          Cancel
        </button>

      </div>
    </div>
  );
}
