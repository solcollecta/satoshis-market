import { NextRequest, NextResponse } from 'next/server';
import { listRequests, getRequest, createRequest } from '@/lib/requestsDb';

// ── GET /api/requests ─────────────────────────────────────────────────────────
// Query params: status, assetType, q, id
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (id) {
      const request = await getRequest(id);
      if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(request);
    }

    const filter = {
      status:    searchParams.get('status')    ?? undefined,
      assetType: searchParams.get('assetType') ?? undefined,
      q:         searchParams.get('q')         ?? undefined,
    };
    return NextResponse.json(await listRequests(filter));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/requests GET]', msg, err);
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
  }
}

// ── POST /api/requests ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // Required
    const requesterAddress = typeof body.requesterAddress === 'string' ? body.requesterAddress.trim() : '';
    const assetType        = typeof body.assetType        === 'string' ? body.assetType        : '';
    const contractAddress  = typeof body.contractAddress  === 'string' ? body.contractAddress.trim()  : '';
    const btcSatsRaw       = typeof body.btcSats          === 'string' ? body.btcSats          : '';

    if (!requesterAddress) return NextResponse.json({ error: 'requesterAddress is required' }, { status: 400 });
    if (!contractAddress)  return NextResponse.json({ error: 'contractAddress is required' },  { status: 400 });
    if (assetType !== 'op20' && assetType !== 'op721') {
      return NextResponse.json({ error: 'assetType must be op20 or op721' }, { status: 400 });
    }

    let btcSats: bigint;
    try {
      btcSats = BigInt(btcSatsRaw);
      if (btcSats <= 0n) throw new Error();
    } catch {
      return NextResponse.json({ error: 'btcSats must be a positive integer string' }, { status: 400 });
    }

    // OP-20 specifics
    let tokenAmountRaw: string | undefined;
    let tokenDecimals:  number | undefined;
    if (assetType === 'op20') {
      const rawAmt = typeof body.tokenAmountRaw === 'string' ? body.tokenAmountRaw : '';
      const rawDec = typeof body.tokenDecimals  === 'number' ? body.tokenDecimals  : -1;
      if (!rawAmt) return NextResponse.json({ error: 'tokenAmountRaw is required for OP-20' }, { status: 400 });
      try {
        if (BigInt(rawAmt) <= 0n) throw new Error();
      } catch {
        return NextResponse.json({ error: 'tokenAmountRaw must be a positive integer string' }, { status: 400 });
      }
      if (rawDec < 0 || rawDec > 18) return NextResponse.json({ error: 'tokenDecimals must be 0-18' }, { status: 400 });
      tokenAmountRaw = rawAmt;
      tokenDecimals  = rawDec;
    }

    // OP-721 specifics
    let tokenId: string | undefined;
    if (assetType === 'op721') {
      const raw = typeof body.tokenId === 'string' ? body.tokenId.trim() : '';
      tokenId = raw || undefined;
    }

    const tokenSymbol      = typeof body.tokenSymbol      === 'string' ? body.tokenSymbol.trim()      || undefined : undefined;
    const tokenName        = typeof body.tokenName        === 'string' ? body.tokenName.trim()        || undefined : undefined;
    const restrictedSeller = typeof body.restrictedSeller === 'string' ? body.restrictedSeller.trim() || undefined : undefined;
    const sharedFees       = body.sharedFees === true;

    const created = await createRequest({
      requesterAddress,
      assetType: assetType as 'op20' | 'op721',
      contractAddress,
      tokenAmountRaw,
      tokenDecimals,
      tokenSymbol,
      tokenName,
      tokenId,
      btcSats: btcSats.toString(),
      restrictedSeller,
      sharedFees,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/requests POST]', msg, err);
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
  }
}
