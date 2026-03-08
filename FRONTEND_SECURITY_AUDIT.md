# OPNet Frontend Security Audit Report

**Project:** atomic-swap-escrow-web-sandbox-v2 (Satoshi's Market)
**Audit Type:** Frontend
**Date:** 2026-03-08
**Auditor:** AI-Assisted (Claude Opus 4.6)

> **DISCLAIMER:** This audit is AI-assisted and may contain errors, false positives, or miss critical vulnerabilities. This is NOT a substitute for a professional security audit by experienced human auditors. Do NOT deploy to production based solely on this review. Always engage professional auditors for contracts handling real value.

---

## CRITICAL Findings

### C-1: SSRF via NFT Metadata Proxy
**File:** `src/app/api/nft-metadata/route.ts:26`
**Severity:** CRITICAL

The `buildCandidates()` function passes arbitrary `https://` URLs directly to server-side `fetch()`:
```typescript
if (/^https?:\/\//.test(raw)) return [raw];
```

An attacker can call `/api/nft-metadata?url=http://169.254.169.254/latest/meta-data/` to access cloud provider metadata endpoints (AWS/GCP/Azure instance credentials), internal services, or other network resources behind the firewall.

**Recommendation:** Restrict `https://` URLs to a whitelist of known NFT metadata domains, or remove the passthrough entirely and only support `ipfs://` URIs.

---

### C-2: SQL Injection Risk in `listRequests` (LIKE wildcard injection)
**File:** `src/lib/requestsDb.ts:103`
**Severity:** MEDIUM (not true SQL injection, but data probing risk)

The search query `filter.q` is passed as a parameterized value (safe from SQL injection), but LIKE wildcards (`%`, `_`) within the user input are not escaped:
```typescript
const like = `%${filter.q}%`;
```

A user can craft search strings with `%` or `_` wildcards to probe column data patterns. This is a low-risk data probing concern, not a true SQLi.

**Recommendation:** Escape LIKE special characters: `filter.q.replace(/[%_]/g, '\\$&')`.

---

### C-3: Precision Loss in Fee Display
**File:** `src/app/create/page.tsx:761`
**Severity:** HIGH

```typescript
BigInt(Math.ceil(Number(btcSatsRaw) * currentFeeBps / 10_000))
```

`Number(btcSatsRaw)` loses precision for amounts > 2^53 sats (~900M BTC — unlikely but violates the principle). More critically, the intermediate `Number(btcSatsRaw) * currentFeeBps` can produce floating-point rounding errors even for normal amounts.

The actual fee calculation at line 95 correctly uses pure BigInt arithmetic. This is only a **display** issue.

**Recommendation:** Use `btcSatsRaw * BigInt(currentFeeBps) / 10_000n` consistently.

---

## HIGH Findings

### H-1: `any` Type Usage (13 instances)
**File:** `src/lib/opnet.ts` (lines 307, 395, 584, 625, 756, 776, 912, 1026, 1114, 1165, 1270, 1300, 1397)
**Severity:** HIGH (TypeScript Law Tier 1 violation)

All `getContract<any>(...)` calls bypass type safety. Every call has `eslint-disable` to suppress the warning. The SDK's `getContract` generic parameter should be typed with the contract's ABI interface.

Additionally:
- `src/app/mint/page.tsx:88` — `as any` cast on `signAndBroadcastInteraction`
- `src/app/mint/page.tsx:98` — `catch (e: any)` — untyped error
- `src/lib/opnet.ts:1270` — `any[]` for stripped outputs

**Recommendation:** Define typed contract interfaces or use the ABI type parameter properly. Use `unknown` + type narrowing for error handling.

### H-2: `eslint-disable` Suppressions (32 instances)
**Files:** Multiple components and hooks
**Severity:** HIGH (TypeScript Law Tier 1 violation)

- 14x `eslint-disable-next-line @typescript-eslint/no-explicit-any` in opnet.ts
- 14x `eslint-disable-line react-hooks/exhaustive-deps` across components
- 1x `@ts-ignore` in mint/page.tsx:78
- 1x `eslint-disable-next-line` in mint/page.tsx:87

The `react-hooks/exhaustive-deps` suppressions may mask stale closure bugs — each should be reviewed individually.

### H-3: Non-Null Assertions (`!`)
**File:** `src/app/create/page.tsx:326`, `src/components/PendingTxsIndicator.tsx:174,178`
**Severity:** HIGH (TypeScript Law Tier 1 violation)

```typescript
router.push(`/listing/${flow.state.offerId!.toString()}`);
href={pageLink(tx)!.href}
```

These will throw at runtime if the value is null/undefined.

**Recommendation:** Add explicit null checks or use optional chaining with fallback.

### H-4: `Buffer` Usage (9 instances)
**File:** `src/lib/opnet.ts` (lines 860, 1192, 1206, 1325, 1343, 1375, 1393), `src/app/mint/page.tsx` (47, 90)
**Severity:** HIGH (OPNet rule: Uint8Array only)

OPNet requires `Uint8Array` exclusively. `Buffer` is a Node.js-only polyfill (configured in next.config.js) which adds bundle size and isn't guaranteed cross-platform.

**Recommendation:** Replace with `Uint8Array` + hex encoding utilities (e.g., from `@noble/hashes/utils`).

### H-5: `as unknown as` Double Cast
**File:** `src/lib/opnet.ts:923`
**Severity:** HIGH (TypeScript Law Tier 1 violation)

```typescript
const operatorBigInt = (operatorAddr as unknown as { toBigInt?(): bigint }).toBigInt?.();
```

Complete type system bypass. This pattern hides potential runtime failures.

### H-6: `Number()` for Financial Values
**Files:** `src/lib/opnet.ts:212,225,1137,1286,1469,1476`, `src/lib/tokens.ts:178,203`, `src/app/request/[id]/page.tsx:29`, `src/components/RequestCard.tsx:135`
**Severity:** HIGH (precision risk)

Several places use `Number()` on values that should remain as `bigint`:
- `Number(p?.status ?? 0)` — safe (small enum)
- `Number(p.feeBps)` — safe (max 10000)
- `Number(sats) / 1e8` — **display-only** conversions, acceptable but imprecise for very large sats

The display helpers in `tokens.ts` (`formatTokenBalance`, `formatTokenCompact`) deliberately convert to `Number` for formatting — this is acceptable for display but should be documented.

### H-7: Unauthenticated API Endpoints
**Files:** `src/app/api/fill/route.ts`, `src/app/api/requests/[id]/fulfill/route.ts`
**Severity:** HIGH

- `POST /api/fill` — anyone can overwrite a fill txid for any listing
- `POST /api/requests/[id]/fulfill` — anyone can mark any request as fulfilled

These endpoints have no authentication. A malicious actor could:
1. Overwrite legitimate fill txids with fake ones
2. Mark buy requests as fulfilled without actually filling them

**Recommendation:** Add wallet signature verification or at minimum verify the caller's address against the on-chain offer state.

---

## MEDIUM Findings

### M-1: `parseFloat` for Financial Calculations
**File:** `src/lib/tokens.ts:205,210`, `src/app/api/btcprice/route.ts:31,54`
**Severity:** MEDIUM

`parseFloat` in tokens.ts is used for display-only formatting (compact notation like "12.4K"). The BTC price API uses it for the integer USD price. Both are acceptable for their use cases but should be documented.

### M-2: Error Detail Leakage in API Responses
**Files:** `src/app/api/requests/route.ts:26`, `src/app/api/fill/route.ts:13`
**Severity:** MEDIUM

```typescript
return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
```

Internal error messages (including stack traces, DB connection strings) are returned to the client. This leaks implementation details.

**Recommendation:** Log errors server-side only, return generic messages to the client.

### M-3: `neon()` Called Per Request (No Singleton)
**File:** `src/lib/db.ts:8-12`
**Severity:** MEDIUM

```typescript
function getSQL() {
  const url = process.env.DATABASE_URL;
  return neon(url);
}
```

A new `neon()` client is created on every call. While Neon's serverless driver is designed for this, it means no connection reuse. Consider caching the client.

### M-4: Missing `as const` on Constants
**File:** `src/types/offer.ts`
**Severity:** LOW (TypeScript Law Tier 5)

`OFFER_STATUS` map and `OfferStatusCode` type should use `as const` pattern per TypeScript Law.

### M-5: Missing `readonly` on Interface Fields
**Files:** Multiple interfaces across `src/types/offer.ts`, `src/lib/requestsDb.ts`, `src/lib/pendingTxs.ts`, `src/lib/createDraft.ts`
**Severity:** LOW (TypeScript Law Tier 2/4)

Interfaces lack `readonly` modifiers on fields. Per TypeScript Law, all interface fields should be `readonly` unless mutation is explicitly required.

---

## OPNet-Specific Checks (PASS)

| Check | Status | Notes |
|-------|--------|-------|
| No raw PSBT construction | PASS | No `new Psbt()` or `Psbt.fromBase64()` found |
| Frontend: signer=null, mldsaSigner=null | PASS | All 5 `sendTransaction()` calls correctly pass `null` |
| Uses `increaseAllowance` (not `approve`) | PASS | `simulateApprove` calls `increaseAllowance` |
| Simulates before sending | PASS | All flows simulate then send |
| setTransactionDetails before simulate | PASS | Fill flow sets details before sim |
| Output index starts at 1 | PASS | `i + 1` offset in simulateFillOffer |
| No private keys in frontend | PASS | No key material in client code |
| bigint for satoshi amounts | PASS | Core math uses BigInt throughout |
| Dual confirmation paths | PASS | Receipt + offer state for fill/cancel |
| Allowance polling (not receipt-only) | PASS | confirmFn for OP-20 approve gating |
| Dust threshold validation | PASS | 546 sats minimum enforced |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 (SSRF) |
| HIGH | 7 |
| MEDIUM | 5 |
| LOW | 2 |

**Top priority fixes:**
1. **SSRF in nft-metadata proxy** — restrict allowed URL schemes/domains
2. **Unauthenticated write APIs** — add auth to fill/fulfill endpoints
3. **Error detail leakage** — stop returning internal errors to clients
4. **Fee display precision** — use pure BigInt math on line 761

The core OPNet integration patterns (contract calls, signer handling, simulation flow, output construction) are correctly implemented. The main risks are in the traditional web security surface (SSRF, API auth, error leakage) rather than OPNet-specific concerns.

---

---

# Plain English Explanation

Below is the same audit explained in simple terms with examples.

---

## CRITICAL: Your server can be used as a spy (SSRF)

**What's the problem?**
Your `/api/nft-metadata` endpoint takes a URL and fetches it from your server. It's meant for IPFS gateways, but anyone can pass internal URLs:

```
/api/nft-metadata?url=http://169.254.169.254/latest/meta-data/
```

This lets an attacker read your cloud provider's secret credentials (like AWS keys), scan internal services, or access anything your server can reach that the public internet normally can't.

**Real-world example:**
An attacker sends that request, your server fetches it, and returns the response — which might contain your AWS access key. Now they have access to your cloud account.

---

## HIGH: Anyone can fake fill/fulfill data

**What's the problem?**
`POST /api/fill` and `POST /api/requests/[id]/fulfill` don't check who is making the request. Anyone can:
- Write a fake transaction ID for any listing
- Mark a buy request as "fulfilled" without actually fulfilling it

**Real-world example:**
Someone sends this from their browser console:
```json
POST /api/fill
{ "listingId": "5", "txid": "fake123", "seller": "whatever" }
```
Now listing #5 shows a fake fill txid to everyone.

---

## HIGH: Internal error messages leak to the browser

**What's the problem?**
When your server has an error, it sends the real error message back to the user:
```json
{ "error": "Internal error", "detail": "connection to database at 'neon-db-xyz.com' failed..." }
```
An attacker sees your database URL, file paths, and other internal details.

**Real-world example:**
Someone intentionally sends malformed data to your API. The error response reveals your database host, which they can then try to attack directly.

---

## HIGH: Fee display uses imprecise math

**What's the problem?**
Line 761 in `create/page.tsx`:
```typescript
BigInt(Math.ceil(Number(btcSatsRaw) * currentFeeBps / 10_000))
```
`Number()` can be imprecise with large numbers. The actual fee calculation (line 95) correctly uses pure BigInt — only the **display** is affected.

**Real-world example:**
A user sees "Fee: 0.00001000 BTC" but the actual fee sent to the contract is "0.00001001 BTC". Confusing, but not a fund loss.

---

## HIGH: `any` types and `eslint-disable` everywhere

In `opnet.ts` there are 13 places with `getContract<any>(...)` plus `eslint-disable` comments. This turns off TypeScript's type checking — the compiler can't catch bugs in those areas. Not directly dangerous, but it hides potential issues.

**Real-world example:**
You pass the wrong parameter type to a contract call. Normally TypeScript would catch this at compile time. With `any`, it silently compiles and only fails at runtime.

---

## HIGH: `Buffer` instead of `Uint8Array`

OPNet standard requires `Uint8Array`. Your code uses `Buffer.from(...)` in 9 places — this only works because of the polyfill in `next.config.js`. It's not portable and adds unnecessary bundle size.

---

## MEDIUM: Search field allows SQL wildcards

If someone types `%` or `_` in the search box, they can use SQL wildcard matching to probe what data exists in your database. Not a real SQL injection (your queries are parameterized), but unnecessary.

**Real-world example:**
Someone searches `___` (three underscores) to find all 3-character token symbols, or `%admin%` to check if any admin-related data exists.

---

## What passed with flying colors

All the OPNet-specific patterns are correctly implemented:
- No raw PSBT construction (good — uses SDK properly)
- `signer: null` on all frontend transactions (good — wallet handles signing)
- Uses `increaseAllowance` not `approve` (good — prevents race condition)
- Always simulates before sending (good — catches errors early)
- Dust threshold validation (good — prevents unspendable outputs)
- Allowance polling for OP-20 approvals (good — doesn't rely on receipt alone)

---

## Can these be fixed?

**Quick fixes** (can be done right away):
1. **SSRF** — add a URL whitelist, only allow `ipfs://` and known metadata domains
2. **Fee display** — swap `Number()` for pure BigInt math
3. **Error leakage** — remove `detail` from error responses
4. **SQL wildcards** — escape `%` and `_` in search input

**Bigger changes** (need more planning):
5. **API authentication** — add wallet signature verification to write endpoints
6. **`any` types** — define proper typed interfaces for each contract
7. **`Buffer` to `Uint8Array`** — replace all 9 instances with portable code
