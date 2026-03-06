# AtomicSwapEscrow - Security Audit: BTC Payment Atomicity

**Date:** 2026-03-06
**Scope:** Analysis of whether a 2-step reservation system is needed to protect
buyers/sellers when listings are priced in BTC.
**Conclusion:** NOT NEEDED. The contract is already atomically safe by design.

---

## Executive Summary

The AtomicSwapEscrow contract uses a **"verify-don't-custody"** pattern where
BTC payment outputs are embedded in the SAME Bitcoin transaction as the
`fillOffer()` contract call. This makes the swap fully atomic at the Bitcoin
protocol level — there is no possible state where BTC is sent but tokens are
not released, or vice versa.

A 2-step reservation system would only be necessary if BTC payment and contract
execution were separate transactions. They are not.

---

## 1. How fillOffer Works — The Atomic Transaction

### 1.1 Transaction Structure

When a buyer fills an offer, the wallet builds ONE Bitcoin transaction:

```
Bitcoin Transaction (single txid)
├── Input(s):  Buyer's BTC UTXOs
├── Output 0:  OPNet Tapscript commitment (contract call: fillOffer)
├── Output 1:  P2TR payment to Seller (btcRecipientKey) >= btcSats
├── Output 2:  P2TR payment to Fee Recipient >= feeSats (if applicable)
└── Output 3:  Change back to Buyer
```

The contract call and the BTC payment are outputs in the SAME transaction.
Bitcoin miners either include the ENTIRE transaction in a block, or reject it
entirely. There is no partial execution.

### 1.2 Contract Verification (verify-don't-custody)

The contract does NOT hold, send, or receive BTC. It only READS the transaction
outputs and verifies they contain the required payments before releasing tokens.

**Contract source:** `atomic-swap-escrow-sandbox/src/AtomicSwapEscrow.ts`

---

## 2. Contract Code Evidence

### Evidence A: fillOffer() — Line 344-433

```typescript
public fillOffer(calldata: Calldata): BytesWriter {
    const offerId: u256 = calldata.readU256();

    const status: u256 = this._offerStatus.get(offerId);
    if (status != OFFER_STATUS_OPEN) throw new Revert('Offer not open');

    // ... load offer fields ...

    // CRITICAL LINE (382):
    // Contract inspects Blockchain.tx.outputs (this transaction's own outputs)
    // and verifies that the BTC payment to the seller is present.
    if (!this._verifyBtcPayment(makerKey, btcSats, feeKey, feeSats, feeBps)) {
        throw new Revert('BTC payment not found in transaction outputs');
    }

    // Only AFTER payment is verified: mark as filled and release tokens
    this._offerStatus.set(offerId, OFFER_STATUS_FILLED);   // line 394
    this._sendTokens(token, taker, tokenAmount);            // line 414
    // ...
}
```

**Key insight:** `Blockchain.tx.outputs` refers to the outputs of THIS
transaction — not a previous or future transaction. The contract reads the
BTC payment from the same tx that is executing the contract call.

### Evidence B: _verifyBtcPayment() — Line 575-638

```typescript
private _verifyBtcPayment(
    makerKey: u256,
    btcSats: u256,
    feeKey: u256,
    feeSats: u256,
    feeBps: u16,
): bool {
    const makerKeyBytes: Uint8Array = this._serializeKey(makerKey);

    if (feeBps == 0) {
        // Zero fee: require only the maker payment output.
        return this._findOutput(makerKeyBytes, btcSats);
    }

    if (feeKey == makerKey) {
        // Same address: single output >= (btcSats + feeSats).
        const totalSats: u256 = SafeMath.add(btcSats, feeSats);
        return this._findOutput(makerKeyBytes, totalSats);
    }

    // Different addresses: must find BOTH maker output AND fee output.
    const feeKeyBytes: Uint8Array = this._serializeKey(feeKey);
    let makerFound: bool = false;
    let feeFound: bool = false;

    const outputs = Blockchain.tx.outputs;   // <-- THIS transaction's outputs
    for (let i: i32 = 0; i < outputs.length; i++) {
        // ... match P2TR outputs by bech32 address or scriptPubKey ...
    }
    return makerFound && feeFound;           // BOTH must be present
}
```

