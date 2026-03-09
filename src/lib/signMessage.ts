'use client';

/**
 * lib/signMessage.ts — Client-side message signing via OP_WALLET / Unisat.
 *
 * Uses MessageSigner.signMessageAuto() which auto-detects the wallet
 * extension and delegates Schnorr signing to it (no private key needed).
 *
 * The signed payload includes:
 *   - action: identifies the API endpoint
 *   - address: the caller's wallet address
 *   - timestamp: unix ms (server rejects if too old)
 *   - params: arbitrary action-specific data (bound to the signature)
 */

import { MessageSigner } from '@btc-vision/transaction';

export interface SignedPayload {
  /** The JSON message that was signed */
  message: string;
  /** Hex-encoded 64-byte Schnorr signature */
  signature: string;
  /** Hex-encoded public key of the signer */
  publicKey: string;
}

/**
 * Build a structured message, sign it with the wallet, and return
 * the message + signature + publicKey as hex strings for the API.
 *
 * @throws Error if the wallet cannot provide a public key
 */
export async function signApiCall(
  action: string,
  address: string,
  params: Record<string, unknown> = {},
): Promise<SignedPayload> {
  const message = JSON.stringify({
    action,
    address,
    timestamp: Date.now(),
    params,
  });

  // signMessageAuto() detects OP_WALLET in the browser and delegates
  // signing to the extension — no keypair argument needed.
  const signed = await MessageSigner.signMessageAuto(message);

  // We need the signer's public key for server-side verification.
  // OP_WALLET exposes it via window.opnet after connection.
  let publicKey = '';
  if (typeof window !== 'undefined' && window.opnet) {
    try {
      const pk = await window.opnet.getPublicKey();
      publicKey = typeof pk === 'string' ? pk : Buffer.from(pk).toString('hex');
    } catch {
      // will be caught below
    }
  }

  if (!publicKey) {
    throw new Error('Wallet did not provide a public key. Please reconnect your wallet.');
  }

  return {
    message,
    signature: Buffer.from(signed.signature).toString('hex'),
    publicKey,
  };
}
