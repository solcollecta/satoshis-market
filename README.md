# AtomicSwap Escrow — Web UI

Next.js 14 (TypeScript, Tailwind CSS) frontend for the **AtomicSwapEscrow** OPNet contract.
Supports trustless OP-20 token and OP-721 NFT ↔ BTC swaps.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# → edit .env.local (see section below)

# 3. Dev server
npm run dev
# → http://localhost:3000
```

---

## Environment variables (`.env.local`)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed escrow contract address | `bcrt1p…` |
| `NEXT_PUBLIC_NETWORK` | `regtest` / `testnet` / `mainnet` | `regtest` |
| `NEXT_PUBLIC_RPC_URL` | OPNet JSON-RPC endpoint | `http://localhost:9001` |
| `NEXT_PUBLIC_MAX_OFFER_ID` | Max offer ID to scan on home page | `50` |

---

## Pages

### `/` — Offer list
Scans offer IDs 1..N (configurable in the UI). Shows open offers first, then filled/cancelled.

### `/create` — Create offer
- **OP-20 mode**: escrow `tokenAmount` tokens in exchange for `btcSatoshis`.
- **OP-721 mode**: escrow NFT `tokenId` in exchange for `btcSatoshis`.

> **Prerequisites before submitting:**
> You must call `token.approve(escrowAddress, amount)` (OP-20) or
> `nft.approve(escrowAddress, tokenId)` (OP-721) first so the contract can pull your assets.

### `/offer/[id]` — Offer detail
Shows all offer fields.

**For takers (Fill Offer):**
The page displays the exact P2TR outputs your Bitcoin transaction must include:

| Case | Required outputs |
|---|---|
| `feeBps == 0` | One P2TR output to `btcRecipientKey` ≥ `btcSats` |
| `feeBps > 0`, same key | One P2TR output to `btcRecipientKey` ≥ `btcSats + feeSats` |
| `feeBps > 0`, different keys | Two outputs: maker ≥ `btcSats` AND fee recipient ≥ `feeSats` |

**For makers (Cancel Offer):**
Returns your escrowed tokens/NFT and marks the offer cancelled.

---

## Wallet support

The app detects wallet extensions in this order:

1. **OPNet native wallet** (`window.opnet`) — full support including `sendOpNetTransaction`
2. **Unisat** (`window.unisat`) — PSBT signing
3. **Leather / Hiro** (`window.leather`) — PSBT signing

If your wallet does not implement `sendOpNetTransaction`, the UI will show you the **raw calldata hex** to submit manually (via OPNet CLI or another tool).

---

## OPNet selectors

OPNet uses **SHA-256** (first 4 bytes) for function selectors, unlike EVM which uses keccak256.

| Function | Selector |
|---|---|
| `createOffer(address,uint256,uint256,uint256,uint16,address)` | SHA-256[0:4] |
| `createNFTOffer(address,uint256,uint256,uint256,uint16,address)` | SHA-256[0:4] |
| `fillOffer(uint256)` | SHA-256[0:4] |
| `cancelOffer(uint256)` | SHA-256[0:4] |
| `getOffer(uint256)` | SHA-256[0:4] |

---

## Project structure

```
src/
  app/
    layout.tsx          # Root layout (Navbar + WalletProvider)
    page.tsx            # Home — offer list
    create/page.tsx     # Create offer form
    offer/[id]/page.tsx # Offer detail + actions
  components/
    Navbar.tsx
    WalletBar.tsx
    OfferCard.tsx
    Field.tsx
  context/
    WalletContext.tsx   # React context for wallet state
  lib/
    opnet.ts            # OPNet RPC wrapper + helpers
    wallet.ts           # Wallet detection + connection
    abi.ts              # Contract ABI definition
  types/
    offer.ts            # Offer type + status constants
```

---

## Build

```bash
npm run build    # Production build
npm run dev      # Dev server (hot reload)
npm run type-check  # TypeScript check only
```
