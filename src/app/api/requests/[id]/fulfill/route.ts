import { NextRequest, NextResponse } from 'next/server';
import { fulfillRequest } from '@/lib/requestsDb';

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

    const ok = fulfillRequest(params.id, listingId, fulfilledBy);
    if (!ok) {
      return NextResponse.json({ error: 'Not found or already closed' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/requests fulfill]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
