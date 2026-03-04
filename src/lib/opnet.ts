/**
 * lib/opnet.ts — OPNet SDK client wrapper for AtomicSwapEscrow.
 *
 * Uses the official opnet SDK:
 *   JSONRpcProvider  — connects to an OPNet node via HTTP JSON-RPC
 *   getContract      — returns a typed proxy that encodes/decodes ABI calls
 *
 * Official endpoints (from opnet README / docs):
 *   Regtest (OPNet testnet): https://regtest.opnet.org   network: networks.regtest
 *   Mainnet:                 https://mainnet.opnet.org   network: networks.bitcoin
 *
 * NOTE: OPNet does not operate a separate "Bitcoin testnet" instance yet.
 *       The regtest node at regtest.opnet.org is the canonical shared
 *       test environment used for demos and integration testing.
 *
 * Required env vars (.env.local):
 *   NEXT_PUBLIC_OP_RPC_URL         — OPNet node RPC endpoint
 *                                    default: https://regtest.opnet.org
 *   NEXT_PUBLIC_OP_NETWORK         — "regtest" | "mainnet"
 *                                    default: regtest
 *   NEXT_PUBLIC_CONTRACT_ADDRESS   — deployed escrow contract address (bech32)
 *   NEXT_PUBLIC_MAX_OFFER_ID       — highest offerId to scan (default: 50)
 */

import { networks } from '@btc-vision/bitcoin';
import type { Network, PsbtOutputExtended } from '@btc-vision/bitcoin';
import { ABIDataTypes, Address, AddressVerificator, AddressTypes } from '@btc-vision/transaction';
import { bech32m } from 'bech32';
import { getContract, JSONRpcProvider, BitcoinAbiTypes, OP_721_ABI } from 'opnet';
import type {
  BaseContractProperties,
  BitcoinInterfaceAbi,
  BitcoinAbiValue,
  CallResult,
  ContractDecodedObjectResult,
} from 'opnet';

import { AtomicSwapEscrowAbi } from './abi';
import type { Offer, OfferStatusCode } from '@/types/offer';

// ── Config ────────────────────────────────────────────────────────────────────

export const OP_RPC_URL =
  process.env.NEXT_PUBLIC_OP_RPC_URL ?? 'https://regtest.opnet.org';

export const OP_NETWORK_NAME =
  (process.env.NEXT_PUBLIC_OP_NETWORK as 'regtest' | 'mainnet' | 'testnet') ?? 'regtest';

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

export const MAX_OFFER_ID = parseInt(
  process.env.NEXT_PUBLIC_MAX_OFFER_ID ?? '50',
  10,
);

/** Resolved bitcoinjs-style Network object for the configured network */
export const OP_NETWORK: Network =
  OP_NETWORK_NAME === 'mainnet' ? networks.bitcoin :
  OP_NETWORK_NAME === 'testnet' ? networks.testnet :
  networks.regtest;

// ── OPScan explorer ───────────────────────────────────────────────────────────

/**
 * OPScan network slug used in ?network= query params.
 * Set NEXT_PUBLIC_OPNET_NETWORK in .env.local to override.
 * Defaults to "op_testnet" for regtest/testnet and "op_mainnet" for mainnet.
 */
export const OPSCAN_NETWORK: string =
  process.env.NEXT_PUBLIC_OPNET_NETWORK ??
  (OP_NETWORK_NAME === 'mainnet' ? 'op_mainnet' : 'op_testnet');

/** OPScan — transaction page. */
export function getOpscanTxUrl(txHash: string): string {
  return `https://opscan.org/transactions/${txHash}?network=${OPSCAN_NETWORK}`;
}

/** OPScan — account/address page (P2TR bech32m: opt1p…, tb1p…). */
export function getOpscanAccountUrl(addr: string): string {
  return `https://opscan.org/accounts/${addr}?network=${OPSCAN_NETWORK}`;
}

/** OPScan — OP-20 token page (0x… contract address). */
export function getOpscanTokenUrl(token0x: string): string {
  return `https://opscan.org/tokens/${token0x}?network=${OPSCAN_NETWORK}`;
}

/** OPScan — OP-721 / generic contract page (0x… contract address). */
export function getOpscanContractUrl(contract0x: string): string {
  return `https://opscan.org/contracts/${contract0x}?network=${OPSCAN_NETWORK}`;
}

// ── Transaction receipt helper ────────────────────────────────────────────────

/**
 * Best-effort on-chain confirmation check via btc_getTransactionReceipt.
 *
 * Returns:
 *   true             — receipt found with blockNumber (confirmed)
 *   false            — receipt not found or not yet confirmed (keep polling)
 *   'rpc_unavailable' — proxy returned 502/503 (upstream unreachable or not
 *                       configured). Callers should fall back to offer-state
 *                       checks rather than treating this as a permanent error.
 *
 * Routes through /api/opnet-rpc (same-origin proxy) in the browser.
 * Falls back to OP_RPC_URL for server-side calls (SSR / build time).
 *
 * Exported so useTxFlow, useFillFlow and useCancelFlow share one implementation.
 */
export async function checkTxConfirmed(txHash: string): Promise<boolean | 'rpc_unavailable'> {
  try {
    const url = typeof window !== 'undefined' ? '/api/opnet-rpc' : OP_RPC_URL;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'btc_getTransactionReceipt',
        params: [txHash],
      }),
    });
    // 502/503 = our proxy couldn't reach upstream or isn't configured.
    // Signal this explicitly so callers can skip to offer-state fallbacks.
    if (res.status === 502 || res.status === 503) return 'rpc_unavailable';
    if (!res.ok) return false;
    const data = await res.json() as { result?: Record<string, unknown> | null };
    return data.result != null && data.result['blockNumber'] != null;
  } catch {
    return false;
  }
}

// ── Provider (singleton, lazy) ────────────────────────────────────────────────

let _provider: JSONRpcProvider | null = null;

/**
 * Returns the shared JSONRpcProvider instance.
 * Safe to call repeatedly — creates at most one instance per page load.
 *
 * Constructor signature (from installed opnet 1.8.0):
 *   new JSONRpcProvider(url: string, network: Network, timeout?: number)
 */
function getProvider(): JSONRpcProvider {
  if (!_provider) {
    _provider = new JSONRpcProvider(OP_RPC_URL, OP_NETWORK);
  }
  return _provider;
}

// ── Contract interface ────────────────────────────────────────────────────────

/**
 * Typed contract interface for AtomicSwapEscrow view functions.
 *
 * The SDK's getContract() Proxy intercepts method calls, encodes calldata
 * via the ABI, calls the node, and decodes the response.
 * Decoded values land in CallResult.properties as ContractDecodedObjectResult
 * (i.e. Record<string, DecodedCallResult>); we cast fields at access time.
 */
