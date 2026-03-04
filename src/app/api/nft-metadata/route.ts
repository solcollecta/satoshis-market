export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolve ipfs:// to https gateway server-side */
function resolveIpfs(url: string): string {
  return url.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${url.slice(7)}` : url;
}

/**
 * GET /api/nft-metadata?url=<encoded>
 *
 * Server-side proxy for NFT token URI metadata JSON.
 * IPFS gateways block CORS from browsers, so this fetches server-side
 * and forwards the JSON response. Supports ipfs:// and https:// URLs.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return Response.json({ error: 'missing url param' }, { status: 400 });
  }

  const fetchUrl = resolveIpfs(rawUrl);
  console.log('[nft-metadata] proxy fetching', { rawUrl, fetchUrl });

  try {
    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.error('[nft-metadata] upstream error', { fetchUrl, status: res.status });
      return Response.json({ error: `upstream ${res.status}` }, { status: 502 });
    }

    const json = await res.json();
    console.log('[nft-metadata] success', { fetchUrl, keys: Object.keys(json as object) });
    return Response.json(json, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[nft-metadata] fetch failed', { fetchUrl, err: String(err) });
    return Response.json({ error: 'fetch failed' }, { status: 502 });
  }
}
