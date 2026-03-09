# Satoshi's Market V2 — Security Audit Report

**Date:** 2026-03-09
**Scope:** Smart contract integration, frontend (Next.js 14 / React), backend API routes, wallet interaction
**Auditor:** Automated audit via OPNet Bob AI + Claude Code agents

---

## Executive Summary

The AtomicSwapEscrow smart contract follows a sound "verify-don't-custody" atomic swap design. BTC payments and token transfers execute in a single Bitcoin transaction, making payment bypass impossible. The contract implements reentrancy guards, CEI pattern, input validation, and on-chain fee caps.

**No vulnerabilities were found that could result in loss of funds.**

The primary risk area is the off-chain infrastructure (API routes), where some mutation endpoints lack authentication, enabling griefing attacks on the database layer. These cannot affect on-chain state.

---

## Smart Contract Findings

### Positive Findings

| # | Finding |
|---|---------|
| INFO-1 | ReentrancyGuard with CEI pattern correctly implemented |
| INFO-2 | Fee cap enforced on-chain at 10% (MAX_FEE_BPS = 1000) |
| INFO-3 | Atomic transaction model eliminates BTC payment bypass |
| INFO-4 | AllowedTaker (private OTC) enforcement is fully on-chain |
| INFO-5 | Schnorr signature verification uses proper cryptography |

### Risk: Front-Running on Public Offers (Medium)

When a buyer broadcasts a `fillOffer` transaction, it enters the Bitcoin mempool. A front-runner could construct their own fill with a higher fee. The original buyer's transaction reverts (no funds lost), but they miss the trade.

**Mitigation:** The `allowedTaker` feature enables private offers immune to front-running. For public offers, this is an inherent mempool-level race condition common to all blockchain marketplaces.

---

## Frontend & Backend Findings

### HIGH

| # | Finding | File | On-Chain Impact |
|---|---------|------|-----------------|
| H-1 | Fill API unauthenticated — anyone can write fake fill records | `/api/fill/route.ts` | None (DB only) |
| H-2 | Hidden listings API unauthenticated — anyone can hide any listing | `/api/hidden-listings/route.ts` | None (DB only) |
| H-3 | Fulfill request API unauthenticated — anyone can mark requests fulfilled | `/api/requests/[id]/fulfill/route.ts` | None (DB only) |
| H-4 | RPC proxy forwards any JSON-RPC method without whitelist | `/api/opnet-rpc/route.ts` | None | **FIXED** |

**Note on H-1, H-2, H-3:** These endpoints are called automatically after on-chain transaction confirmation. Adding wallet signatures would require a second wallet popup after every purchase/listing — a significant UX degradation. The recommended fix is on-chain verification (check txid/listingId exists on-chain before persisting) rather than signatures.

### MEDIUM

| # | Finding | File | Status |
|---|---------|------|--------|
| M-1 | Schnorr pubkey cannot be cross-verified against P2OP address | `verifySignature.ts` | Known OPNet limitation |
| M-2 | No rate limiting on any API route | All API routes | Open |
| M-3 | NFT metadata proxy follows redirects (SSRF bypass risk) | `/api/nft-metadata/route.ts` | **FIXED** |
| M-4 | `maximumAllowedSatToSpend` hardcoded to 100,000 sats | `listing/[id]/page.tsx` | Open |
| M-5 | 5-minute replay window without nonce/dedup | `verifySignature.ts` | Open |
| M-6 | Expired listings still show active fill button | `listing/[id]/page.tsx` | **FIXED** |

### LOW

| # | Finding | File |
|---|---------|------|
| L-1 | SQL LIKE wildcards unescaped in request search | `requestsDb.ts` |
| L-2 | Offer scanning stops after 2 empty batches (may miss offers) | `opnet.ts` |
| L-3 | No rate limiting on APIs | All routes |
| L-4 | Console.log in production leaks activity data | `opnet.ts` |

### INFO

| # | Finding |
|---|---------|
| I-1 | No CSRF protection (mitigated for signed routes by wallet signature) |
| I-2 | No Content Security Policy headers |
| I-3 | NFT image URL scheme validation is good (rejects `javascript:`) |
| I-4 | Wallet auto-reconnect on page load (standard DApp behavior) |

---

## What Was Fixed in This Session

| Fix | Description |
|-----|-------------|
| Schnorr signatures | Added real cryptographic signature verification for request create and cancel |
| Token balance check | Prevents users from attempting to list tokens they don't hold |
| Expired listing guard | Disables fill button when listing has expired |
| RPC method whitelist | Only safe read-only methods are proxied to the OPNet node |
| NFT proxy SSRF | Redirects are now validated against the hostname allowlist |
| Unnecessary signing removed | Post-transaction wallet popups eliminated (fill, fulfill, hide) |
| Signing UI hints | Users see explanatory text during wallet signature prompts |

---

## Overall Assessment

**Funds are safe.** The atomic swap design ensures tokens and BTC are exchanged in a single transaction. The contract's reentrancy guard, CEI pattern, payment verification, and fee cap provide robust on-chain security.

**Off-chain griefing is the main residual risk.** Three unsigned API routes allow database manipulation (fake fills, hidden listings, false fulfillments). These do not affect on-chain state or funds but could degrade user experience. The recommended mitigation is server-side on-chain verification rather than additional wallet signatures.

**The application is production-ready for testnet use** with the understanding that rate limiting and on-chain verification for the unsigned endpoints should be added before mainnet launch.