interface IAtomicSwapEscrow extends BaseContractProperties {
  getOffer(offerId: bigint): Promise<CallResult<ContractDecodedObjectResult>>;
  getFeeRecipientKey(): Promise<CallResult<ContractDecodedObjectResult>>;
}

/**
 * Returns a typed contract proxy for the deployed AtomicSwapEscrow.
 *
 * getContract signature (opnet 1.8.0):
 *   getContract<T>(address, abi, provider, network, sender?) → BaseContract<T> & T
 */
function getEscrowContract(): IAtomicSwapEscrow {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      'NEXT_PUBLIC_CONTRACT_ADDRESS is not set. Add it to .env.local.',
    );
  }
  return getContract<IAtomicSwapEscrow>(
    CONTRACT_ADDRESS,
    AtomicSwapEscrowAbi,
    getProvider(),
    OP_NETWORK,
  );
}

// ── Core view calls ───────────────────────────────────────────────────────────

/**
 * Fetch a single offer by ID.
 *
 * Returns null if the offer does not exist (status === 0) or if the
 * RPC call rejects (node returns an error for an unknown ID).
 */
export async function getOffer(offerId: bigint): Promise<Offer | null> {
  const contract = getEscrowContract();

  let result: CallResult<ContractDecodedObjectResult>;
  try {
    result = await contract.getOffer(offerId);
  } catch {
    // Node returns an error for offers that have never been created
    return null;
  }

  if (result.revert) return null;

  const p = result.properties;

  // status 0 means the storage slot was never written (offer doesn't exist)
  const status = Number(p?.status ?? 0);
  if (!p || status === 0) return null;

  return {
    id: offerId,
    maker: String(p.maker),
    token: String(p.token),
    tokenAmount: BigInt(String(p.tokenAmount)),
    tokenId: BigInt(String(p.tokenId)),
    isNFT: Boolean(p.isNFT),
    btcSatoshis: BigInt(String(p.btcSatoshis)),
    btcRecipientKey: BigInt(String(p.btcRecipientKey)),
    status: status as OfferStatusCode,
    feeBps: Number(p.feeBps),
    allowedTaker: BigInt(String(p.allowedTaker ?? 0)),
  };
}

/**
 * Auto-discover all offers by scanning sequentially in batches.
 *
 * Strategy: scan IDs in batches of `batchSize`. Stop scanning after
 * `maxEmpty` consecutive batches that return zero results (all nulls).
 * A hard cap of `cap` IDs prevents runaway scans on a cold chain.
 *
 * Because offer IDs are sequential (1, 2, 3, …) and non-existent offers
 * return null, this reliably finds all offers without knowing the total count.
 */
export async function listOffers(opts?: {
  batchSize?: number;
  maxEmpty?: number;
  cap?: number;
}): Promise<Offer[]> {
  const batchSize = opts?.batchSize ?? 10;
  const maxEmpty  = opts?.maxEmpty  ?? 2;
  const cap       = opts?.cap       ?? 500;

  const all: Offer[] = [];
  let emptyBatches = 0;
  let start = 1;

  while (start <= cap) {
    const end = Math.min(start + batchSize - 1, cap);
    const ids = Array.from({ length: end - start + 1 }, (_, i) => BigInt(start + i));
    const results = await Promise.allSettled(ids.map(getOffer));

    const found = results
      .filter((r): r is PromiseFulfilledResult<Offer> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value);

    all.push(...found);

    if (found.length === 0) {
      emptyBatches++;
      if (emptyBatches >= maxEmpty) break;
    } else {
      emptyBatches = 0;
    }

    start = end + 1;
  }

  return all;
}

/**
 * Fetch the global fee recipient key stored in the contract.
 * Returns 0n if the contract was deployed without a fee key.
 */
export async function getFeeRecipientKey(): Promise<bigint> {
  const contract = getEscrowContract();
  try {
    const result = await contract.getFeeRecipientKey();
    const v = result.properties?.feeRecipientKey;
    return v !== undefined ? BigInt(String(v)) : 0n;
  } catch {
    return 0n;
  }
}

// ── Address resolver (string → Address object for encodeCalldata) ─────────────

const ZERO_HEX = '0x' + '0'.repeat(64);

/**
 * OPNet wallets expose ALL address types (P2TR, P2OP) under the bech32Opnet HRP
 * (e.g. "opt" on testnet). The SDK's detectAddressType and the RPC node only
 * recognise P2TR/P2WPKH when the prefix matches the *standard* network.bech32 HRP
 * ("tb" on testnet, "bcrt" on regtest).
 *
 * This function re-encodes such an address to the standard HRP so all downstream
 * SDK calls work correctly.
 */
function normalizeAddressHrp(addrStr: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opnetHrp: string | undefined = (OP_NETWORK as any).bech32Opnet;
  if (!opnetHrp) return addrStr;
  if (!addrStr.toLowerCase().startsWith(opnetHrp + '1')) return addrStr;

  // Already recognised (e.g. P2OP uses witness v16 which detectAddressType handles) → no change
  if (AddressVerificator.detectAddressType(addrStr, OP_NETWORK) !== null) return addrStr;

  // Unknown to detectAddressType with the opnetHrp — try re-encoding with the standard HRP
  try {
    const decoded = bech32m.decode(addrStr, 100);
    return bech32m.encode(OP_NETWORK.bech32, decoded.words, 100);
  } catch { /* not bech32m */ }

  return addrStr;
}

/**
 * Convert a string address to an Address object required by encodeCalldata.
 *
 * - Zero address (0x000…) → Address.fromBigInt(0n)
 * - Other 0x-hex (32 bytes) → Address.fromBigInt(value)
 * - Bech32 P2OP/P2TR → normalise HRP then provider.getPublicKeyInfo
 */
async function resolveAddressArg(addrStr: string): Promise<Address> {
  if (addrStr === ZERO_HEX || addrStr === '0'.repeat(64)) {
    return Address.fromBigInt(0n);
  }
  if (addrStr.startsWith('0x') || addrStr.startsWith('0X')) {
    return Address.fromBigInt(hexToBigint(addrStr));
  }
  const normalized = normalizeAddressHrp(addrStr);
  const addrType = AddressVerificator.detectAddressType(normalized, OP_NETWORK);
  const isContract = addrType === AddressTypes.P2OP;
  return getProvider().getPublicKeyInfo(normalized, isContract);
}

/**
 * Walk an ABI's inputs and resolve any string value at an ADDRESS position
 * to a proper Address object, leaving all other args untouched.
 */
