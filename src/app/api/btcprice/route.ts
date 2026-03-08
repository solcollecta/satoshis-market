/**
 * /api/btcprice — server-side BTC/USD price fetch with multi-source fallback.
 *
 * Sources tried in order (first success wins):
 *   1. Binance  — https://api.binance.com  (fast, but blocked on some hosts)
 *   2. CoinGecko — https://api.coingecko.com  (reliable, rate-limited on free tier)
 *   3. Kraken   — https://api.kraken.com  (reliable fallback)
 *
 * Response:
 *   200  { price: number }   — integer USD price
 *   502  { price: null }     — all sources failed
 *
 * Cache: responses are cached 30 s at the CDN edge via Cache-Control header.
 * Runtime: nodejs (not edge) — edge runtime blocks most external fetch on Vercel free tier.
 */

import { NextResponse } from 'next/server';

// Force Node.js runtime so fetch has no edge-network restrictions on Vercel.
export const runtime = 'nodejs';

// Tell Next.js not to statically cache this route.
export const dynamic = 'force-dynamic';

async function fromBinance(): Promise<number> {
  const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data = await res.json() as { price: string };
  const price = Math.round(parseFloat(data.price));
  if (!Number.isFinite(price) || price <= 0) throw new Error('Binance bad price');
  return price;
}

async function fromCoinGecko(): Promise<number> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    { signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json() as { bitcoin: { usd: number } };
  const price = Math.round(data.bitcoin.usd);
  if (!Number.isFinite(price) || price <= 0) throw new Error('CoinGecko bad price');
  return price;
}

async function fromKraken(): Promise<number> {
  const res = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
  const data = await res.json() as { result: { XXBTZUSD: { c: [string] } } };
  const price = Math.round(parseFloat(data.result.XXBTZUSD.c[0]));
  if (!Number.isFinite(price) || price <= 0) throw new Error('Kraken bad price');
  return price;
}

export async function GET() {
  const sources: Array<[string, () => Promise<number>]> = [
    ['binance', fromBinance],
    ['coingecko', fromCoinGecko],
    ['kraken', fromKraken],
  ];

  for (const [name, fn] of sources) {
    try {
      const price = await fn();
      console.log(`[btcprice] ${name} → $${price}`);
      return NextResponse.json(
        { price },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          },
        },
      );
    } catch (err) {
      console.warn(`[btcprice] ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.error('[btcprice] all sources failed — returning null');
  return NextResponse.json(
    { price: null },
    {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
