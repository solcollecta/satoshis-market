/**
 * /api/opnet-rpc — server-side proxy for OPNet JSON-RPC calls.
 *
 * Env var priority (server-side only — never bundled into the client):
 *   1. OP_RPC_URL              — private server-only var (preferred)
 *   2. NEXT_PUBLIC_OP_RPC_URL  — falls back to the public var when no private
 *                                one is set, so a single env entry is enough
 *
 * Why proxy instead of direct client calls?
 *   - No CORS issues (browser sees same-origin /api/opnet-rpc)
 *   - Actual RPC endpoint is not exposed in the client JS bundle when
 *     OP_RPC_URL (non-NEXT_PUBLIC) is used
 *   - Always returns valid JSON so callers can reliably detect errors
 *
 * Response contract:
 *   200  upstream response forwarded as-is (valid JSON-RPC)
 *   502  upstream returned non-200 OR network error reaching upstream
 *   503  OP_RPC_URL not configured
 *
 *   On 502/503 the body is always: { "error": { "code": -32603, "message": "..." } }
 */

import { NextRequest, NextResponse } from 'next/server';

const TARGET_URL = process.env.OP_RPC_URL ?? process.env.NEXT_PUBLIC_OP_RPC_URL;

const rpcError = (message: string, status: number) =>
  NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32603, message } },
    { status },
  );

export async function POST(req: NextRequest) {
  if (!TARGET_URL) {
    return rpcError(
      'RPC endpoint not configured — set OP_RPC_URL (or NEXT_PUBLIC_OP_RPC_URL) in your environment',
      503,
    );
  }

  let upstream: Response;
  try {
    const body = await req.text();
    upstream = await fetch(TARGET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network error';
    return rpcError(`RPC upstream unreachable: ${msg}`, 502);
  }

  if (!upstream.ok) {
    return rpcError(
      `RPC upstream returned HTTP ${upstream.status} ${upstream.statusText}`,
      502,
    );
  }

  // Upstream returned 200 — forward the body verbatim.
  // JSON-RPC uses 200 even for method-level errors, so we never inspect the body.
  const text = await upstream.text();
  return new NextResponse(text, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
