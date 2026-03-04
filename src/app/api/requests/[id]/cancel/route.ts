import { NextRequest, NextResponse } from 'next/server';
import { cancelRequest } from '@/lib/requestsDb';

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
    const ok = cancelRequest(params.id, requesterAddress);
    if (!ok) {
      return NextResponse.json({ error: 'Not found or not authorised' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/requests cancel]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
