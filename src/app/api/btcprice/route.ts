import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res  = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
      next: { revalidate: 30 }, // cache for 30s
    });
    const data = await res.json() as { price: string };
    return NextResponse.json({ price: Math.round(parseFloat(data.price)) });
  } catch {
    return NextResponse.json({ price: null }, { status: 502 });
  }
}
