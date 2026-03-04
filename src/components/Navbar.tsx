'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { WalletBar } from './WalletBar';
import { PendingTxsIndicator } from './PendingTxsIndicator';
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
          <div className="flex flex-col leading-none">
            <span className="font-bold text-white text-[15px] tracking-tight">
              Satoshi&apos;s Market
            </span>
            <span className="text-[9px] font-medium text-slate-600 tracking-widest uppercase hidden sm:block mt-0.5">
              Powered by OPNet
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {[
            { href: '/assets',      label: 'Assets' },
            { href: '/collections', label: 'NFT Collections' },
            { href: '/tokens',      label: 'OP-20 Coins' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname === href
                  ? 'text-white bg-surface-card'
                  : 'text-slate-400 hover:text-white hover:bg-surface-card'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* BTC price + Pending transactions + Wallet */}
        <div className="flex items-center gap-3 shrink-0">
          <BtcPrice />
          <PendingTxsIndicator />
          <WalletBar />
        </div>
      </div>
    </header>
  );
}
