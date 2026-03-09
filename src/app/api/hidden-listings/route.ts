import { NextRequest, NextResponse } from 'next/server';
import { markHidden, getHiddenIds } from '@/lib/hiddenDb';

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

/** POST — mark an offer as hidden. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const creatorAddress = typeof body.creatorAddress === 'string' ? body.creatorAddress.trim() : '';
    const offerId        = typeof body.offerId        === 'string' ? body.offerId.trim()        : '';

    if (!creatorAddress) {
      return NextResponse.json({ error: 'creatorAddress is required' }, { status: 400 });
    }
    if (!offerId) {
      return NextResponse.json({ error: 'offerId is required' }, { status: 400 });
    }

    await markHidden(offerId, creatorAddress);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/hidden-listings POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
