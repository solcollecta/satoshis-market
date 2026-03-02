'use client';

import { useWallet } from '@/context/WalletContext';

export function WalletBar() {
  const { address, connecting, error, connect, disconnect } = useWallet();

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="text-xs text-red-400 max-w-xs truncate" title={error}>
          {error}
        </span>
      )}

      {address ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs bg-surface-card border border-surface-border rounded-full px-3 py-1 font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            {address.slice(0, 8)}…{address.slice(-6)}
          </span>
          <button
            onClick={disconnect}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={connecting}
          className="px-4 py-1.5 rounded-full text-sm font-semibold bg-brand text-white hover:bg-brand-dark disabled:opacity-50 transition-colors"
        >
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
}
