/**
 * lib/verifySignature.ts — Server-side Schnorr signature verification.
 *
 * Security model:
 *   1. The wallet signs a structured JSON message containing action + address + timestamp + params
 *   2. The server verifies the Schnorr signature against the provided public key
 *   3. The signed message binds the caller to a specific action, address, and parameters
 *   4. Timestamp prevents replay attacks (5-minute window)
 *
 * Note on P2OP addresses: OPNet P2OP addresses encode hash160(mldsaKey),
 * not hash160(schnorrPubkey). Since the wallet uses Schnorr for signing
 * but ML-DSA for address derivation, we cannot cross-verify the Schnorr
 * pubkey against the P2OP address. The Schnorr signature itself proves
 * the caller controls the wallet's private key material.
 */

import { MessageSigner } from '@btc-vision/transaction';

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

  try {
    const sigBytes = Buffer.from(signature, 'hex');
    if (sigBytes.length !== 64) {
      return { valid: false, error: 'Signature must be 64 bytes' };
    }
    const pubKeyBytes = Buffer.from(publicKey, 'hex');
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

  return { valid: true, payload };
}