async function resolveArgsForAbi(
  abi: BitcoinInterfaceAbi,
  functionName: string,
  args: unknown[],
): Promise<unknown[]> {
  const fn = abi.find(
    (e): e is Extract<typeof e, { inputs?: BitcoinAbiValue[] }> =>
      e.name === functionName && e.type === BitcoinAbiTypes.Function,
  );
  if (!fn || !('inputs' in fn) || !fn.inputs) return args;

  const resolved = [...args];
  await Promise.all(
    fn.inputs.map(async (input, i) => {
      if (input.type === ABIDataTypes.ADDRESS && typeof resolved[i] === 'string') {
        resolved[i] = await resolveAddressArg(resolved[i] as string);
      }
    }),
  );
  return resolved;
}

// ── OP-20 allowance ABI + helper ─────────────────────────────────────────────

const OP20_ALLOWANCE_ABI: BitcoinInterfaceAbi = [
  {
    name: 'allowance',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'owner',   type: ABIDataTypes.ADDRESS },
      { name: 'spender', type: ABIDataTypes.ADDRESS },
    ],
    outputs: [{ name: 'allowance', type: ABIDataTypes.UINT256 }],
  },
];

/**
 * Read the current OP-20 allowance for (owner → spender).
 * Uses resolveSenderAddress for the owner so fresh wallets (MLDSA key path)
 * are handled correctly. Returns 0n on any error.
 */
export async function fetchAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
): Promise<bigint> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contract = getContract<any>(
      tokenAddress, OP20_ALLOWANCE_ABI, getProvider(), OP_NETWORK,
    );
    const [ownerAddr, spenderAddr] = await Promise.all([
      resolveSenderAddress(ownerAddress),  // MLDSA-aware for wallet addresses
      resolveAddressArg(spenderAddress),   // works for P2OP contract addresses
    ]);
    const result = await contract.allowance(ownerAddr, spenderAddr);
    const allowance = BigInt(String(result.properties?.allowance ?? 0));
    console.log('[fetchAllowance]', {
      token: tokenAddress,
      owner: ownerAddress,
      spender: spenderAddress,
      allowance: allowance.toString(),
    });
    return allowance;
  } catch (err) {
    console.warn('[fetchAllowance] error — returning 0n', err);
    return 0n;
  }
}

// ── OP-20 approve ABI ────────────────────────────────────────────────────────

/**
 * OPNet OP-20 does NOT have `approve()`.
 * Allowance is set via `increaseAllowance(spender, amount)`.
 */
const OP20_INCREASE_ALLOWANCE_ABI: BitcoinInterfaceAbi = [
  {
    name: 'increaseAllowance',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'spender', type: ABIDataTypes.ADDRESS },
      { name: 'amount', type: ABIDataTypes.UINT256 },
    ],
    outputs: [],
  },
];

// ── OP-721 approve ABI ────────────────────────────────────────────────────────

/**
 * OP-721 grants per-token spending rights via `approve(operator, tokenId)`.
 * This is completely different from OP-20's increaseAllowance.
 */
const OP721_APPROVE_ABI: BitcoinInterfaceAbi = [
  {
    name: 'approve',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'operator', type: ABIDataTypes.ADDRESS },
      { name: 'tokenId', type: ABIDataTypes.UINT256 },
    ],
    outputs: [],
  },
];

// ── OP-721 approval-check ABI (view-only: getApproved + isApprovedForAll) ──────

const OP721_APPROVAL_CHECK_ABI: BitcoinInterfaceAbi = [
  {
    name: 'getApproved',
    type: BitcoinAbiTypes.Function,
    inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'approved', type: ABIDataTypes.ADDRESS }],
  },
  {
    name: 'isApprovedForAll',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'owner', type: ABIDataTypes.ADDRESS },
      { name: 'operator', type: ABIDataTypes.ADDRESS },
    ],
    outputs: [{ name: 'approved', type: ABIDataTypes.BOOL }],
  },
];

// ── OP-721 enumeration ABI (view-only: name + balanceOf + tokenOfOwnerByIndex) ─

const OP721_QUERY_ABI: BitcoinInterfaceAbi = [
  {
    name: 'name',
    type: BitcoinAbiTypes.Function,
    inputs: [],
    outputs: [{ name: 'name', type: ABIDataTypes.STRING }],
  },
  {
    name: 'balanceOf',
    type: BitcoinAbiTypes.Function,
    inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'tokenOfOwnerByIndex',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'owner', type: ABIDataTypes.ADDRESS },
      { name: 'index', type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
  },
];

// ── OP-721 collection info + per-token metadata ───────────────────────────────

/** Resolve ipfs:// URIs to an HTTP gateway URL; pass everything else through. */
function resolveIpfsUri(uri: string): string {
  return uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
}

export interface NftCollectionInfo {
  name?: string;
  symbol?: string;
  /** Collection icon URL — stored on-chain, no external fetch needed */
  icon?: string;
  banner?: string;
}

export interface NftMetadata {
  name?: string;
  image?: string;
}

/** In-memory cache keyed by contract address */
const _nftCollectionCache = new Map<string, NftCollectionInfo | null>();
/** In-memory cache keyed by "contractAddress:tokenId" */
const _nftTokenCache = new Map<string, NftMetadata | null>();

/**
 * Fetch OP-721 collection-level info (name, symbol, icon, banner) via the
 * on-chain `metadata()` call. Uses the official `OP_721_ABI` from the opnet
 * package. Icon / banner URLs are stored on-chain — no external HTTP fetch
 * needed. IPFS URIs are resolved to the ipfs.io gateway automatically.
 *
 * This is the preferred approach for listing cards where you want a thumbnail
 * without N external fetches per card.
 */
export async function fetchNftCollectionInfo(
  contractAddress: string,
): Promise<NftCollectionInfo | null> {
  if (_nftCollectionCache.has(contractAddress)) {
    return _nftCollectionCache.get(contractAddress) ?? null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contract = getContract<any>(contractAddress, OP_721_ABI, getProvider(), OP_NETWORK);
    const result = await contract.metadata();
    if (result.revert) { _nftCollectionCache.set(contractAddress, null); return null; }

    const props = result.properties ?? {};
    const info: NftCollectionInfo = {
      name:   props.name   ? String(props.name)   : undefined,
      symbol: props.symbol ? String(props.symbol) : undefined,
      icon:   props.icon   ? resolveIpfsUri(String(props.icon))   : undefined,
      banner: props.banner ? resolveIpfsUri(String(props.banner)) : undefined,
    };
    _nftCollectionCache.set(contractAddress, info);
    return info;
  } catch {
    _nftCollectionCache.set(contractAddress, null);
    return null;
  }
}

