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
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card border border-surface-border">
                <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                <span className="text-[10px] font-semibold text-slate-600 tracking-widest uppercase">
                  Powered by OPNet
                </span>
              </div>
              <a
                href="https://x.com/satoshis_xbt"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-card border border-surface-border text-slate-500 hover:text-white hover:border-slate-500 transition-all duration-200"
                aria-label="Follow us on X"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
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
