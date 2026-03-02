import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="border-t border-surface-border/60 mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">

          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-brand/30 shadow-[0_0_8px_rgba(247,147,26,0.15)]">
                <Image
                  src="/satoshilogo.png"
                  alt="Satoshi's Market"
                  width={32}
                  height={32}
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <span className="font-bold text-slate-300 text-sm">Satoshi&apos;s Market</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed max-w-xs">
              Trustless peer-to-peer trading on Bitcoin.
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card border border-surface-border">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              <span className="text-[10px] font-semibold text-slate-600 tracking-widest uppercase">
                Powered by OPNet
              </span>
            </div>
          </div>

          {/* Links */}
          <nav className="flex items-start gap-12">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Trade</p>
              <div className="flex flex-col gap-2.5">
                <Link href="/" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Explore</Link>
                <Link href="/collections" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Collections</Link>
                <Link href="/create" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Create Listing</Link>
              </div>
            </div>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-surface-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-slate-700">
            © {new Date().getFullYear()} Satoshi&apos;s Market. Non-custodial. No warranty. Trade at your own risk.
          </p>
          <p className="text-[11px] text-slate-700">
            Built on Bitcoin · Secured by OPNet
          </p>
        </div>
      </div>
    </footer>
  );
}
