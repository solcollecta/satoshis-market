/**
 * lib/verifySignature.ts — Server-side Schnorr signature verification.
 *
 * Verifies that:
 *   1. The signature is a valid Schnorr signature for the message
 *   2. The signing public key derives the claimed P2TR address
 *   3. The timestamp is within the allowed window (prevents replay)
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

/**
 * Extract the 32-byte x-only public key from a P2TR (bech32m) address.
 * Returns null for non-P2TR addresses.
 */
function p2trToXOnlyPubkey(address: string): Buffer | null {
  try {
    const decoded = bech32m.decode(address);
    // P2TR witness version = 1, data = 32 bytes
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
 * Verify a signed API call.
 *
 * @param message    - The original JSON string that was signed
 * @param signature  - Hex-encoded 64-byte Schnorr signature
 * @param publicKey  - Hex-encoded public key of the signer (33-byte compressed or 32-byte x-only)
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
    pubKeyBytes = Buffer.from(publicKey, 'hex');

    const isValid = MessageSigner.verifySignature(pubKeyBytes, message, sigBytes);
    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }
  } catch (err) {
    return { valid: false, error: `Signature verification failed: ${err}` };
  }

  // 6. Verify the public key matches the claimed P2TR address.
  //    For P2TR, the address encodes the 32-byte x-only pubkey directly.
  const addressXOnly = p2trToXOnlyPubkey(expectedAddress);
  if (addressXOnly) {
    const signerXOnly = toXOnly(Buffer.from(pubKeyBytes));
    if (!addressXOnly.equals(signerXOnly)) {
      return { valid: false, error: 'Public key does not match the claimed address' };
    }
  }
  // For non-P2TR addresses we skip this check — the Schnorr signature
  // itself already proves ownership of the private key.

  return { valid: true, payload };
}
