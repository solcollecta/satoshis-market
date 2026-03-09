import { NextRequest, NextResponse } from 'next/server';
import { cancelRequest, getRequest } from '@/lib/requestsDb';
import { verifySignedRequest } from '@/lib/verifySignature';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body             = await req.json() as Record<string, unknown>;
    const requesterAddress = typeof body.requesterAddress === 'string' ? body.requesterAddress.trim() : '';

    if (!requesterAddress) {
      return NextResponse.json({ error: 'requesterAddress is required' }, { status: 400 });
    }

    // Verify wallet signature
    const message   = typeof body.message   === 'string' ? body.message   : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';
    const publicKey = typeof body.publicKey === 'string' ? body.publicKey : '';

    const verify = verifySignedRequest(message, signature, publicKey, 'cancel', requesterAddress);
    if (!verify.valid) {
      return NextResponse.json({ error: verify.error ?? 'Signature verification failed' }, { status: 403 });
    }

    // Verify the signed requestId matches the URL param
    const signedRequestId = verify.payload!.params.requestId;
    if (typeof signedRequestId === 'string' && signedRequestId !== params.id) {
      return NextResponse.json({ error: 'Signed requestId does not match URL' }, { status: 403 });
    }

    // Verify the caller's address matches the stored requester
    const existing = await getRequest(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.requesterAddress.toLowerCase() !== requesterAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorised — address does not match requester' }, { status: 403 });
    }

    const ok = await cancelRequest(params.id, requesterAddress);
    if (!ok) {
      return NextResponse.json({ error: 'Not found or already closed' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/requests cancel]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
