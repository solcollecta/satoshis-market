'use client';

import { useState } from 'react';
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
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center space-y-10 pt-10 pb-16">

      {/* Satoshi portrait */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-brand/15 blur-3xl scale-[1.8]" />
        <div className="absolute inset-0 rounded-full bg-brand/8 blur-xl scale-[1.3]" />
        <div className="relative w-36 h-36 sm:w-48 sm:h-48 rounded-full overflow-hidden border-2 border-brand/50 shadow-[0_0_40px_rgba(247,147,26,0.35)]">
          <Image
            src="/satoshilogo.png"
            alt="Satoshi"
            width={192}
            height={192}
            className="w-full h-full object-cover object-top"
            priority
          />
        </div>
      </div>

      {/* Headline */}
      <div className="space-y-5">
        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extrabold text-white tracking-tight leading-none">
          Satoshi&apos;s{' '}
          <span className="text-brand">Market</span>
        </h1>
        <p className="text-xl sm:text-2xl text-slate-400 font-medium max-w-xl mx-auto leading-relaxed inline-flex items-center justify-center gap-2 flex-wrap">
          Trustless peer-to-peer trading on Bitcoin.
          <span className="inline-flex items-center gap-1.5">
            <span className="text-sm text-slate-600 font-medium">Powered by</span>
            <Image src="/opnet-logo.svg" alt="OPNet" width={56} height={21} className="animate-opnet-glow" />
          </span>
        </p>
      </div>

      {/* Contract address */}
      {CONTRACT_ADDRESS && (
        <CopyAddress address={CONTRACT_ADDRESS} />
      )}

    </div>
  );
}
