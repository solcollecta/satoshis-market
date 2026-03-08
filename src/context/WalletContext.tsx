'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  connectWallet,
  detectProvider,
  getConnectedAddress,
  type WalletProvider,
} from '@/lib/wallet';
import { clearAllPendingTxs } from '@/lib/pendingTxs';

interface WalletState {
  address: string | null;
  provider: WalletProvider;
  connecting: boolean;
  error: string | null;
  connect(): Promise<void>;
  disconnect(): void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  provider: 'none',
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<WalletProvider>('none');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevAddressRef = useRef<string | null>(null);

  // Auto-restore connection on page load
  useEffect(() => {
    const detected = detectProvider();
    setProvider(detected);
    getConnectedAddress().then((addr) => {
      if (addr) setAddress(addr);
    });
  }, []);

  // Clear pending txs when wallet changes to a different address
  useEffect(() => {
    const prev = prevAddressRef.current;
    if (prev !== null && address !== null && prev !== address) {
      clearAllPendingTxs();
    }
    prevAddressRef.current = address;
  }, [address]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const wallet = await connectWallet();
      setAddress(wallet.address);
      setProvider(wallet.provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    clearAllPendingTxs();
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, provider, connecting, error, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
