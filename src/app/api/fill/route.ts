import { NextRequest, NextResponse } from 'next/server';
import { getFillTxid, saveFillTxid } from '@/lib/fillsDb';

export async function GET(req: NextRequest) {
  try {
    const listingId = req.nextUrl.searchParams.get('listingId');
    if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    const txid = await getFillTxid(listingId);
    return NextResponse.json({ txid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/fill GET]', msg);
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const listingId = typeof body.listingId === 'string' ? body.listingId.trim()
                    : typeof body.listingId === 'number' ? String(body.listingId) : '';
    const txid = typeof body.txid === 'string' ? body.txid.trim() : '';

    if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
    if (!txid) return NextResponse.json({ error: 'txid required' }, { status: 400 });

    await saveFillTxid(listingId, txid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/fill POST]', msg);
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
  }
}
