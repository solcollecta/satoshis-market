import { NextRequest, NextResponse } from 'next/server';
import { fulfillRequest, getRequest } from '@/lib/requestsDb';
import { verifySignedRequest } from '@/lib/verifySignature';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body        = await req.json() as Record<string, unknown>;
    const listingId   = typeof body.listingId   === 'string' ? body.listingId.trim()   : '';
    const fulfilledBy = typeof body.fulfilledBy === 'string' ? body.fulfilledBy.trim() : '';

    if (!listingId)   return NextResponse.json({ error: 'listingId is required' },   { status: 400 });
    if (!fulfilledBy) return NextResponse.json({ error: 'fulfilledBy is required' }, { status: 400 });

    // Verify wallet signature
    const message   = typeof body.message   === 'string' ? body.message   : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';
    const publicKey = typeof body.publicKey === 'string' ? body.publicKey : '';

    const verify = verifySignedRequest(message, signature, publicKey, 'fulfill', fulfilledBy);
    if (!verify.valid) {
      return NextResponse.json({ error: verify.error ?? 'Signature verification failed' }, { status: 403 });
    }

    // Verify the request exists and is still open
    const existing = await getRequest(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.status !== 'open') {
      return NextResponse.json({ error: 'Request is already closed' }, { status: 409 });
    }

    const ok = await fulfillRequest(params.id, listingId, fulfilledBy);
    if (!ok) {
      return NextResponse.json({ error: 'Not found or already closed' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/requests fulfill]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
