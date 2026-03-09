export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Build ordered list of gateway URLs to try for a given raw tokenURI.
 *
 * Handles:
 *   ipfs://CID/...       → 4 gateways in priority order
 *   ipfs://ipfs/CID/...  → same (strips redundant ipfs/ prefix)
 *   https?://...         → use as-is (single candidate)
 *   anything else        → null → caller returns 400
 */
/** Allowed HTTPS hostnames for direct URL pass-through (SSRF protection) */
const ALLOWED_HOSTS = new Set([
  'images.opnet.org',
  'cloudflare-ipfs.com',
  'ipfs.io',
  'dweb.link',
  'gateway.pinata.cloud',
  'nftstorage.link',
  'arweave.net',
]);

function buildCandidates(raw: string): string[] | null {
  if (raw.startsWith('ipfs://')) {
    let cidPath = raw.slice(7);
    if (cidPath.startsWith('ipfs/')) cidPath = cidPath.slice(5); // strip ipfs://ipfs/

    return [
      `https://images.opnet.org/ipfs/${cidPath}`,   // OPNet gateway — fastest
      `https://cloudflare-ipfs.com/ipfs/${cidPath}`,
      `https://ipfs.io/ipfs/${cidPath}`,
      `https://dweb.link/ipfs/${cidPath}`,
    ];
  }

  if (/^https?:\/\//.test(raw)) {
    try {
      const url = new URL(raw);
      // Block private/internal IPs (SSRF protection)
      const host = url.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('10.') ||
        host.startsWith('172.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return null; // block internal URLs
      }
      // Only allow known NFT/IPFS hosts
      if (!ALLOWED_HOSTS.has(host)) {
        return null;
      }
    } catch {
      return null;
    }
    return [raw];
  }

  return null; // unrecognised scheme
}

/**
 * GET /api/nft-metadata?url=<encoded>
 *
 * Server-side proxy for NFT tokenURI metadata JSON.
 * IPFS gateways CORS-block browsers; we fetch server-side and forward JSON.
 * Tries multiple gateways in order, continuing on timeout / non-2xx / non-JSON.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url') ?? '';

  if (!rawUrl) {
    return Response.json({ error: 'missing url param' }, { status: 400 });
  }

  const candidates = buildCandidates(rawUrl);
  if (!candidates) {
    console.warn('[nft-metadata] unrecognised scheme', rawUrl.slice(0, 80));
    return Response.json({ error: `unrecognised url scheme` }, { status: 400 });
  }

  console.log('[nft-metadata] request', { rawUrl, candidates });

  const errors: string[] = [];

  for (const fetchUrl of candidates) {
    try {
      console.log('[nft-metadata] trying', fetchUrl);

      let res = await fetch(fetchUrl, {
        signal: AbortSignal.timeout(20_000), // 20s — IPFS gateways are slow
        redirect: 'manual',
        headers: { Accept: 'application/json, */*' },
      });

      // Handle redirects manually to prevent SSRF via open-redirect
      if ([301, 302, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          errors.push(`${fetchUrl} → redirect ${res.status} with no Location header`);
          continue;
        }
        let redirectHost: string;
        try {
          const redirectUrl = new URL(location, fetchUrl);
          redirectHost = redirectUrl.hostname.toLowerCase();
        } catch {
          errors.push(`${fetchUrl} → redirect to invalid URL: ${location.slice(0, 200)}`);
          continue;
        }
        if (!ALLOWED_HOSTS.has(redirectHost)) {
          console.warn('[nft-metadata] blocked redirect to disallowed host', { fetchUrl, location });
          errors.push(`${fetchUrl} → redirect to disallowed host: ${redirectHost}`);
          continue;
        }
        const resolvedUrl = new URL(location, fetchUrl).toString();
        console.log('[nft-metadata] following validated redirect', { from: fetchUrl, to: resolvedUrl });
        res = await fetch(resolvedUrl, {
          signal: AbortSignal.timeout(20_000),
          redirect: 'manual',
          headers: { Accept: 'application/json, */*' },
        });
      }

      const contentType = res.headers.get('content-type') ?? '';
      console.log('[nft-metadata] response', { fetchUrl, status: res.status, contentType });

      if (!res.ok) {
        let preview = '';
        try { preview = (await res.text()).slice(0, 200); } catch { /* ignore */ }
        console.warn('[nft-metadata] non-ok', { fetchUrl, status: res.status, preview });
        errors.push(`${fetchUrl} → ${res.status}: ${preview}`);
        continue;
      }

      // Read as text first — some gateways return JSON as text/plain
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        const preview = text.slice(0, 200);
        console.warn('[nft-metadata] non-JSON', { fetchUrl, contentType, preview });
        errors.push(`${fetchUrl} → non-JSON (${contentType}): ${preview}`);
        continue;
      }

      console.log('[nft-metadata] success', { fetchUrl, keys: Object.keys(json as object) });
      return Response.json(json, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });

    } catch (err) {
      const msg = String(err);
      console.warn('[nft-metadata] fetch error', { fetchUrl, err: msg });
      errors.push(`${fetchUrl} → ${msg}`);
      // continue to next gateway
    }
  }

  console.error('[nft-metadata] all gateways failed', { rawUrl, errors });
  return Response.json({ error: 'all gateways failed' }, { status: 502 });
}
