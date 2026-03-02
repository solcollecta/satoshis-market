/**
 * lib/wallet.ts — OPNet/Bitcoin wallet integration.
 *
 * @btc-vision/transaction already declares:
 *   window.opnet?:  OPWallet  (extends Unisat + has .web3: Web3Provider)
 *   window.unisat?: Unisat
 *
 * For submitting OPNet write transactions the canonical flow is:
 *   wallet.opnet.web3.signAndBroadcastInteraction(params)
 *
 * For the MVP demo, write calls produce a calldata hex string that
 * can be submitted by the wallet CLI when the extension's Web3Provider
 * interface is not fully available.
 *
 * Leather/Hiro is not declared by the package, so we add only that.
 */

// Bring the package's global window declarations into scope.
// This import is side-effect-only for its "declare global { interface Window … }" block.
import '@btc-vision/transaction';

export type WalletProvider = 'opnet' | 'unisat' | 'leather' | 'none';

// Only add Leather — opnet & unisat are already declared by @btc-vision/transaction.
declare global {
  interface Window {
    leather?: {
      request(
        method: string,
        params?: unknown,
      ): Promise<{ result: unknown }>;
    };
    LeatherProvider?: unknown;
  }
}

export interface ConnectedWallet {
  provider: WalletProvider;
  address: string;
}

/** Detect which wallet extension is available (detection order: opnet → unisat → leather) */
export function detectProvider(): WalletProvider {
  if (typeof window === 'undefined') return 'none';
  if (window.opnet) return 'opnet';
  if (window.unisat) return 'unisat';
  if (window.leather || window.LeatherProvider) return 'leather';
  return 'none';
}

/** Connect to the first available wallet and return the connected address */
export async function connectWallet(): Promise<ConnectedWallet> {
  const provider = detectProvider();

  if (provider === 'none') {
    throw new Error(
      'No Bitcoin wallet detected. Install the OPNet wallet extension or Unisat.',
    );
  }

  if (provider === 'opnet' && window.opnet) {
    const accounts = await window.opnet.requestAccounts();
    return { provider, address: accounts[0] };
  }

  if (provider === 'unisat' && window.unisat) {
    const accounts = await window.unisat.requestAccounts();
    return { provider, address: accounts[0] };
  }

  if (provider === 'leather' && window.leather) {
    const result = await window.leather.request('getAddresses');
    const data = result.result as {
      addresses: { address: string; type: string }[];
    };
    const taproot = data.addresses.find((a) => a.type === 'p2tr');
    if (!taproot) {
      throw new Error('No Taproot (P2TR) address found in Leather wallet');
    }
    return { provider, address: taproot.address };
  }

  throw new Error('Wallet connection failed');
}

/** Return the already-connected address without prompting, or null if not connected */
export async function getConnectedAddress(): Promise<string | null> {
  const provider = detectProvider();
  try {
    if (provider === 'opnet' && window.opnet) {
      const accounts = await window.opnet.getAccounts();
      return accounts[0] ?? null;
    }
    if (provider === 'unisat' && window.unisat) {
      const accounts = await window.unisat.getAccounts();
      return accounts[0] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Fetch the wallet's confirmed BTC balance in satoshis.
 * Returns null when no wallet is connected or the method is unavailable.
 */
export async function fetchBtcBalanceSats(): Promise<bigint | null> {
  if (typeof window === 'undefined') return null;
  try {
    const bal = window.opnet
      ? await window.opnet.getBalance()
      : window.unisat
      ? await window.unisat.getBalance()
      : null;
    if (bal == null) return null;
    return BigInt(bal.confirmed);
  } catch {
    return null;
  }
}

/**
 * Push a signed PSBT to the network via the available wallet.
 *
 * For OPNet interaction transactions the caller must first build a signed
 * PSBT (via CallResult.signTransaction) and then broadcast it here.
 */
export async function broadcastPsbt(signedPsbtHex: string): Promise<string> {
  const provider = detectProvider();

  if (provider === 'opnet' && window.opnet) {
    return window.opnet.pushPsbt(signedPsbtHex);
  }
  if (provider === 'unisat' && window.unisat) {
    return window.unisat.pushPsbt(signedPsbtHex);
  }

  throw new Error('No wallet available to broadcast the transaction');
}
