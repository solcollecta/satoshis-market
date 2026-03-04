export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Normalise any IPFS URI variant to a list of candidate HTTP URLs to try in order.
 *
 * Handles:
 *   ipfs://CID/...          → [cloudflare, ipfs.io, dweb.link]
 *   ipfs://ipfs/CID/...     → same (strips redundant "ipfs/" prefix)
 *   https?://anything       → [as-is]
 *   anything else           → null (caller returns 400)
 */
function resolveToGateways(raw: string): string[] | null {
  let cidPath: string | null = null;

  if (raw.startsWith('ipfs://')) {
    let rest = raw.slice(7); // strip "ipfs://"
    if (rest.startsWith('ipfs/')) rest = rest.slice(5); // strip redundant "ipfs/"
    cidPath = rest;
  } else if (/^https?:\/\//.test(raw)) {
    return [raw]; // already an HTTP URL — try as-is
  } else {
    return null; // unrecognised scheme
  }

  return [
    `https://cloudflare-ipfs.com/ipfs/${cidPath}`,
    `https://ipfs.io/ipfs/${cidPath}`,
    `https://dweb.link/ipfs/${cidPath}`,
  ];
}

/**
 * GET /api/nft-metadata?url=<encoded>
 *
 * Server-side proxy for NFT token URI metadata JSON.
 * IPFS gateways block CORS from the browser, so we fetch server-side
 * and forward the parsed JSON. Tries multiple gateways for IPFS URIs.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url') ?? '';

  if (!rawUrl) {
    return Response.json({ error: 'missing url param' }, { status: 400 });
  }

  const candidates = resolveToGateways(rawUrl);
  if (!candidates) {
    console.warn('[nft-metadata] unrecognised URL scheme', { rawUrl });
    return Response.json({ error: `unrecognised url scheme: ${rawUrl.slice(0, 60)}` }, { status: 400 });
  }

  console.log('[nft-metadata] incoming', { rawUrl, candidates });

  let lastErr = 'unknown error';

  for (const fetchUrl of candidates) {
    try {
      console.log('[nft-metadata] trying', fetchUrl);

      const res = await fetch(fetchUrl, {
        signal: AbortSignal.timeout(10_000), // 10s — IPFS gateways can be slow
        redirect: 'follow',
        headers: { Accept: 'application/json, */*' },
      });

      const contentType = res.headers.get('content-type') ?? '';
      console.log('[nft-metadata] upstream response', {
        fetchUrl,
        status: res.status,
        contentType,
      });

      if (!res.ok) {
        let body = '';
        try { body = (await res.text()).slice(0, 200); } catch { /* ignore */ }
        console.error('[nft-metadata] upstream non-ok', { fetchUrl, status: res.status, body });
        lastErr = `upstream ${res.status}: ${body}`;
        continue; // try next gateway
      }

      // Parse body — handle both JSON and text/plain that contains JSON
      let json: unknown;
      const text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        console.error('[nft-metadata] non-JSON body', {
          fetchUrl,
          contentType,
          preview: text.slice(0, 200),
        });
        lastErr = `non-JSON response (${contentType}): ${text.slice(0, 100)}`;
        continue; // try next gateway
      }

      console.log('[nft-metadata] success', {
        fetchUrl,
        keys: Object.keys(json as object),
      });

      return Response.json(json, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });

    } catch (err) {
      console.error('[nft-metadata] fetch threw', { fetchUrl, err: String(err) });
      lastErr = String(err);
      // continue to next gateway
    }
  }

  console.error('[nft-metadata] all candidates failed', { rawUrl, lastErr });
  return Response.json({ error: `all gateways failed: ${lastErr}` }, { status: 502 });
}
