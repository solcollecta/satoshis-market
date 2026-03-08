'use client';

import { useEffect, useState } from 'react';
import { fetchTokenInfo } from '@/lib/opnet';
import { TokenAvatar } from './TokenAvatar';
import {
  loadCachedTokens,
  saveCachedToken,
  removeCachedToken,
  formatTokenBalance,
  type CachedToken,
} from '@/lib/tokens';

interface Props {
  walletAddress: string;
  onSelect: (token: CachedToken, balance: bigint) => void;
  onClose: () => void;
}

type TokenRow = CachedToken & { balance: bigint | null; balanceLoading: boolean };

export function TokenPicker({ walletAddress, onSelect, onClose }: Props) {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [newAddr, setNewAddr] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // On mount: load cached tokens + fetch balances in background
  useEffect(() => {
    const cached = loadCachedTokens();
    const initial: TokenRow[] = cached.map((t) => ({
      ...t,
      balance: null,
      balanceLoading: true,
    }));
    setRows(initial);

    // Fetch each balance in parallel; update per-row as they resolve
    cached.forEach((token) => {
      fetchTokenInfo(token.address, walletAddress)
        .then((info) => {
          setRows((prev) =>
            prev.map((r) =>
              r.address === token.address
                ? { ...r, balance: info.balance, balanceLoading: false }
                : r,
            ),
          );
        })
        .catch(() => {
          setRows((prev) =>
            prev.map((r) =>
              r.address === token.address ? { ...r, balanceLoading: false } : r,
            ),
          );
        });
    });
  }, [walletAddress]);

  const handleAdd = async () => {
    const addr = newAddr.trim();
    if (!addr) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const info = await fetchTokenInfo(addr, walletAddress);
      const token: CachedToken = {
        address: info.address,
        name: info.name,
        symbol: info.symbol,
        decimals: info.decimals,
        addedAt: Date.now(),
      };
      saveCachedToken(token);
      const row: TokenRow = { ...token, balance: info.balance, balanceLoading: false };
      setRows((prev) => [row, ...prev.filter((r) => r.address !== addr)]);
      setNewAddr('');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to fetch token info');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemove = (address: string) => {
    removeCachedToken(address);
    setRows((prev) => prev.filter((r) => r.address !== address));
  };

  const handleSelect = (row: TokenRow) => {
    const token: CachedToken = {
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      decimals: row.decimals,
      addedAt: row.addedAt,
    };
    onSelect(token, row.balance ?? 0n);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 w-full max-w-md mx-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Saved tokens</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Token list */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {rows.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">
              No saved tokens yet. Add one by contract address below.
            </p>
          )}
          {rows.map((row) => (
            <div
              key={row.address}
              className="flex items-center gap-2 bg-surface rounded-lg p-3 border border-surface-border hover:border-brand transition-colors"
            >
              <button className="flex-1 text-left min-w-0" onClick={() => handleSelect(row)}>
                <div className="flex items-center gap-2">
                  <TokenAvatar address={row.address} symbol={row.symbol} size="sm" />
                  <span className="text-sm font-semibold text-white">{row.symbol}</span>
                  <span className="text-xs text-slate-400">{row.name}</span>
                  <span className="text-xs text-slate-500 font-mono ml-auto">
                    {row.address.slice(0, 8)}…
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {row.balanceLoading ? (
                    <span className="animate-pulse text-slate-500">Loading balance…</span>
                  ) : row.balance !== null ? (
                    <span>{formatTokenBalance(row.balance, row.decimals)} {row.symbol}</span>
                  ) : (
                    <span className="text-slate-500">Balance unavailable</span>
                  )}
                </div>
              </button>
              <button
                onClick={() => handleRemove(row.address)}
                className="text-slate-500 hover:text-red-400 text-sm px-1 shrink-0"
                title="Remove token"
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Add new token */}
        <div className="border-t border-surface-border pt-4 space-y-2">
          <p className="text-xs text-slate-400">Add token by contract address:</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="opt1sq…"
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={addLoading || !newAddr.trim()}
              className="btn-secondary text-sm shrink-0 px-3"
            >
              {addLoading ? '…' : '+ Add'}
            </button>
          </div>
          {addError && (
            <p className="text-xs text-red-400">{addError}</p>
          )}
        </div>

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
