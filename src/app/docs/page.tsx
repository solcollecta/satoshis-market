'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const SECTIONS = [
  {
    id: 'trustless',
    title: 'Trustless by Design',
  },
  {
    id: 'comparison',
    title: 'Comparison',
  },
  {
    id: 'features',
    title: 'Core Features',
  },
  {
    id: 'trading',
    title: 'How Trading Works',
  },
  {
    id: 'future',
    title: 'Future Improvements',
  },
];

export default function DocsPage() {
  const [page, setPage] = useState(0);

  const go = (dir: -1 | 1) => {
    setPage(p => Math.max(0, Math.min(SECTIONS.length - 1, p + dir)));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8 animate-fade-in">

      {/* Hero */}
      <header className="space-y-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          Satoshi&apos;s <span className="text-brand">Market</span>
        </h1>
        <p className="text-lg text-slate-400 leading-relaxed max-w-2xl">
          Where Code Replaces Trust.
        </p>
      </header>

      {/* Section nav dots */}
      <div className="flex items-center gap-3">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPage(i)}
            className={`flex items-center gap-2 text-xs font-semibold transition-colors duration-200 ${
              i === page
                ? 'text-brand'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === page ? 'bg-brand scale-110' : 'bg-slate-700'
            }`} />
            <span className="hidden sm:inline">{s.title}</span>
          </button>
        ))}
      </div>

      <hr className="border-surface-border" />

      {/* Content area */}
      <div className="min-h-[60vh]">

        {/* ── Trustless by Design ─────────────────────────────────────── */}
        {page === 0 && (
          <section className="space-y-8 text-sm text-slate-300 leading-relaxed animate-fade-in">
            <h2 className="text-2xl font-bold text-white">Why Satoshi&apos;s Market Is Trustless by Design</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Zero Risk', 'Smart contract escrow eliminates counterparty risk'],
                ['Non-custodial', 'You keep control of your keys at all times'],
                ['Bitcoin-native', 'All transactions settle on the Bitcoin network'],
                ['Permissionless', 'No accounts, no KYC, no gatekeepers'],
              ].map(([title, desc]) => (
                <div key={title} className="bg-surface-card border border-surface-border rounded-xl px-3 py-3 space-y-1">
                  <p className="text-brand font-semibold text-xs">{title}</p>
                  <p className="text-[11px] text-slate-500 leading-snug">{desc}</p>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-brand mb-3">Atomic at the Protocol Level</h3>
              <p>
                Our <a href="https://opscan.org/contracts/0x8da54d29ab62b55b405b089d020d3800e24a0aeb5092427c17f7b49aa42eb162?network=op_testnet" target="_blank" rel="noopener noreferrer" className="text-white font-semibold hover:text-brand transition-colors duration-200 underline decoration-white/40 hover:decoration-brand/60 underline-offset-2">smart contract</a> uses a &ldquo;verify-don&apos;t-custody&rdquo; architecture. When a buyer fills an offer,
                the BTC payment and the contract call are outputs within the same Bitcoin transaction.
                Bitcoin miners either include the entire transaction in a block, or reject it entirely.
                There is no in-between.
              </p>
              <ul className="mt-4 space-y-3">
                <li className="flex items-start gap-2.5">
                  <span className="text-brand mt-0.5 shrink-0">&#x2022;</span>
                  <span><strong className="text-slate-200">No partial execution.</strong> BTC payment and token release happen in one atomic step, or not at all.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-brand mt-0.5 shrink-0">&#x2022;</span>
                  <span><strong className="text-slate-200">No stuck funds.</strong> There is no possible state where BTC is sent but tokens aren&apos;t released, or tokens are released but BTC isn&apos;t sent.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-brand mt-0.5 shrink-0">&#x2022;</span>
                  <span><strong className="text-slate-200">No custodial risk.</strong> The contract never holds, sends, or receives BTC. It only reads the transaction outputs and verifies they match the offer terms before releasing tokens.</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-brand mb-3">Security by Verification, Not Custody</h3>
              <p>
                Traditional swap protocols custody assets on both sides, introducing risk at every step.
                Our contract flips this model: it verifies, never custodies. The entire security guarantee
                is inherited from Bitcoin&apos;s own transaction model. All outputs in a transaction are
                included in a block together, or none of them are.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-brand mb-3">Audited &amp; Open Source</h3>
              <p>
                The AtomicSwapEscrow contract has passed a full security audit. The core invariant, atomicity
                guaranteed by Bitcoin itself, eliminates entire classes of vulnerabilities common in cross-chain
                and escrow protocols.
              </p>
              <blockquote className="mt-4 border-l-2 border-brand/40 pl-4 text-slate-400 italic">
                &ldquo;The safest escrow is one that never touches your money.&rdquo;
              </blockquote>
            </div>
          </section>
        )}

        {/* ── Comparison ────────────────────────────────────────────────── */}
        {page === 1 && (
          <section className="space-y-8 text-sm text-slate-300 leading-relaxed animate-fade-in">
            <h2 className="text-2xl font-bold text-white">Comparison</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-surface-border rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-surface-card">
                    <th className="text-left px-4 py-3 text-slate-400 font-semibold border-b border-surface-border">Traditional / Person Escrow</th>
                    <th className="text-left px-4 py-3 text-brand font-semibold border-b border-surface-border">Satoshi&apos;s Market</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {[
                    ['Must trust the escrow agent to be honest', 'Trust only the smart contract code'],
                    ['Escrow holds both BTC and assets', 'Contract holds only tokens / NFTs, never BTC'],
                    ['Escrow agent can disappear with funds', 'No middleman, no rug-pull possible'],
                    ['All parties must be online at the same time', 'Trade 24/7, no coordination needed'],
                    ['Multi-step process with waiting periods', 'Single atomic transaction'],
                    ['Human error: wrong address, wrong amount', 'Code executes exactly as written'],
                    ['Disputes resolved subjectively by a person', 'Deterministic settlement by code'],
                    ['Escrow agent can be hacked or lose keys', 'Security inherited from Bitcoin itself'],
                    ['Escrow fees are unclear or negotiable', 'Transparent fixed platform fee'],
                    ['One person can only handle limited trades', 'Unlimited concurrent trades'],
                    ['Partial failure possible', 'Partial failure impossible'],
                  ].map(([trad, ours], i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-slate-500">{trad}</td>
                      <td className="px-4 py-3 text-slate-200">{ours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Core Features ───────────────────────────────────────────── */}
        {page === 2 && (
          <section className="space-y-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-white">Core Features</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-brand mb-2">Private Listings</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Restrict a listing to a single wallet address for off-market OTC deals.
                  Only the designated buyer can fill the offer. When they connect their wallet,
                  a notification badge appears in the navbar with a direct link to the listing.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-brand mb-2">Buy Requests</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Buyers can post requests for specific tokens or NFT collections at a price
                  they are willing to pay. No transaction is needed to create a request. When a
                  seller fulfills it, a private listing is created automatically for the buyer
                  and they receive a notification in their navbar as soon as they connect their wallet.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-brand mb-2">Split Fees</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Sellers can enable fee splitting so both parties share the platform fee equally.
                  The listing price is automatically adjusted so the seller gives up half the fee
                  and the buyer pays the other half. The breakdown is shown transparently before
                  the listing is created.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-brand mb-2">On-Chain Verification</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Every completed trade includes a link to the transaction on OPScan, allowing all
                  participants (buyer, seller, or any third party) to independently verify
                  settlement.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-brand mb-2">Wallet Integration</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Connect your OPNet-compatible wallet to list assets, fill offers, or place requests.
                  Your wallet handles all signing and private keys never leave your device.
                  Real-time transaction tracking lets you monitor progress from anywhere on the site.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── How Trading Works ───────────────────────────────────────── */}
        {page === 3 && (
          <section className="space-y-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-white">How Trading Works</h2>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">For Sellers</h3>
              <ol className="list-decimal list-inside space-y-3 text-sm text-slate-400 leading-relaxed">
                <li>Connect your wallet and navigate to the <Link href="/create" className="text-brand hover:underline">Create Listing</Link> page</li>
                <li>Select the asset type: OP-20 token or OP-721 NFT</li>
                <li>Set your terms: choose the asset, amount, and BTC price</li>
                <li>
                  Approve &amp; Create. Your wallet signs two transactions:
                  <ul className="list-disc list-inside ml-4 mt-2 space-y-1.5 text-slate-500">
                    <li>An approval granting the escrow contract permission to hold your assets</li>
                    <li>A create transaction that locks your assets in the smart contract</li>
                  </ul>
                </li>
                <li>Your listing is live and buyers can now fill it at any time</li>
                <li>Get notified when a buyer completes the purchase through your Sales indicator</li>
              </ol>
              <p className="text-xs text-slate-500 mt-4 italic">
                You can cancel an unfilled listing at any time to reclaim your assets.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">For Buyers</h3>
              <ol className="list-decimal list-inside space-y-3 text-sm text-slate-400 leading-relaxed">
                <li>Browse the marketplace on the <Link href="/assets" className="text-brand hover:underline">Assets</Link> page or search by listing ID</li>
                <li>Review the listing with full asset details, price, and seller information</li>
                <li>Fill the offer. Your wallet signs a single transaction that sends BTC to the seller and releases the escrowed assets to you</li>
                <li>Track confirmation in real time with on-chain status checks</li>
              </ol>
            </div>

            <div className="bg-surface-card border border-surface-border rounded-xl px-4 py-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="text-brand font-semibold">Atomic settlement:</span> Either both sides of
                the trade execute, or neither does. There is no scenario where a buyer sends BTC without
                receiving the assets, or vice versa.
              </p>
            </div>
          </section>
        )}

        {/* ── Future Improvements ─────────────────────────────────────── */}
        {page === 4 && (
          <section className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-white">Future Improvements</h2>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-400">
              <li>Improved UI design</li>
              <li>Semi-hidden private deals</li>
              <li>Analytics</li>
            </ul>
          </section>
        )}

      </div>

      {/* ── Navigation arrows ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-border">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={page === 0}
          className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <span className="text-lg">&larr;</span>
          {page > 0 && <span>{SECTIONS[page - 1].title}</span>}
        </button>

        <span className="text-xs text-slate-600">
          {page + 1} / {SECTIONS.length}
        </span>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={page === SECTIONS.length - 1}
          className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        >
          {page < SECTIONS.length - 1 && <span>{SECTIONS[page + 1].title}</span>}
          <span className="text-lg">&rarr;</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 pb-8">
        <p>
          Satoshi&apos;s Market is open source.{' '}
          <a
            href="https://github.com/solcollecta/satoshis-market"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline"
          >
            View on GitHub
          </a>
        </p>
        <span className="inline-flex items-center gap-1.5">
          Powered by
          <a href="https://opnet.org" target="_blank" rel="noopener noreferrer">
            <Image src="/opnet-logo.svg" alt="OPNet" width={40} height={15} className="opacity-50 hover:opacity-100 transition-opacity" />
          </a>
        </span>
      </footer>

    </div>
  );
}
