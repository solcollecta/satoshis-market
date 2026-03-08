export const OFFER_STATUS = {
  0: 'Not Found',
  1: 'Open',
  2: 'Filled',
  3: 'Cancelled',
} as const;

export type OfferStatusCode = 0 | 1 | 2 | 3;

export interface Offer {
  id: bigint;
  maker: string;
  token: string;
  tokenAmount: bigint;
  tokenId: bigint;
  isNFT: boolean;
  btcSatoshis: bigint;
  btcRecipientKey: bigint;  // 32-byte P2TR tweaked pubkey as bigint
  status: OfferStatusCode;
  feeBps: number;
  allowedTaker: bigint;  // 32-byte secp256k1 tweaked pubkey as bigint; 0n = public offer
}
