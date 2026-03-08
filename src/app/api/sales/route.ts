import { NextRequest, NextResponse } from 'next/server';
import { getSalesForSeller } from '@/lib/fillsDb';

export async function GET(req: NextRequest) {
  try {
    const seller = req.nextUrl.searchParams.get('seller');
    if (!seller) return NextResponse.json({ error: 'seller required' }, { status: 400 });
    const sales = await getSalesForSeller(seller);
    return NextResponse.json(sales);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/sales GET]', msg);
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
  }
}
