import { NextRequest, NextResponse } from 'next/server';
import { getFillTxid, saveFillTxid } from '@/lib/fillsDb';

export async function GET(req: NextRequest) {
  try {
    const listingId = req.nextUrl.searchParams.get('listingId');
    if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    const txid = await getFillTxid(listingId);
    return NextResponse.json({ txid });
  } catch (err) {
    console.error('[api/fill GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const seller    = typeof body.seller    === 'string' ? body.seller.trim()    : '';
    const listingId = typeof body.listingId === 'string' ? body.listingId.trim() : '';
    const txid      = typeof body.txid      === 'string' ? body.txid.trim()      : '';

    if (!seller)    return NextResponse.json({ error: 'seller required' },    { status: 400 });
    if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    if (!txid)      return NextResponse.json({ error: 'txid required' },      { status: 400 });

    await saveFillTxid(listingId, txid, seller);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/fill POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
