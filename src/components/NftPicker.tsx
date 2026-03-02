'use client';

import { useState } from 'react';
import { fetchOwnedNfts, type NftEntry } from '@/lib/opnet';

interface Props {
  contractAddress: string;
  walletAddress: string;
  onSelect(entry: NftEntry): void;
  onClose(): void;
}

export function NftPicker({ contractAddress, walletAddress, onSelect, onClose }: Props) {
  const [nfts, setNfts] = useState<NftEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const handleFetch = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await fetchOwnedNfts(contractAddress, walletAddress);
      setNfts(result);
      setFetched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch NFTs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 w-full max-w-md mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Select NFT</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Collection:{' '}
          <code className="text-slate-300 break-all">{contractAddress}</code>
        </p>

        {!fetched && (
          <button
            onClick={handleFetch}
            disabled={loading}
            className="btn-secondary w-full text-sm"
          >
            {loading ? 'Loading NFTs…' : 'Load my NFTs in this collection'}
          </button>
        )}

        {fetched && !loading && (
          <button
            onClick={handleFetch}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Refresh
          </button>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
            <p className="font-semibold mb-1">Could not load NFTs</p>
            <p>{error}</p>
            <p className="mt-2 text-slate-400">
              If enumeration is unsupported, close this picker and enter the
              Token ID manually.
            </p>
          </div>
        )}

        {fetched && nfts.length === 0 && !error && (
          <div className="text-sm text-slate-400 text-center py-6">
            <p>No NFTs found in this collection for your wallet.</p>
            <p className="text-xs mt-1">
              Close and enter the Token ID manually if you know it.
            </p>
          </div>
        )}

        {nfts.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {nfts.map((nft) => (
              <button
                key={nft.tokenId.toString()}
                onClick={() => onSelect(nft)}
                className="w-full text-left bg-surface rounded-lg p-3 border border-surface-border hover:border-brand transition-colors"
              >
                <p className="text-sm font-medium text-white">{nft.collectionName}</p>
                <p className="text-xs text-slate-400 font-mono">
                  Token ID: {nft.tokenId.toString()}
                </p>
              </button>
            ))}
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
