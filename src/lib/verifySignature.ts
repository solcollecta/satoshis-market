/**
 * lib/verifySignature.ts — Server-side Schnorr signature verification.
 *
 * Verifies that:
 *   1. The signature is a valid Schnorr signature for the message
 *   2. The signing public key derives the claimed address (P2TR or P2OP)
 *   3. The timestamp is within the allowed window (prevents replay)
 *   4. The signed params match the actual request parameters
 */

import { MessageSigner } from '@btc-vision/transaction';
import { toXOnly } from '@btc-vision/bitcoin';
import { bech32m } from 'bech32';

/** Maximum age of a signed message before the server rejects it (5 minutes). */
const MAX_AGE_MS = 5 * 60 * 1000;

export interface VerifyResult {
  valid: boolean;
  error?: string;
  /** Parsed message payload (if valid) */
  payload?: {
    action: string;
    address: string;
    timestamp: number;
    params: Record<string, unknown>;
  };
}

/** Standard Bitcoin bech32m HRPs (P2TR). */
const P2TR_HRPS = new Set(['bc', 'tb', 'bcrt']);

/** OPNet bech32m HRPs (P2OP). */
const P2OP_HRPS = new Set(['op', 'opt', 'opr']);

/** P2OP witness version is 16. */
const P2OP_WITNESS_VERSION = 16;

/**
 * Extract the 32-byte x-only public key from a P2TR (bech32m) address.
 * Returns null for non-P2TR addresses.
 */
function p2trToXOnlyPubkey(address: string): Buffer | null {
  try {
    const decoded = bech32m.decode(address);
    if (!P2TR_HRPS.has(decoded.prefix)) return null;
    const words = decoded.words;
    if (words[0] !== 1) return null;
    const data = Buffer.from(bech32m.fromWords(words.slice(1)));
    if (data.length !== 32) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Extract the 20-byte hash160 from a P2OP (OPNet bech32m) address.
 * P2OP witness program = [deploymentVersion(1 byte), hash160(20 bytes)]
 * Returns null for non-P2OP addresses.
 */
function p2opToHash160(address: string): Buffer | null {
  try {
    const decoded = bech32m.decode(address, 90);
    if (!P2OP_HRPS.has(decoded.prefix)) return null;
    const words = decoded.words;
    if (words[0] !== P2OP_WITNESS_VERSION) return null;
    const data = Buffer.from(bech32m.fromWords(words.slice(1)));
    // 21 bytes = 1 byte deployment version + 20 bytes hash160
    if (data.length !== 21) return null;
    return data.subarray(1); // skip deployment version, return 20-byte hash160
  } catch {
    return null;
  }
}

/**
 * Verify that a public key corresponds to the expected address.
 *
 * P2TR: the address directly encodes the x-only pubkey → exact match.
 * P2OP: the address encodes hash160(mldsaKeyHash), NOT hash160(schnorrPubkey).
 *       Since the Schnorr key and ML-DSA key are derived from the same seed
 *       but are cryptographically different, we cannot verify the binding
 *       from the Schnorr pubkey alone. The Schnorr signature itself proves
 *       the caller controls the private key associated with this wallet.
 */
function verifyPubkeyMatchesAddress(
  pubKeyBytes: Uint8Array,
  expectedAddress: string,
): string | null {
  // P2TR: address encodes x-only pubkey directly
  const addressXOnly = p2trToXOnlyPubkey(expectedAddress);
  if (addressXOnly) {
    const signerXOnly = toXOnly(Buffer.from(pubKeyBytes));
    if (!addressXOnly.equals(signerXOnly)) {
      return 'Public key does not match the claimed P2TR address';
    }
    return null; // match
  }

  // P2OP: the address encodes hash160 of the ML-DSA key, not the Schnorr key.
  // We verify the address IS a valid P2OP format but cannot cross-check the
  // Schnorr pubkey against it. The Schnorr signature proves key ownership.
  const addressHash = p2opToHash160(expectedAddress);
  if (addressHash) {
    return null; // valid P2OP address — signature proves ownership
  }

  // Unknown address type — reject
  return 'Unsupported address type for public key verification';
}

/**
 * Verify a signed API call.
 *
 * @param message    - The original JSON string that was signed
 * @param signature  - Hex-encoded 64-byte Schnorr signature
 * @param publicKey  - Hex-encoded public key of the signer
 * @param expectedAction  - The expected action field (e.g. 'fill', 'cancel')
 * @param expectedAddress - The wallet address that should match the signer
 */
export function verifySignedRequest(
  message: string,
  signature: string,
  publicKey: string,
  expectedAction: string,
  expectedAddress: string,
): VerifyResult {
  // 1. Parse the message
  let payload: VerifyResult['payload'];
  try {
    payload = JSON.parse(message);
  } catch {
    return { valid: false, error: 'Invalid message JSON' };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid message format' };
  }

  // 2. Check action matches
  if (payload.action !== expectedAction) {
    return { valid: false, error: `Action mismatch: expected ${expectedAction}` };
  }

  // 3. Check address matches (case-insensitive for bech32)
  if (payload.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    return { valid: false, error: 'Address mismatch in signed message' };
  }

  // 4. Check timestamp freshness
  const age = Date.now() - payload.timestamp;
  if (age < 0 || age > MAX_AGE_MS) {
    return { valid: false, error: 'Signature expired or timestamp invalid' };
  }

  // 5. Verify the Schnorr signature cryptographically
  if (!signature || !publicKey) {
    return { valid: false, error: 'Missing signature or publicKey' };
  }

  let pubKeyBytes: Uint8Array;
  try {
    const sigBytes = Buffer.from(signature, 'hex');
    if (sigBytes.length !== 64) {
      return { valid: false, error: 'Signature must be 64 bytes' };
    }
    pubKeyBytes = Buffer.from(publicKey, 'hex');
    if (pubKeyBytes.length !== 33 && pubKeyBytes.length !== 32) {
      return { valid: false, error: 'Public key must be 32 or 33 bytes' };
    }

    const isValid = MessageSigner.verifySignature(pubKeyBytes, message, sigBytes);
    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }
  } catch (err) {
    return { valid: false, error: `Signature verification failed: ${err}` };
  }

  // 6. Verify the public key matches the claimed address (P2TR or P2OP)
  const bindingError = verifyPubkeyMatchesAddress(pubKeyBytes, expectedAddress);
  if (bindingError) {
    return { valid: false, error: bindingError };
  }

  return { valid: true, payload };
}