/**
 * Fetch per-token metadata (name + image) via `tokenURI(tokenId)`.
 *
 * Flow:
 *   1. Call tokenURI(tokenId) → URI string
 *   2. Resolve: data:application/json → parse inline; ipfs:// → gateway; https → direct
 *   3. Extract { name, image } from the JSON
 *
 * Use this on the offer detail page for the specific NFT art.
 * Use `fetchNftCollectionInfo` on listing cards (faster — no external fetch).
 */
export async function fetchNftMetadata(
  contractAddress: string,
  tokenId: bigint,
): Promise<NftMetadata | null> {
  const cacheKey = `${contractAddress}:${tokenId.toString()}`;
  if (_nftTokenCache.has(cacheKey)) return _nftTokenCache.get(cacheKey) ?? null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contract = getContract<any>(contractAddress, OP_721_ABI, getProvider(), OP_NETWORK);
    const result = await contract.tokenURI(tokenId);
    if (result.revert) { _nftTokenCache.set(cacheKey, null); return null; }

    const uri = String(result.properties?.uri ?? '').trim();
    if (!uri) { _nftTokenCache.set(cacheKey, null); return null; }

    let json: Record<string, unknown>;
    if (uri.startsWith('data:application/json')) {
      const [, payload] = uri.split(',');
      const decoded = uri.includes(';base64,') ? atob(payload) : decodeURIComponent(payload);
      json = JSON.parse(decoded) as Record<string, unknown>;
    } else {
      const res = await fetch(resolveIpfsUri(uri), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json() as Record<string, unknown>;
    }

    const meta: NftMetadata = {
      name:  typeof json.name  === 'string' ? json.name  : undefined,
      image: typeof json.image === 'string' ? resolveIpfsUri(json.image) : undefined,
    };
    _nftTokenCache.set(cacheKey, meta);
    return meta;
  } catch {
    _nftTokenCache.set(cacheKey, null);
    return null;
  }
}

// ── Sender address resolver (wallet-first) ────────────────────────────────────

/**
 * Resolve the connected wallet's address to an Address object for use as
 * msg.sender in simulations.
 *
 * Priority:
 * 1. window.opnet.web3.getMLDSAPublicKey() — works even for fresh wallets
 *    that haven't made any on-chain transactions yet (no RPC record).
 * 2. getPublicKeyInfo RPC — fallback for non-OPNet wallets or SSR.
 *
 * Why this matters: Blockchain.tx.sender in a simulation = the Address passed
 * as the 5th argument to getContract(). If getPublicKeyInfo returns zero
 * (fresh wallet, no on-chain history), the contract sees Address.zero() and
 * throws "Invalid approver" / "Invalid sender".
 */
async function resolveSenderAddress(walletAddress: string): Promise<Address> {
  if (typeof window !== 'undefined' && window.opnet?.web3) {
    try {
      const mldsaKey = await window.opnet.web3.getMLDSAPublicKey();
      if (mldsaKey) {
        // Also pass the tweaked P2TR pubkey when available — Address.fromString
        // accepts it as the optional second param (legacyPublicKey).
        const tweakedHex = p2trAddressToKeyHex(walletAddress) ?? undefined;
        return Address.fromString(mldsaKey, tweakedHex);
      }
    } catch {
      /* fall through to RPC */
    }
  }
  return resolveAddressArg(walletAddress);
}

// ── Simulate functions (proper SDK flow: simulate → sendTransaction) ──────────

/**
 * Simulate `increaseAllowance(spender, amountOrTokenId)` on any OP-20 token contract.
 *
 * OPNet OP-20 uses increaseAllowance (not approve) to grant spending rights.
 * Using the simulate-first flow ensures the wallet receives full UTXO + fee info.
 */
export async function simulateApprove(
  tokenAddress: string,
  spender: string,
  amountOrTokenId: bigint,
  walletAddress: string,
): Promise<CallResult<ContractDecodedObjectResult>> {
  const provider = getProvider();
  // msg.sender must be set so the contract knows who is granting the allowance
  const senderAddr = await resolveSenderAddress(walletAddress);
  const tokenContract = getContract<any>( // eslint-disable-line @typescript-eslint/no-explicit-any
    tokenAddress, OP20_INCREASE_ALLOWANCE_ABI, provider, OP_NETWORK, senderAddr,
  );
  const spenderAddr = await resolveAddressArg(spender);
  return tokenContract.increaseAllowance(spenderAddr, amountOrTokenId);
}

/**
 * Simulate `approve(operator, tokenId)` on an OP-721 NFT contract.
 *
 * OP-721 grants per-token spending rights via approve(), NOT increaseAllowance().
 * operator = escrow contract address; tokenId = the specific NFT being approved.
 */
export async function simulateNftApprove(
  tokenAddress: string,
  operator: string,
  tokenId: bigint,
  walletAddress: string,
): Promise<CallResult<ContractDecodedObjectResult>> {
  const senderAddr = await resolveSenderAddress(walletAddress);
  const tokenContract = getContract<any>( // eslint-disable-line @typescript-eslint/no-explicit-any
    tokenAddress, OP721_APPROVE_ABI, getProvider(), OP_NETWORK, senderAddr,
  );
  const operatorAddr = await resolveAddressArg(operator);
  console.log('[simulateNftApprove] token:', tokenAddress, 'operator:', operator, 'tokenId:', tokenId.toString());
  return tokenContract.approve(operatorAddr, tokenId);
}

/**
 * Normalize any boolean-like value returned by the OPNet SDK to a plain boolean.
 *
 * The SDK may return BOOL-typed ABI outputs as:
 *   - boolean                → itself
 *   - bigint / number        → !== 0
 *   - string                 → "true" / "1" / "yes" → true
 *   - boxed Boolean object   → .valueOf()
 *   - wrapper object         → inspect .value / .ok / .result / .data /
 *                              .isApproved / .approved / .bool fields
 *   - anything else          → false
 */
function normalizeBool(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'bigint')  return val !== 0n;
  if (typeof val === 'number')  return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  if (typeof val === 'object' && val !== null) {
    // Boxed Boolean (new Boolean(true))
    if (val instanceof Boolean) return val.valueOf();
    const obj = val as Record<string, unknown>;
    // Walk common SDK wrapper field names — first match wins
    for (const key of ['value', 'bool', 'boolean', 'ok', 'result', 'data', 'isApproved', 'approved']) {
      if (key in obj) return normalizeBool(obj[key]);
    }
    // Last resort: stringify and look for a top-level JSON boolean true
    try {
      const s = JSON.stringify(val);
      if (s === 'true')  return true;
      if (s === 'false') return false;
      // Heuristic: any field explicitly set to the JSON boolean true
      return /:true[,}\]]/.test(s);
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Normalize any address-like value returned by the OPNet SDK to a lowercase
 * 64-char hex string (no 0x prefix) suitable for direct equality comparison.
 *
 * The SDK may return ADDRESS-typed ABI outputs as:
 *   - string  "0x<64hex>"  → strip 0x, lowercase
 *   - bigint               → hex-pad to 64 chars
 *   - Address object       → inspect .address / .value fields
 *   - null / undefined / 0 → not approved (return null)
 *
 * Returns null for zero / empty / unrecognized values so callers can treat
 * null === "not approved" without further logic.
 */
