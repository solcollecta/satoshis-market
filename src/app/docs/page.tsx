'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-10 animate-fade-in">

      {/* Hero */}
      <header className="space-y-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          Satoshi&apos;s <span className="text-brand">Market</span>
        </h1>
        <p className="text-lg text-slate-400 leading-relaxed max-w-2xl">
          Satoshi&apos;s Market is built on a simple premise: markets should not require trust
          in institutions, only trust in code.
        </p>
      </header>

      {/* Introduction */}
      <section className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          By leveraging Bitcoin as the settlement layer and OPNet smart contracts as programmable
          escrow, trade becomes a deterministic process governed by cryptography rather than
          intermediaries.
        </p>
        <p>
          Every trade is executed through an on-chain escrow contract. The seller&apos;s assets are
          locked in the contract until a buyer sends the required BTC. Once payment is confirmed,
          the contract releases the assets to the buyer and the BTC to the seller, atomically,
          in a single settlement. No trust required.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {[
            ['Trustless', 'Smart contract escrow eliminates counterparty risk'],
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
      </section>

      <hr className="border-surface-border" />

      {/* Core Features */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Core Features</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-brand">Wallet Integration</h3>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              Connect your OPNet-compatible wallet to list assets, fill offers, or place requests.
              Your wallet handles all signing and private keys never leave your device.
              Real-time transaction tracking lets you monitor progress from anywhere on the site.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-brand">Seller Notifications</h3>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              When one of your listings is purchased, a notification badge appears in the
              navbar, even if you were offline at the time of sale. The dropdown shows your
              recent sales with direct links to each listing and its on-chain transaction.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-brand">On-Chain Verification</h3>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              Every completed trade includes a link to the transaction on OPScan, allowing all
              participants (buyer, seller, or any third party) to independently verify
              settlement.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-surface-border" />

      {/* How Trading Works */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">How Trading Works</h2>

        <div>
          <h3 className="text-sm font-semibold text-white mb-3">For Sellers</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-400 leading-relaxed">
            <li>Connect your wallet and navigate to the <Link href="/create" className="text-brand hover:underline">Create Listing</Link> page</li>
            <li>Select the asset type: OP-20 token or OP-721 NFT</li>
            <li>Set your terms: choose the asset, amount, and BTC price</li>
            <li>
              Approve &amp; Create. Your wallet signs two transactions:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-slate-500">
                <li>An approval granting the escrow contract permission to hold your assets</li>
                <li>A create transaction that locks your assets in the smart contract</li>
              </ul>
            </li>
            <li>Your listing is live and buyers can now fill it at any time</li>
            <li>Get notified when a buyer completes the purchase through your Sales indicator</li>
          </ol>
          <p className="text-xs text-slate-500 mt-3 italic">
            You can cancel an unfilled listing at any time to reclaim your assets.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-3">For Buyers</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-400 leading-relaxed">
            <li>Browse the marketplace on the <Link href="/assets" className="text-brand hover:underline">Assets</Link> page or search by listing ID</li>
            <li>Review the listing with full asset details, price, and seller information</li>
            <li>Fill the offer. Your wallet signs a single transaction that sends BTC to the seller and releases the escrowed assets to you</li>
            <li>Track confirmation in real time with on-chain status checks</li>
          </ol>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="text-brand font-semibold">Atomic settlement:</span> Either both sides of
            the trade execute, or neither does. There is no scenario where a buyer sends BTC without
            receiving the assets, or vice versa.
          </p>
        </div>
      </section>

      <hr className="border-surface-border" />

      {/* Request System */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Request System</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Not finding what you&apos;re looking for? The Request System lets buyers signal demand
          for specific assets.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-400 leading-relaxed">
          <li>Create a request specifying the token or collection you want, the amount, and the BTC you&apos;re willing to pay</li>
          <li>Your request is visible to all sellers browsing the marketplace</li>
          <li>A seller fills your request by locking the requested assets into escrow at your offered price</li>
          <li>Settlement follows the same trustless atomic swap as a standard trade</li>
        </ol>
        <p className="text-xs text-slate-500 italic">
          This creates a two-sided marketplace: sellers list what they have, buyers request what they want.
        </p>
      </section>

      <hr className="border-surface-border" />

      {/* Marketplace Features */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Marketplace Features</h2>

        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['Search & Discovery', 'Find tokens and collections by name, navigate directly to any listing by ID, or filter by asset type and status.'],
            ['Private Listings', 'Share listings via direct link for off-market deals. Recipients are notified through the Private Listings indicator.'],
            ['BTC Price Feed', 'Displays a reference BTC price to help users evaluate listing values relative to market conditions.'],
            ['Transaction History', 'All completed trades are recorded on-chain and accessible via OPScan. Sellers can review sales through the Sales indicator.'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="border-surface-border" />

      {/* Future Improvements */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-white">Future Improvements</h2>
        <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-400">
          <li>Improved UI design</li>
          <li>Semi-hidden private deals</li>
          <li>Analytics</li>
        </ul>
      </section>

      <hr className="border-surface-border" />

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
