import { NextRequest, NextResponse } from 'next/server';
import { getFillTxid, saveFillTxid } from '@/lib/fillsDb';
import { verifySignedRequest } from '@/lib/verifySignature';

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

    if (!seller) return NextResponse.json({ error: 'seller required' }, { status: 400 });

    // Verify wallet signature
    const message   = typeof body.message   === 'string' ? body.message   : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';
    const publicKey = typeof body.publicKey === 'string' ? body.publicKey : '';

    const verify = verifySignedRequest(message, signature, publicKey, 'fill', seller);
    if (!verify.valid) {
      return NextResponse.json({ error: verify.error ?? 'Signature verification failed' }, { status: 403 });
    }

    // Use params from the signed message (not unsigned body fields)
    const listingId = typeof verify.payload!.params.listingId === 'string' ? verify.payload!.params.listingId : '';
    const txid      = typeof verify.payload!.params.txid      === 'string' ? verify.payload!.params.txid      : '';

    if (!listingId) return NextResponse.json({ error: 'listingId required in signed params' }, { status: 400 });
    if (!txid)      return NextResponse.json({ error: 'txid required in signed params' },      { status: 400 });

    await saveFillTxid(listingId, txid, seller);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/fill POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