function normalizeApprovedAddress(val: unknown): string | null {
  if (val === null || val === undefined || val === 0 || val === '') return null;

  if (typeof val === 'bigint') {
    if (val === 0n) return null;
    return val.toString(16).padStart(64, '0');
  }

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === '0x') return null;
    if (s.startsWith('0x') || s.startsWith('0X')) {
      const hex = s.slice(2).toLowerCase().padStart(64, '0');
      return /^0+$/.test(hex) ? null : hex;
    }
    // Try bech32m decode — accept any witness program (P2TR=32 bytes, P2OP=21 bytes, etc.)
    // This is used only when comparing bech32m strings to bech32m strings (track B).
    // For bigint→bigint comparisons (track A) this path is never reached.
    try {
      const decoded = bech32m.decode(s, 90);
      const progBytes = bech32m.fromWords(decoded.words.slice(1));
      if (progBytes.length >= 20) {
        const hex = Buffer.from(progBytes).toString('hex').toLowerCase();
        return /^0+$/.test(hex) ? null : hex;
      }
    } catch { /* not a valid bech32m — fall through */ }
    return null;
  }

  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    // @btc-vision/transaction Address objects expose .address as a string
    if (typeof obj.address === 'string') return normalizeApprovedAddress(obj.address);
    // Some SDK versions expose .value as bigint
    if (typeof obj.value === 'bigint')  return normalizeApprovedAddress(obj.value);
    if (typeof obj.value === 'string')  return normalizeApprovedAddress(obj.value);
    // Last resort — if .toString() gives something useful
    try {
      const s = String(val);
      if (s && s !== '[object Object]') return normalizeApprovedAddress(s);
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Check whether an OP-721 token is approved for transfer by the escrow.
 *
 * Returns true if EITHER:
 *   - getApproved(tokenId) resolves to expectedOperator  (per-token approval)
 *   - isApprovedForAll(owner, expectedOperator) === true  (operator approval)
 *
 * Two comparison tracks are used for maximum compatibility with OPNet SDK
 * return shapes (bigint, Address object, or bech32m string):
 *
 *   Track A — bigint/hex: operatorAddr.toBigInt() gives the canonical uint256
 *     that the contract stores via ABI encoding.  getApproved() returns that
 *     same uint256.  Both sides are normalised to 64-char hex and compared.
 *     This is the primary track and works regardless of address format.
 *
 *   Track B — string: if the SDK returns the approved address as a bech32m
 *     string (e.g. opt1sq…), compare it directly to expectedOperator after
 *     lowercasing both.  This is a fallback for future SDK versions.
 *
 * Always returns boolean — never throws.
 */
export async function fetchNftApproval(
  tokenAddress: string,
  tokenId: bigint,
  expectedOperator: string,
  owner: string,
): Promise<boolean> {
  try {
    const contract = getContract<any>( // eslint-disable-line @typescript-eslint/no-explicit-any
      tokenAddress, OP721_APPROVAL_CHECK_ABI, getProvider(), OP_NETWORK,
    );
    const operatorAddr = await resolveAddressArg(expectedOperator);
    const ownerAddr    = await resolveSenderAddress(owner);

    // Track A: derive expectedNormHex from the Address object's bigint form.
    // operatorAddr.toBigInt() is the uint256 the ABI encoder uses — same value
    // returned by getApproved() — so this comparison is always canonical.
    // operatorAddr.address is undefined for P2OP contracts (witness v16), so
    // we never use it.
    const operatorBigInt = (operatorAddr as unknown as { toBigInt?(): bigint }).toBigInt?.();
    const expectedNormHex = operatorBigInt !== undefined
      ? normalizeApprovedAddress(operatorBigInt)  // always a 64-char hex string
      : null;                                     // should not happen in practice

    // Track B: normalized lowercase string (bech32m → bech32m comparison).
    const expectedStr = expectedOperator.toLowerCase().trim();

    console.log('[fetchNftApproval] setup', {
      tokenAddress,
      tokenId: tokenId.toString(),
      expectedOperator,
      expectedStr,
      expectedNormHex,
      operatorBigInt: operatorBigInt?.toString(16),
    });

    // Path 1 — per-token approval: getApproved(tokenId) === escrow
    try {
      const r   = await contract.getApproved(tokenId);
      const raw: unknown = r.properties?.approved;

      // Track A: both sides as 64-char bigint-derived hex
      const approvedNorm = normalizeApprovedAddress(raw);
      const hexMatch     = approvedNorm !== null && expectedNormHex !== null
                           && approvedNorm === expectedNormHex;

      // Track B: both sides as lowercase bech32m strings
      const rawStr    = typeof raw === 'string' ? raw.toLowerCase().trim() : null;
      const strMatch  = rawStr !== null && rawStr.length > 0 && rawStr === expectedStr;

      const match       = hexMatch || strMatch;
      const comparePath = hexMatch ? 'hex' : strMatch ? 'string' : 'none';

      console.log('[fetchNftApproval] getApproved', {
        token: tokenAddress,
        tokenId: tokenId.toString(),
        expectedOperator,
        expectedNormHex,
        expectedStr,
        typeofRaw: typeof raw,
        rawApproved: raw === null || raw === undefined ? null : String(raw),
        approvedNorm,
        rawStr,
        hexMatch,
        strMatch,
        comparePath,
        match,
      });

      if (match) return true;
    } catch (err) { console.warn('[fetchNftApproval] getApproved error', err); }

    // Path 2 — operator approval: isApprovedForAll(owner, escrow) === true
    try {
      const r        = await contract.isApprovedForAll(ownerAddr, operatorAddr);
      const raw: unknown = r.properties?.approved;
      const approved = normalizeBool(raw);

      console.log('[fetchNftApproval] isApprovedForAll', {
        token: tokenAddress,
        tokenId: tokenId.toString(),
        owner,
        operator: expectedOperator,
        expectedNormHex,
        typeofRaw: typeof raw,
        rawIsApprovedForAll: raw,   // full object — intentionally not stringified
        approved,
      });

      if (approved) return true;
    } catch (err) { console.warn('[fetchNftApproval] isApprovedForAll error', err); }

    console.log('[fetchNftApproval] neither path confirmed — returning false');
    return false;
  } catch (err) {
    console.warn('[fetchNftApproval] outer error — returning false', err);
    return false;
  }
}

/** A single NFT entry returned by fetchOwnedNfts */
export interface NftEntry {
  contractAddress: string;
  tokenId: bigint;
  collectionName: string;
}

/**
 * Enumerate NFTs owned by the connected wallet in a given OP-721 collection.
 *
 * Uses the standard OP-721 enumeration interface: balanceOf + tokenOfOwnerByIndex.
 * Falls back to an empty array if the contract does not support enumeration or the
 * wallet holds nothing. Capped at 50 tokens.
 *
 * The owner address is resolved via resolveSenderAddress (getMLDSAPublicKey first)
 * so fresh wallets without on-chain history are supported.
 */
export async function fetchOwnedNfts(
  contractAddress: string,
  walletAddress: string,
): Promise<NftEntry[]> {
  const ownerAddr = await resolveSenderAddress(walletAddress);
  const contract = getContract<any>( // eslint-disable-line @typescript-eslint/no-explicit-any
    contractAddress, OP721_QUERY_ABI, getProvider(), OP_NETWORK,
  );

  // Collection name (non-critical, best-effort)
  let collectionName = contractAddress.slice(0, 10) + '…';
  try {
    const nr = await contract.name();
    if (nr.properties?.name) collectionName = String(nr.properties.name);
  } catch { /* ignore */ }

  // Balance
  let balance = 0n;
  try {
    const br = await contract.balanceOf(ownerAddr);
    balance = BigInt(String(br.properties?.balance ?? 0));
    console.log('[fetchOwnedNfts] balance:', balance.toString(), 'contract:', contractAddress);
  } catch (e) {
    console.warn('[fetchOwnedNfts] balanceOf failed:', e);
    return [];
  }
  if (balance === 0n) return [];

  // Enumerate tokenIds (cap at 50)
  const cap = balance < 50n ? balance : 50n;
  const entries: NftEntry[] = [];
  for (let i = 0n; i < cap; i++) {
    try {
      const r = await contract.tokenOfOwnerByIndex(ownerAddr, i);
      const tid = BigInt(String(r.properties?.tokenId ?? 0));
      entries.push({ contractAddress, tokenId: tid, collectionName });
    } catch (e) {
      console.warn('[fetchOwnedNfts] tokenOfOwnerByIndex failed at index', i, e);
      break; // contract may not implement enumeration
    }
  }
  return entries;
}

// ── OP-20 token info ABI ──────────────────────────────────────────────────────

const OP20_INFO_ABI: BitcoinInterfaceAbi = [
  {
    name: 'name',
    type: BitcoinAbiTypes.Function,
    inputs: [],
    outputs: [{ name: 'name', type: ABIDataTypes.STRING }],
  },
  {
    name: 'symbol',
    type: BitcoinAbiTypes.Function,
    inputs: [],
    outputs: [{ name: 'symbol', type: ABIDataTypes.STRING }],
  },
  {
    name: 'decimals',
    type: BitcoinAbiTypes.Function,
    inputs: [],
    outputs: [{ name: 'decimals', type: ABIDataTypes.UINT8 }],
  },
  {
    name: 'balanceOf',
    type: BitcoinAbiTypes.Function,
    inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
  },
];

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Raw token balance in smallest units; 0n when walletAddress is omitted or fetch fails */
  balance: bigint;
}

