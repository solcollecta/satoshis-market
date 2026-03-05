'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'All',             href: '/assets' },
  { label: 'OP-721 NFTs',      href: '/collections' },
  { label: 'OP-20 Coins',     href: '/tokens' },
] as const;

export function AssetNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-6 flex-wrap">
      {TABS.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          className={`text-3xl font-bold tracking-tight transition-colors duration-150 ${
            pathname === href ? 'text-white' : 'text-slate-600 hover:text-slate-300'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
