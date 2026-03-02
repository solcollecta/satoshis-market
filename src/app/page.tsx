'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CONTRACT_ADDRESS } from '@/lib/opnet';
import Image from 'next/image';

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span
      onClick={() => void handleCopy()}
      title="Click to copy"
      className="text-xs text-slate-600 font-mono cursor-pointer hover:text-slate-300 transition-colors duration-150 select-all mt-4 block"
    >
      {copied ? '✓ Copied!' : `Contract: ${address}`}
    </span>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8 pt-8 pb-12">

      {/* Satoshi portrait */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-brand/15 blur-3xl scale-[1.8]" />
        <div className="absolute inset-0 rounded-full bg-brand/8 blur-xl scale-[1.3]" />
        <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden border-2 border-brand/50 shadow-[0_0_40px_rgba(247,147,26,0.35)]">
          <Image
            src="/satoshilogo.png"
            alt="Satoshi"
            width={160}
            height={160}
            className="w-full h-full object-cover object-top"
            priority
          />
        </div>
      </div>

      {/* Headline */}
      <div className="space-y-4">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-none">
          Satoshi&apos;s{' '}
          <span className="text-brand">Market</span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-400 font-medium max-w-lg mx-auto leading-relaxed">
          Trustless peer-to-peer trading on Bitcoin.
        </p>
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/collections" className="btn-primary px-8 py-3 text-base">
          Browse Collections
        </Link>
        <Link href="/create" className="btn-secondary px-8 py-3 text-base">
          Create Listing
        </Link>
      </div>

      {/* Contract address */}
      {CONTRACT_ADDRESS && (
        <CopyAddress address={CONTRACT_ADDRESS} />
      )}

    </div>
  );
}