/**
 * Fetch OP-20 token name/symbol/decimals (and optionally balance) via view calls.
 *
 * Uses Promise.allSettled so a single failing call doesn't block the rest.
 * Falls back gracefully: name→address[:10]…, symbol→"???", decimals→8, balance→0n.
 */
export async function fetchTokenInfo(
  contractAddress: string,
  walletAddress?: string,
): Promise<TokenInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = getContract<any>(
    contractAddress, OP20_INFO_ABI, getProvider(), OP_NETWORK,
  );

  const [nameResult, symbolResult, decimalsResult] = await Promise.allSettled([
    contract.name(),
    contract.symbol(),
    contract.decimals(),
  ]);

  const name =
    nameResult.status === 'fulfilled' && nameResult.value.properties?.name
      ? String(nameResult.value.properties.name)
      : contractAddress.slice(0, 10) + '…';

  const symbol =
    symbolResult.status === 'fulfilled' && symbolResult.value.properties?.symbol
      ? String(symbolResult.value.properties.symbol)
      : '???';

  const decimals =
    decimalsResult.status === 'fulfilled' &&
    decimalsResult.value.properties?.decimals != null
      ? Number(decimalsResult.value.properties.decimals)
      : 8;

  let balance = 0n;
  if (walletAddress) {
    try {
      const ownerAddr = await resolveSenderAddress(walletAddress);
      const br = await contract.balanceOf(ownerAddr);
      balance = BigInt(String(br.properties?.balance ?? 0));
    } catch { /* keep 0n */ }
  }

  return { address: contractAddress, name, symbol, decimals, balance };
}

/**
 * Simulate a write function on the escrow contract.
 *
 * Resolves all ADDRESS-type args to Address objects before simulation so the
 * ABI encoder (which requires Address instances, not plain strings) doesn't throw.
 */
export async function simulateEscrowWrite(
  functionName: string,
  args: unknown[],
  walletAddress: string,
): Promise<CallResult<ContractDecodedObjectResult>> {
  // msg.sender must be set so the contract knows who is calling
  const senderAddr = await resolveSenderAddress(walletAddress);
  const contract = getContract<any>( // eslint-disable-line @typescript-eslint/no-explicit-any
    CONTRACT_ADDRESS, AtomicSwapEscrowAbi, getProvider(), OP_NETWORK, senderAddr,
  );
  const resolvedArgs = await resolveArgsForAbi(AtomicSwapEscrowAbi, functionName, args);
  return contract[functionName](...resolvedArgs);
}

// ── Fill offer (requires BTC payment outputs in the tx) ───────────────────────

/** The outputs that a taker's fill transaction must include, in both formats */
export interface FillSimulation {
  /** The CallResult from simulating fillOffer — pass to sendTransaction */
  simulation: CallResult<ContractDecodedObjectResult>;
  /**
   * The P2TR outputs to include in the wallet transaction via
   * sendTransaction({ extraOutputs }).
   * value is in satoshis (number, matching PsbtOutputExtended).
   */
  extraOutputs: PsbtOutputExtended[];
}

/**
 * Build the P2TR scriptPubKey Buffer for a 32-byte tweaked pubkey bigint.
 * Format: OP_1 OP_PUSH32 <32-byte-key> → bytes [0x51, 0x20, ...keyBytes]
 */
function p2trScriptBuf(tweakedPubkey: bigint): Buffer {
  const hex = tweakedPubkey.toString(16).padStart(64, '0');
  return Buffer.from('5120' + hex, 'hex');
}