The function iterates over `Blockchain.tx.outputs` — the outputs of the
currently executing transaction — and verifies:
1. A P2TR output to the seller's key with value >= required BTC sats
2. If fees apply: a P2TR output to the fee recipient with value >= fee sats

### Evidence C: _findOutput() — Line 647-674

```typescript
private _findOutput(keyBytes: Uint8Array, minSats: u256): bool {
    const outputs = Blockchain.tx.outputs;
    for (let i: i32 = 0; i < outputs.length; i++) {
        const output = outputs[i];
        const value: u256 = u256.fromU64(output.value);
        if (value < minSats) continue;

        // Path 1: bech32 address match (real execution on-chain)
        if (output.hasTo) {
            const addr: string | null = output.to;
            if (addr !== null) {
                const dec = Segwit.decodeOrNull(addr);
                if (dec !== null && dec.version == 1
                    && this._isKey32Match(dec.program, keyBytes)) {
                    return true;
                }
            }
        }

        // Path 2: raw scriptPubKey match (simulation)
        if (output.hasScriptPubKey) {
            const script: Uint8Array | null = output.scriptPublicKey;
            if (script !== null && this._isP2TRMatch(script, keyBytes)) {
                return true;
            }
        }
    }
    return false;   // No matching output found -> Revert
}
```

### Evidence D: Frontend builds BTC outputs into the same transaction

**File:** `atomic-swap-escrow-web-sandbox/src/lib/opnet.ts` — Line 1233-1309

```typescript
export async function simulateFillOffer(
  offerId: bigint,
  offer: Offer,
  feeRecipientKey: bigint,
  walletAddress: string,
): Promise<FillSimulation> {
  // Build BTC payment outputs
  const rawOutputs: { key: bigint; sats: bigint }[] = [];
  rawOutputs.push({ key: offer.btcRecipientKey, sats: offer.btcSatoshis });
  // ... fee outputs ...

  // Set outputs on contract for simulation
  contract.setTransactionDetails({ inputs: [], outputs: strippedOutputs });

  // Simulate fillOffer with outputs present
  const simulation = await contract.fillOffer(offerId);

  // Return extraOutputs for wallet to include in the SAME Bitcoin tx
  return { simulation, extraOutputs: psbtOutputs };
}
```

**File:** `atomic-swap-escrow-web-sandbox/src/app/listing/[id]/page.tsx` — Line 232-245

```typescript
const { simulation, extraOutputs } = await simulateFillOffer(
    offer.id, offer, feeRecipientKey, address,
);
const tx = await simulation.sendTransaction({
    signer: null,
    mldsaSigner: null,
    refundTo: address,
    maximumAllowedSatToSpend: 100_000n,
    network: OP_NETWORK,
    extraOutputs,   // <-- BTC payment outputs included in SAME tx
});
```

`extraOutputs` are the P2TR payment outputs (seller + fee). They are passed to
`sendTransaction()` which builds a SINGLE Bitcoin transaction containing both
the contract call and the BTC payments.

---

## 3. Atomicity Proof — All Failure Scenarios

| # | Scenario | What happens | BTC lost? | Tokens lost? |
|---|----------|-------------|-----------|-------------|
| 1 | fillOffer() reverts (any reason) | Entire Bitcoin tx is invalid, never mined | NO | NO |
| 2 | BTC outputs missing/insufficient | `_verifyBtcPayment` returns false -> Revert -> tx invalid | NO | NO |
| 3 | Token transfer fails | `_sendTokens` throws Revert -> tx invalid | NO | NO |
| 4 | Block reorg drops the tx | Entire tx (BTC + contract) is removed from chain | NO | NO |
| 5 | Someone else fills first | Status != OPEN -> Revert -> tx invalid | NO | NO |
| 6 | OTC restriction fails | `Not authorized taker` -> Revert -> tx invalid | NO | NO |
| 7 | Transaction confirms | BTC goes to seller AND tokens go to buyer | N/A | N/A |

**There is no scenario where BTC is sent but tokens are not released, or
tokens are released but BTC is not sent.** This is guaranteed by Bitcoin's
transaction model: all outputs in a transaction are either all included in a
block, or none of them are.

---

