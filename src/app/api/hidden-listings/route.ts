import { NextRequest, NextResponse } from 'next/server';
import { markHidden, getHiddenIds } from '@/lib/hiddenDb';
import { verifySignedRequest } from '@/lib/verifySignature';

/** GET — return all hidden offer IDs as a JSON array. */
export async function GET() {
  try {
    const ids = await getHiddenIds();
    return NextResponse.json([...ids]);
  } catch (err) {
    console.error('[api/hidden-listings GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/** POST — mark an offer as hidden. Requires wallet signature. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const creatorAddress = typeof body.creatorAddress === 'string' ? body.creatorAddress.trim() : '';

    if (!creatorAddress) {
      return NextResponse.json({ error: 'creatorAddress is required' }, { status: 400 });
    }

    // Verify wallet signature
    const message   = typeof body.message   === 'string' ? body.message   : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';
    const publicKey = typeof body.publicKey === 'string' ? body.publicKey : '';

    const verify = verifySignedRequest(message, signature, publicKey, 'hide', creatorAddress);
    if (!verify.valid) {
      return NextResponse.json({ error: verify.error ?? 'Signature verification failed' }, { status: 403 });
    }

    // Use offerId from signed params
    const offerId = typeof verify.payload!.params.offerId === 'string' ? verify.payload!.params.offerId : '';
    if (!offerId) {
      return NextResponse.json({ error: 'offerId required in signed params' }, { status: 400 });
    }

    await markHidden(offerId, creatorAddress);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/hidden-listings POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