/**
 * Encode a 32-byte tweaked pubkey bigint as a bech32m P2TR address string.
 *
 * The contract runtime's btc-runtime reads `Blockchain.tx.outputs[i].to`
 * (the bech32 address string) when checking payment. The `to` field MUST be
 * present and valid — the runtime throws "Missing to" if it is absent.
 *
 * Encoding: bech32m with the network's standard HRP (tb/bc/bcrt), witness
 * version 1, 32-byte key payload — identical to a standard P2TR address.
 */
function keyToP2TRAddress(tweakedPubkey: bigint): string {
  const keyBytes = Buffer.from(tweakedPubkey.toString(16).padStart(64, '0'), 'hex');
  const words = bech32m.toWords(keyBytes);
  words.unshift(1); // witness version 1
  return bech32m.encode(OP_NETWORK.bech32, words, 90);
}

/**
 * Simulate `fillOffer(offerId)` with the required BTC payment outputs.
 *
 * Why this exists:
 *   The escrow contract verifies at line 379 that `Blockchain.tx.outputs`
 *   contains a P2TR output paying the maker (and optionally the fee recipient).
 *
 * How it works:
 *   1. Build the required P2TR output(s) in two formats:
 *      - stripped outputs with `to` (bech32 address) + `flags: 1 (hasTo)`
 *        for `setTransactionDetails` → contract reads `output.to` during sim
 *      - `PsbtOutputExtended` with `script` + `value` for `extraOutputs`
 *        → wallet includes them in the actual Bitcoin tx
 *   2. Call `contract.setTransactionDetails(...)` BEFORE simulation
 *   3. Simulate fillOffer — contract finds the outputs and passes
 *   4. Return { simulation, extraOutputs } for the caller
 *
 * Caller must pass the returned extraOutputs to sendTransaction:
 *   const { simulation, extraOutputs } = await simulateFillOffer(...);
 *   await simulation.sendTransaction({ ..., extraOutputs });
 */
export async function simulateFillOffer(
  offerId: bigint,
  offer: Offer,
  feeRecipientKey: bigint,
  walletAddress: string,
): Promise<FillSimulation> {
  const feeSats = calcFeeSats(offer.btcSatoshis, offer.feeBps);

  // Build the required outputs: { key, sats } — key is the 32-byte tweaked pubkey
  const rawOutputs: { key: bigint; sats: bigint }[] = [];

  if (offer.feeBps === 0 || feeRecipientKey === 0n) {
    rawOutputs.push({ key: offer.btcRecipientKey, sats: offer.btcSatoshis });
  } else if (feeRecipientKey === offer.btcRecipientKey) {
    // Same key: single output covering maker + fee
    rawOutputs.push({ key: offer.btcRecipientKey, sats: offer.btcSatoshis + feeSats });
  } else {
    rawOutputs.push({ key: offer.btcRecipientKey, sats: offer.btcSatoshis });
    rawOutputs.push({ key: feeRecipientKey, sats: feeSats });
  }

  // ── Format 1: stripped outputs for setTransactionDetails ─────────────────
  //
  // Output index 0 is reserved for the contract's Tapscript commitment output.
  // Payment outputs start at index 1.
  //
  // flags = 1 = hasTo:
  //   The OPNet node always sets hasTo (and only hasTo) for real transaction outputs.
  //   The contract verifies payment via Segwit.decodeOrNull(output.to) → compares the
  //   32-byte witness program to the stored makerKey.  This works in both simulation
  //   (output.to = "tb1p…" from keyToP2TRAddress) and real execution (output.to =
  //   "opt1p…" set by the node from the on-chain scriptPubKey).
  //
  //   hasScriptPubKey(2) is NOT used: the node never sets it for real txs, and
  //   setting both hasTo|hasScriptPubKey(3) is forbidden by the opnet SDK.
  const HAS_TO = 1; // TransactionOutputFlags.hasTo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const strippedOutputs: any[] = rawOutputs.map((o, i) => ({
    value: o.sats,           // bigint, as StrippedTransactionOutput requires
    index: i + 1,            // 0 is reserved for contract's own output
    flags: HAS_TO,           // 1: runtime sets output.to in WASM (hasTo flag)
    //                       // The contract now matches via Segwit.decodeOrNull(output.to)
    //                       // which works for both simulation (tb1p…) and real execution
    //                       // (opt1p… set by the OPNet node). hasScriptPubKey(2) is NOT
    //                       // needed — node never sets it for real txs; hasTo|hasScriptPubKey
    //                       // is also forbidden (mutually exclusive in the opnet SDK).
    to: keyToP2TRAddress(o.key),
  }));

  // ── Format 2: PsbtOutputExtended for actual wallet transaction ────────────
  // value must be a number (satoshis). Safe for amounts up to ~9×10¹⁵ sats.
  const psbtOutputs: PsbtOutputExtended[] = rawOutputs.map((o) => ({
    script: p2trScriptBuf(o.key),
    value: Number(o.sats),
  }));

  console.log(
    '[simulateFillOffer] offerId:', offerId.toString(),
    'outputs:', strippedOutputs.map((o) => ({
      index: o.index,
      to: o.to,
      sats: o.value.toString(),
      flags: o.flags,
    })),
  );

  const senderAddr = await resolveSenderAddress(walletAddress);
  const contract = getContract<any>( // eslint-disable-line @typescript-eslint/no-explicit-any
    CONTRACT_ADDRESS, AtomicSwapEscrowAbi, getProvider(), OP_NETWORK, senderAddr,
  );

  // CRITICAL: must be called on the SAME contract instance immediately before
  // the simulation call. The SDK clears currentTxDetails after each call.
  contract.setTransactionDetails({ inputs: [], outputs: strippedOutputs });

  const simulation = await contract.fillOffer(offerId);
  return { simulation, extraOutputs: psbtOutputs };
}

// ── Calldata builder (for preview only) ───────────────────────────────────────

/**
 * Encode calldata for a write function — used only for the "Preview calldata" display.
 * Actual transactions use simulateEscrowWrite → sendTransaction instead.
 */
export async function buildCalldata(
  functionName: string,
  args: unknown[],
): Promise<string> {
  const contract = getEscrowContract();
  const resolvedArgs = await resolveArgsForAbi(AtomicSwapEscrowAbi, functionName, args);
  const buf = contract.encodeCalldata(functionName, resolvedArgs);
  return '0x' + Buffer.from(buf).toString('hex');
}

// ── P2TR address → 32-byte key decoder ───────────────────────────────────────

/**
 * Decode any bech32m P2TR address (tb1p…, bc1p…, bcrt1p…, opt1p…, …) to its
 * 32-byte tweaked x-only pubkey as a 0x-prefixed hex string.
 *
 * Returns null if the address is not a valid bech32m P2TR address (e.g. if it
 * is a P2OP contract address — which uses witness version 16, not 1).
 */
