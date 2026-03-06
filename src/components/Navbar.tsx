'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { WalletBar } from './WalletBar';
import { PendingTxsIndicator } from './PendingTxsIndicator';
import { PrivateListingsIndicator } from './PrivateListingsIndicator';
import { SalesIndicator } from './SalesIndicator';
import { BtcPrice } from './BtcPrice';

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  return (
    <header className="sticky top-0 z-50 border-b border-surface-border/60 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">

        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <div className="relative w-9 h-9 rounded-full overflow-hidden ring-1 ring-brand/40 group-hover:ring-brand/70 transition-all duration-200 shadow-[0_0_12px_rgba(247,147,26,0.2)]">
            <Image
              src="/satoshilogo.png"
              alt="Satoshi's Market"
              width={36}
              height={36}
              className="w-full h-full object-cover object-top"
              priority
            />
          </div>
          <span className="font-bold text-white text-[15px] tracking-tight">
            Satoshi&apos;s Market
          </span>
        </Link>

        {/* Marketplace + Social links */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/assets"
            className="text-slate-400 hover:text-white transition-all duration-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.3)] hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
            aria-label="Marketplace"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M2.25 2.25a.75.75 0 000 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 00-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 000-1.5H5.378A2.25 2.25 0 017.5 15h11.218a.75.75 0 00.674-.421 60.358 60.358 0 002.96-7.228.75.75 0 00-.525-.965A60.864 60.864 0 005.68 4.509l-.232-.867A1.875 1.875 0 003.636 2.25H2.25zM3.75 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM16.5 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"/>
            </svg>
          </Link>
          <a
            href="https://x.com/satoshis_xbt"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white transition-all duration-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.3)] hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
            aria-label="Follow us on X"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a
            href="https://github.com/solcollecta/satoshis-market"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white transition-all duration-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.3)] hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
            aria-label="View on GitHub"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
          </a>
          <Link
            href="/docs"
            className="text-slate-400 hover:text-white transition-all duration-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.3)] hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
            aria-label="Documentation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd"/>
              <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z"/>
            </svg>
          </Link>
          <a
            href="https://opnet.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-50 hover:opacity-100 transition-all duration-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.3)] hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
            aria-label="Powered by OPNet"
          >
            <Image src="/opnet-logo.svg" alt="OPNet" width={40} height={15} />
          </a>
          <BtcPrice />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions + Indicators + Wallet */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/create" className="btn-primary shrink-0 !text-xs !py-1.5 !px-3">
            +List
          </Link>
          <Link href="/request/create" className="btn-secondary shrink-0 !text-xs !py-1.5 !px-3">
            +Request
          </Link>
          <div className="flex items-center gap-2">
            <PendingTxsIndicator />
            <PrivateListingsIndicator />
            <SalesIndicator />
          </div>
          <WalletBar />
        </div>

      </div>
    </header>
  );
}
