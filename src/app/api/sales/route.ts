import { NextRequest, NextResponse } from 'next/server';
import { getSalesForSeller } from '@/lib/fillsDb';

export async function GET(req: NextRequest) {
  try {
    const seller = req.nextUrl.searchParams.get('seller');
    if (!seller) return NextResponse.json({ error: 'seller required' }, { status: 400 });
    const sales = await getSalesForSeller(seller);
    return NextResponse.json(sales);
  } catch (err) {
    console.error('[api/sales GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
