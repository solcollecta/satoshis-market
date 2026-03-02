/**
 * ABI definition for AtomicSwapEscrow — compatible with opnet's getContract().
 *
 * Types come from the installed packages:
 *   ABIDataTypes   → @btc-vision/transaction  (enum with uppercase string values)
 *   BitcoinAbiTypes → opnet                    (enum: Function | Event)
 *
 * This mirrors abis/AtomicSwapEscrow.abi.ts from the contract repo, adapted
 * for the web client (no OP_NET_ABI spread needed for view-only usage).
 */
import { ABIDataTypes } from '@btc-vision/transaction';
import { BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

export const AtomicSwapEscrowAbi: BitcoinInterfaceAbi = [
  // ── Write functions ───────────────────────────────────────────────────────
  {
    name: 'createOffer',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'token', type: ABIDataTypes.ADDRESS },
      { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
      { name: 'btcSatoshis', type: ABIDataTypes.UINT256 },
      { name: 'btcRecipientKey', type: ABIDataTypes.UINT256 },
      { name: 'feeBps', type: ABIDataTypes.UINT16 },
      { name: 'allowedTaker', type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'createNFTOffer',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'token', type: ABIDataTypes.ADDRESS },
      { name: 'tokenId', type: ABIDataTypes.UINT256 },
      { name: 'btcSatoshis', type: ABIDataTypes.UINT256 },
      { name: 'btcRecipientKey', type: ABIDataTypes.UINT256 },
      { name: 'feeBps', type: ABIDataTypes.UINT16 },
      { name: 'allowedTaker', type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'fillOffer',
    type: BitcoinAbiTypes.Function,
    inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
  },
  {
    name: 'cancelOffer',
    type: BitcoinAbiTypes.Function,
    inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
  },
  // ── View functions ────────────────────────────────────────────────────────
  {
    name: 'getOffer',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
    outputs: [
      { name: 'maker', type: ABIDataTypes.ADDRESS },
      { name: 'token', type: ABIDataTypes.ADDRESS },
      { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
      { name: 'tokenId', type: ABIDataTypes.UINT256 },
      { name: 'isNFT', type: ABIDataTypes.BOOL },
      { name: 'btcSatoshis', type: ABIDataTypes.UINT256 },
      { name: 'btcRecipientKey', type: ABIDataTypes.UINT256 },
      { name: 'status', type: ABIDataTypes.UINT8 },
      { name: 'feeBps', type: ABIDataTypes.UINT16 },
      { name: 'allowedTaker', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'getFeeRecipientKey',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [{ name: 'feeRecipientKey', type: ABIDataTypes.UINT256 }],
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    name: 'OfferCreated',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'offerId', type: ABIDataTypes.UINT256 },
      { name: 'maker', type: ABIDataTypes.ADDRESS },
      { name: 'token', type: ABIDataTypes.ADDRESS },
      { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
      { name: 'tokenId', type: ABIDataTypes.UINT256 },
      { name: 'isNFT', type: ABIDataTypes.BOOL },
      { name: 'btcSatoshis', type: ABIDataTypes.UINT256 },
      { name: 'btcRecipientKey', type: ABIDataTypes.UINT256 },
      { name: 'feeBps', type: ABIDataTypes.UINT16 },
      { name: 'allowedTaker', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'OfferFilled',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'offerId', type: ABIDataTypes.UINT256 },
      { name: 'maker', type: ABIDataTypes.ADDRESS },
      { name: 'taker', type: ABIDataTypes.ADDRESS },
      { name: 'token', type: ABIDataTypes.ADDRESS },
      { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
      { name: 'tokenId', type: ABIDataTypes.UINT256 },
      { name: 'isNFT', type: ABIDataTypes.BOOL },
      { name: 'feeSats', type: ABIDataTypes.UINT256 },
      { name: 'feeRecipientKey', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'OfferCancelled',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'offerId', type: ABIDataTypes.UINT256 },
      { name: 'maker', type: ABIDataTypes.ADDRESS },
      { name: 'token', type: ABIDataTypes.ADDRESS },
      { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
      { name: 'tokenId', type: ABIDataTypes.UINT256 },
      { name: 'isNFT', type: ABIDataTypes.BOOL },
    ],
  },
];