export function p2trAddressToKeyHex(addr: string): string | null {
  try {
    const decoded = bech32m.decode(addr, 90);
    if (decoded.words[0] !== 1) return null; // P2TR = witness version 1
    const keyBytes = bech32m.fromWords(decoded.words.slice(1));
    if (keyBytes.length !== 32) return null;
    return '0x' + Buffer.from(keyBytes).toString('hex');
  } catch {
    return null;
  }
}

// ── Address normalisation helpers ─────────────────────────────────────────────

/**
 * Normalise any P2TR address representation to a `0x`-prefixed 64-char hex string.
 *
 * Accepts:
 *   - bech32m P2TR addresses with any HRP (opt1p…, tb1p…, bc1p…, bcrt1p…)
 *   - `0x`-prefixed 64-char hex strings (stored on-chain format)
 *
 * Throws if the input is not a valid P2TR address or 32-byte hex.
 */
export function normalizeToHex32(addr: string): string {
  // 0x hex path
  if (addr.startsWith('0x') || addr.startsWith('0X')) {
    const clean = addr.slice(2).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) {
      throw new Error(`Invalid 32-byte hex: "${addr}"`);
    }
    return '0x' + clean;
  }
  // bech32m path (any HRP — bech32m.decode auto-detects the prefix)
  try {
    const decoded = bech32m.decode(addr, 90);
    if (decoded.words[0] !== 1) throw new Error('Not a P2TR address (witness version must be 1)');
    const keyBytes = bech32m.fromWords(decoded.words.slice(1));
    if (keyBytes.length !== 32) throw new Error('P2TR key must be 32 bytes');
    return '0x' + Buffer.from(keyBytes).toString('hex');
  } catch (e) {
    throw new Error(
      `Cannot parse address "${addr}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Convert a `0x`-prefixed 32-byte hex key to a bech32m P2TR address string.
 * Uses the OPNet-specific HRP (opt/op) if the network exposes one, otherwise
 * falls back to the standard network HRP (tb/bc/bcrt).
 *
 * Used to display stored 0x allowedTaker keys as human-readable bech32 addresses.
 */
export function hex32ToP2TRAddress(keyHex: string): string {
  const clean =
    keyHex.startsWith('0x') || keyHex.startsWith('0X') ? keyHex.slice(2) : keyHex;
  const keyBytes = Buffer.from(clean.padStart(64, '0'), 'hex');
  const words = bech32m.toWords(keyBytes);
  words.unshift(1); // witness version 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hrp: string = (OP_NETWORK as any).bech32Opnet ?? OP_NETWORK.bech32;
  return bech32m.encode(hrp, words, 90);
}

/**
 * Resolve a P2TR bech32m address to its tweaked x-only pubkey (32-byte hex).
 *
 * Uses provider.getPublicKeysInfoRaw — the OPNet node handles any
 * OPNet-specific key derivations correctly. Falls back to null when the node
 * doesn't know the address (e.g. fresh wallet with no on-chain history).
 *
 * Only P2TR (witness v1) addresses are accepted. bc1q / tb1q (P2WPKH, v0)
 * will return null because they have no tweakedPubkey.
 */
export async function resolveTweakedPubkey(address: string): Promise<string | null> {
  const normalized = normalizeAddressHrp(address);
  try {
    const result = await getProvider().getPublicKeysInfoRaw(normalized);
    // Result is keyed by the address string passed in; try both forms
    const raw = result[normalized] ?? result[address];
    if (!raw || 'error' in raw) return null;
    const { tweakedPubkey } = raw as { tweakedPubkey?: string };
    if (!tweakedPubkey) return null;
    return tweakedPubkey.startsWith('0x') || tweakedPubkey.startsWith('0X')
      ? tweakedPubkey
      : '0x' + tweakedPubkey;
  } catch {
    return null;
  }
}

/**
 * Get the OPNet address hex string for the connected wallet.
 *
 * The OPNet address (0x-prefixed, 64-char hex) is derived from the wallet's
 * MLDSA public key — completely separate from the P2TR address. It is exactly
 * what the contract stores as `msg.sender` / `offer.maker`.
 *
 * Returns null when the MLDSA key is unavailable (non-OPNet wallet, SSR, or
 * the wallet extension is locked).
 */
export async function getWalletOpnetAddressHex(walletP2trAddress: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.opnet?.web3) return null;
  try {
    const mldsaKey = await window.opnet.web3.getMLDSAPublicKey();
    if (!mldsaKey) return null;
    const tweakedHex = p2trAddressToKeyHex(walletP2trAddress) ?? undefined;
    const addr = Address.fromString(mldsaKey, tweakedHex);
    return addr.toString();
  } catch {
    return null;
  }
}

// ── Fee / P2TR helpers (pure, no network calls) ───────────────────────────────

/** feeSats = ceil(btcSats × feeBps / 10_000) — mirrors contract logic */
export function calcFeeSats(btcSats: bigint, feeBps: number): bigint {
  if (feeBps === 0) return 0n;
  return (btcSats * BigInt(feeBps) + 9_999n) / 10_000n;
}

/**
 * Build a P2TR scriptPubKey hex string from a 32-byte tweaked pubkey bigint.
 * Format: OP_1 OP_PUSH32 <32-byte-key> → 5120<64-hex-chars>
 */
export function p2trScript(tweakedPubkey: bigint): string {
  return '5120' + tweakedPubkey.toString(16).padStart(64, '0');
}

/** Format satoshis as "0.001005 BTC (100,500 sats)" — single-line compact form. */
export function formatSats(sats: bigint): string {
  const btc = Number(sats) / 1e8;
  const btcStr = btc.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return `${btcStr} BTC (${sats.toLocaleString()} sats)`;
}

/** BTC-only string, e.g. "0.001005 BTC". Use for hero displays where sats appear separately. */
export function formatBtcFromSats(sats: bigint): string {
  const btc = Number(sats) / 1e8;
  return btc.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + ' BTC';
}

/** Shorten an address/key for display */
export function shortAddr(addr: string): string {
  if (!addr || addr === '0x' + '0'.repeat(64)) return '—';
  if (addr.length <= 16) return addr;
  return addr.slice(0, 8) + '…' + addr.slice(-6);
}

/** Convert a bigint pubkey to a 0x-prefixed 64-char hex string */
export function keyToHex(key: bigint): string {
  return '0x' + key.toString(16).padStart(64, '0');
}

/** Parse a hex string (with or without 0x) to bigint */
export function hexToBigint(hex: string): bigint {
  const clean =
    hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (!clean) return 0n;
  return BigInt('0x' + clean);
}
