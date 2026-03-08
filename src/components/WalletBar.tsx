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
        <div className="flex items-center gap-2">
          <a
            href="https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-surface-card border border-surface-border rounded-full px-3 py-1 font-mono text-slate-400 hover:text-white hover:border-surface-bright transition-colors"
          >
            Download OPNet Wallet
          </a>
          <button
            onClick={connect}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 text-xs bg-surface-card border border-surface-border rounded-full px-3 py-1 font-mono text-slate-400 hover:text-white hover:border-surface-bright transition-colors disabled:opacity-50"
          >
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        </div>
      )}
    </div>
  );
}