## 4. Why a 2-Step Reservation is NOT Needed

A 2-step reservation system solves the following problem:

> "What if the buyer sends BTC in transaction A, and then the contract call
> in transaction B fails? The buyer loses their BTC."

This problem **does not exist** in our design because:

1. BTC payment and contract call are in the **same Bitcoin transaction**
2. The contract reads `Blockchain.tx.outputs` — the outputs of **this tx**
3. If the contract reverts, the **entire tx** is invalid (including BTC outputs)
4. Bitcoin does not support partial transaction execution

The "verify-don't-custody" pattern (contract comment, line 80-82) is
specifically designed to avoid this class of vulnerability:

```
// BTC custody: contracts CANNOT hold BTC. The verify-don't-custody pattern is
// used -- BTC outputs are verified in Blockchain.tx.outputs before tokens are
// released.
```

### When WOULD a reservation be needed?

Only if:
- BTC payment and token swap were **separate transactions** (they are not)
- This were a **cross-chain** swap (BTC on chain A, tokens on chain B)
- The buyer had to manually send BTC via an external wallet (they do not)

None of these apply. OPNet runs ON Bitcoin L1, and the wallet builds a single
PSBT containing everything.

---

## 5. Additional Safety Measures Already in the Contract

### 5.1 Reentrancy Protection
```typescript
export class AtomicSwapEscrow extends ReentrancyGuard {
    protected override readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;
```

### 5.2 CEI Pattern (Checks-Effects-Interactions)
State is updated BEFORE external calls to prevent reentrancy drains:
```typescript
// CEI -- mark filled BEFORE releasing tokens (reentrancy drain prevention).
this._offerStatus.set(offerId, OFFER_STATUS_FILLED);   // Effect first
this._sendTokens(token, taker, tokenAmount);            // Interaction last
```

### 5.3 Input Validation
```typescript
if (tokenAmount == u256.Zero) throw new Revert('Amount cannot be zero');
if (btcSatoshis == u256.Zero) throw new Revert('BTC amount cannot be zero');
if (btcRecipientKey == u256.Zero) throw new Revert('Recipient key cannot be zero');
if (feeBps > MAX_FEE_BPS) throw new Revert('Fee exceeds 10%');
```

### 5.4 Authorization Checks
- Only the original maker can cancel (line 455)
- OTC offers enforce allowed taker via tweaked pubkey comparison (line 354-360)
- Fee recipient must be configured if feeBps > 0 (line 200-202)

---

## 6. OPScan Verification

Any filled offer on OPScan will show:
- **One single txid** for the fill operation
- That txid contains BOTH the OPNet contract execution AND the BTC payment outputs
- There are never two separate transactions for "pay BTC" and "receive tokens"

To verify: look up any filled offer's fill txid on OPScan and inspect the
transaction outputs — you will see the P2TR payment to the seller's address
alongside the contract call output, all in one transaction.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| Can BTC be sent without tokens being released? | **No** — same transaction |
| Can tokens be released without BTC being sent? | **No** — `_verifyBtcPayment` checks first |
| Can the contract hold BTC? | **No** — verify-don't-custody pattern |
| Is a 2-step reservation needed? | **No** — already atomic by design |
| Is the buyer protected? | **Yes** — if anything fails, entire tx reverts |
| Is the seller protected? | **Yes** — tokens only release after BTC output verified |
| What about block reorgs? | **Safe** — entire tx drops, both BTC and tokens |

**The AtomicSwapEscrow contract provides full atomic swap guarantees at the
Bitcoin protocol level. No additional reservation mechanism is required.**

---

*Audit performed by reviewing:*
- *Contract source: `C:\Users\Erdem\atomic-swap-escrow-sandbox\src\AtomicSwapEscrow.ts` (787 lines)*
- *Frontend integration: `C:\Users\Erdem\atomic-swap-escrow-web-sandbox\src\lib\opnet.ts` (lines 1171-1309)*
- *ABI definition: `C:\Users\Erdem\atomic-swap-escrow-web-sandbox\src\lib\abi.ts`*
- *Fill flow: `C:\Users\Erdem\atomic-swap-escrow-web-sandbox\src\app\listing\[id]\page.tsx` (lines 229-246)*
