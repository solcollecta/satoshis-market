'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  CONTRACT_ADDRESS,
  OP_NETWORK,
  simulateApprove,
  simulateNftApprove,
  simulateEscrowWrite,
  p2trAddressToKeyHex,
  normalizeToHex32,
  hexToBigint,
  fetchTokenInfo,
  fetchAllowance,
  fetchNftApproval,
  formatBtcFromSats,
  type NftEntry,
} from '@/lib/opnet';
import { parseUnits, parseBtcToSats, formatUnits, formatTokenBalance, saveListingTimestamp, type CachedToken } from '@/lib/tokens';
import { NftPicker } from '@/components/NftPicker';
import { TokenPicker } from '@/components/TokenPicker';
import { TxProgress } from '@/components/TxProgress';
import { useTxFlow } from '@/hooks/useTxFlow';
import { saveCreateDraft, loadCreateDraft, clearCreateDraft } from '@/lib/createDraft';

type Mode = 'op20' | 'op721';

// Platform fee is fixed at 0.5% — not user-configurable.
const PLATFORM_FEE_BPS = 50;

// Minimum sats for any single Bitcoin output (OPNet safety threshold).
const DUST_THRESHOLD = 546n;

export default function CreateOfferPageWrapper() {
  return (
    <Suspense>
      <CreateOfferPage />
    </Suspense>
  );
}

function CreateOfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, connect, provider } = useWallet();
  const flow = useTxFlow();
  const resumedRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('op20');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenAmountHuman, setTokenAmountHuman] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [btcValue, setBtcValue] = useState('');
  const [allowedTaker, setAllowedTaker] = useState('');
  const [privateBuyerLocked, setPrivateBuyerLocked] = useState(false);
  const [sharedFees, setSharedFees] = useState(false);
  const [sharedFeesLocked, setSharedFeesLocked] = useState(false);

  /** Derived from connected wallet — no user input, no RPC needed */
  const makerRecipientKey = address ? (p2trAddressToKeyHex(address) ?? '') : '';

  // ── Token metadata ────────────────────────────────────────────────────────
  const [tokenDecimals, setTokenDecimals] = useState(8);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [tokenMeta, setTokenMeta] = useState<{ name: string; symbol: string } | null>(null);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);

  const [nftPickerOpen, setNftPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived values (computed each render, no state) ───────────────────────
  const tokenAmountRaw = (() => {
    try { return parseUnits(tokenAmountHuman, tokenDecimals); } catch { return 0n; }
  })();
  const btcSatsRaw = (() => {
    try { return parseBtcToSats(btcValue); } catch { return 0n; }
  })();

  // Live dust validation — null means OK, string means blocked
  const feeDustError = (() => {
    if (btcSatsRaw === 0n) return null;
    if (btcSatsRaw < DUST_THRESHOLD) return `Price below dust threshold (min ${DUST_THRESHOLD} sats).`;
    const feeSats = btcSatsRaw * BigInt(PLATFORM_FEE_BPS) / 10_000n;
    if (PLATFORM_FEE_BPS > 0 && feeSats < DUST_THRESHOLD) {
      return `Platform fee (${feeSats} sats) below dust threshold. Increase price to at least ${DUST_THRESHOLD * 10_000n / BigInt(PLATFORM_FEE_BPS)} sats.`;
    }
    return null;
  })();

  // ── Shared fees calculation ──────────────────────────────────────────────
  const sharedFeesInfo = (() => {
    if (!sharedFees || btcSatsRaw === 0n) return null;
    const halfRate = BigInt(Math.floor(PLATFORM_FEE_BPS / 2));
    const adjustedSats = btcSatsRaw * (10_000n - halfRate) / 10_000n;
    const adjustedFee = adjustedSats * BigInt(PLATFORM_FEE_BPS) / 10_000n;
    const sellerCost = btcSatsRaw - adjustedSats;
    const buyerCost = adjustedSats + adjustedFee - btcSatsRaw;
    return {
      originalSats: btcSatsRaw,
      adjustedSats,
      adjustedFee,
      sellerCost,
      buyerCost,
      buyerTotal: adjustedSats + adjustedFee,
    };
  })();

  const effectiveBtcSats = sharedFeesInfo ? sharedFeesInfo.adjustedSats : btcSatsRaw;

  // ── NFT contract address persistence ─────────────────────────────────────
  const NFT_CONTRACT_KEY = 'nft_contract_v1';

  // Restore saved NFT contract when switching to NFT mode
  useEffect(() => {
    if (mode !== 'op721' || tokenAddress) return;
    try {
      const saved = localStorage.getItem(NFT_CONTRACT_KEY);
      if (saved) setTokenAddress(saved);
    } catch { /* ignore */ }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist NFT contract address when it changes
  useEffect(() => {
    if (mode !== 'op721' || !tokenAddress) return;
    try { localStorage.setItem(NFT_CONTRACT_KEY, tokenAddress); } catch { /* ignore */ }
  }, [tokenAddress, mode]);

  // ── Auto-fetch metadata + balance when address typed manually ────────────
  useEffect(() => {
    if (!tokenAddress || mode !== 'op20') return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const info = await fetchTokenInfo(tokenAddress, address ?? undefined);
        if (!cancelled) {
          setTokenDecimals(info.decimals);
          setTokenMeta({ name: info.name, symbol: info.symbol });
          if (info.balance > 0n) setTokenBalance(info.balance);
        }
      } catch { /* keep defaults — metadata failure must never block create flow */ }
    }, 800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tokenAddress, address, mode]);

  // ── OP-20 allowance pre-check ─────────────────────────────────────────────
  // Debounced (600 ms) to avoid RPC spam on every keystroke of the amount field.
  // Resets to idle from approve_confirmed in BOTH cases:
  //   - no-txid sufficient-skip (approveTxid === null)
  //   - real approve tx confirmed (approveTxid !== null) but user increased amount above allowance
  const flowStateRef = useRef(flow.state);
  flowStateRef.current = flow.state;

  useEffect(() => {
    if (mode !== 'op20' || !tokenAddress || !address || tokenAmountRaw === 0n) return;
    if (tokenAddress.length < 10) return; // ignore obviously partial/invalid addresses

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const allowance = await fetchAllowance(tokenAddress, address, CONTRACT_ADDRESS);
        if (cancelled) return;
        const sufficient = allowance >= tokenAmountRaw;
        console.log('[create] allowance pre-check', {
          token: tokenAddress,
          owner: address,
          spender: CONTRACT_ADDRESS,
          allowance: allowance.toString(),
          required: tokenAmountRaw.toString(),
          sufficient,
        });
        const { phase } = flowStateRef.current;
        if (sufficient && ['idle', 'approve_failed'].includes(phase)) {
          flow.setApproveSufficient();
        } else if (!sufficient && phase === 'approve_confirmed') {
          // Amount now exceeds allowance — regardless of whether approve was skipped
          // or a real tx confirmed. User must re-approve for the new amount.
          flow.reset();
        }
      } catch { /* pre-check failure is non-blocking — user can still approve manually */ }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tokenAddress, tokenAmountRaw, address, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Read query params on mount (once, takes priority over draft) ─────────
  useEffect(() => {
    const mode_p          = searchParams.get('mode');
    const contract_p      = searchParams.get('contractAddress');
    const btcSats_p       = searchParams.get('btcSats');
    const privateBuyer_p  = searchParams.get('privateBuyer');
    const requestId_p     = searchParams.get('requestId');

    // Only pre-fill if at least one meaningful param is present
    if (!mode_p && !contract_p && !btcSats_p && !privateBuyer_p) return;

    // Prevent draft from overwriting these
    resumedRef.current = true;

    if (mode_p === 'op20' || mode_p === 'op721') setMode(mode_p);
    if (contract_p)     setTokenAddress(contract_p);

    // OP-20
    const rawAmt  = searchParams.get('tokenAmountRaw');
    const rawDec  = searchParams.get('tokenDecimals');
    const sym     = searchParams.get('tokenSymbol');
    const name    = searchParams.get('tokenName');
    if (rawAmt && rawDec) {
      const dec = parseInt(rawDec, 10);
      if (!isNaN(dec)) {
        setTokenDecimals(dec);
        try {
          setTokenAmountHuman(formatUnits(BigInt(rawAmt), dec));
        } catch { /* ignore */ }
      }
    }
    if (sym || name) setTokenMeta({ name: name ?? '', symbol: sym ?? '' });

    // OP-721
    const tokenId_p = searchParams.get('tokenId');
    if (tokenId_p) setTokenId(tokenId_p);

    // BTC price
    if (btcSats_p) {
      try {
        const sats = BigInt(btcSats_p);
        // Convert sats to BTC decimal string
        const btc = formatUnits(sats, 8);
        setBtcValue(btc);
      } catch { /* ignore */ }
    }

    // Private buyer
    if (privateBuyer_p) {
      setAllowedTaker(privateBuyer_p);
      setPrivateBuyerLocked(true);
    }

    // Shared fees (from request)
    if (searchParams.get('sharedFees') === '1') {
      setSharedFees(true);
      setSharedFeesLocked(true);
    }

    // Request ID (no re-render needed)
    if (requestId_p) requestIdRef.current = requestId_p;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resume draft on mount (once) ─────────────────────────────────────────
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const draft = loadCreateDraft();
    if (!draft) return;
    // Restore form state
    setMode(draft.mode);
    setTokenAddress(draft.tokenAddress);
    setTokenAmountHuman(draft.tokenAmountHuman);
    setTokenId(draft.tokenId);
    setBtcValue(draft.btcValue);
    setAllowedTaker(draft.allowedTaker);
    setTokenDecimals(draft.tokenDecimals);
    // Resume flow — no confirmFn on resume (receipt-only is fine; tx likely already confirmed)
    if (draft.phase === 'approve_pending') {
      flow.setApprovePending(draft.approveTxid);
    } else if (draft.phase === 'create_pending' && draft.createTxid && draft.predictedOfferId) {
      flow.setCreatePending(draft.createTxid, BigInt(draft.predictedOfferId));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear draft when offer is confirmed ───────────────────────────────────
  useEffect(() => {
    if (flow.state.phase === 'create_confirmed') clearCreateDraft();
  }, [flow.state.phase]);

  // ── Mark request fulfilled when listing is confirmed ──────────────────────
  useEffect(() => {
    if (flow.state.phase !== 'create_confirmed') return;
    if (!flow.state.offerId || !requestIdRef.current || !address) return;
    void fetch(`/api/requests/${requestIdRef.current}/fulfill`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        listingId:   flow.state.offerId.toString(),
        fulfilledBy: address,
      }),
    });
  }, [flow.state.phase, flow.state.offerId, address]);

  // ── Warn before unload when a tx has been broadcast ───────────────────────
  // A broadcast tx can still confirm even after the tab closes, but the user
  // won't see the result and will lose their draft state. Show the browser's
  // native "Leave site?" dialog so they don't close accidentally.
  useEffect(() => {
    const hasBroadcastTx =
      flow.state.approveTxid !== null || flow.state.createTxid !== null;
    const isDone = flow.state.phase === 'create_confirmed';
    if (!hasBroadcastTx || isDone) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flow.state.approveTxid, flow.state.createTxid, flow.state.phase]);

  // ── Auto-redirect when offer confirmed (also save timestamp) ─────────────
  useEffect(() => {
    if (flow.state.phase === 'create_confirmed' && flow.state.offerId != null) {
      saveListingTimestamp(flow.state.offerId);
      const t = setTimeout(
        () => router.push(`/listing/${flow.state.offerId!.toString()}`),
        2000,
      );
      return () => clearTimeout(t);
    }
  }, [flow.state.phase, flow.state.offerId, router]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!CONTRACT_ADDRESS) return 'Contract address not configured — check NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local';
    if (!tokenAddress) return 'Token address is required';
    if (mode === 'op20' && tokenAmountRaw === 0n) return 'Token amount is required';
    if (mode === 'op721' && !tokenId) return 'Token ID is required';
    if (btcSatsRaw === 0n) return 'BTC price is required';
    if (btcSatsRaw < DUST_THRESHOLD) return `Output below dust threshold (${DUST_THRESHOLD} sats minimum). Increase price.`;
    const feeSats = btcSatsRaw * BigInt(PLATFORM_FEE_BPS) / 10_000n;
    if (PLATFORM_FEE_BPS > 0 && feeSats < DUST_THRESHOLD) {
      return `Output below dust threshold (${DUST_THRESHOLD} sats minimum). Increase price.`;
    }
    if (!makerRecipientKey) return 'Wallet not connected — connect your wallet to continue';
    if (allowedTaker) {
      try {
        normalizeToHex32(allowedTaker);
      } catch {
        return 'Allowed taker must be a valid P2TR address (opt1p… / tb1p…) or 0x hex key';
      }
    }
    return null;
  };

  const getCallArgs = (): unknown[] => {
    const taker = allowedTaker ? hexToBigint(normalizeToHex32(allowedTaker)) : 0n;
    if (mode === 'op20') {
      return [
        tokenAddress,
        tokenAmountRaw,
        effectiveBtcSats,
        hexToBigint(makerRecipientKey),
        PLATFORM_FEE_BPS,
        taker,
      ];
    }
    return [
      tokenAddress,
      BigInt(tokenId),
      effectiveBtcSats,
      hexToBigint(makerRecipientKey),
      PLATFORM_FEE_BPS,
      taker,
    ];
  };

  // ── NFT picker ────────────────────────────────────────────────────────────
  const handleNftPickerOpen = () => {
    if (!address) { connect(); return; }
    setError(null);
    setNftPickerOpen(true);
  };

  const handleNftSelect = (entry: NftEntry) => {
    setTokenId(entry.tokenId.toString());
    setTokenAddress(entry.contractAddress);
    setNftPickerOpen(false);
  };

  // ── Token picker ──────────────────────────────────────────────────────────
  const handleTokenSelect = (token: CachedToken, balance: bigint) => {
    setTokenAddress(token.address);
    setTokenDecimals(token.decimals);
    setTokenMeta({ name: token.name, symbol: token.symbol });
    setTokenBalance(balance > 0n ? balance : null);
    setTokenAmountHuman('');
    setTokenPickerOpen(false);
  };

  // ── Step 1: Approve ───────────────────────────────────────────────────────
  const handleApprove = async () => {
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }
    if (!address) { await connect(); return; }

    // Guard: re-check allowance synchronously before sending approve tx.
    // If already sufficient, skip the tx entirely — no unnecessary approvals.
    if (mode === 'op20') {
      try {
        const currentAllowance = await fetchAllowance(tokenAddress, address, CONTRACT_ADDRESS);
        console.log('[create] handleApprove pre-send check', {
          allowance: currentAllowance.toString(),
          required: tokenAmountRaw.toString(),
          sufficient: currentAllowance >= tokenAmountRaw,
        });
        if (currentAllowance >= tokenAmountRaw) {
          flow.setApproveSufficient();
          return;
        }
      } catch { /* check failed — proceed with approve tx */ }
    }

    flow.setApproveSimulating();
    try {
      const simulation = mode === 'op20'
        ? await simulateApprove(tokenAddress, CONTRACT_ADDRESS, tokenAmountRaw, address)
        : await simulateNftApprove(tokenAddress, CONTRACT_ADDRESS, BigInt(tokenId), address);

      const tx = await simulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: address,
        maximumAllowedSatToSpend: 100_000n,
        network: OP_NETWORK,
      });

      // Confirm only when the on-chain approval state is actually true.
      // OP-20: allowance >= required amount.
      // OP-721: getApproved(tokenId) === escrow OR isApprovedForAll(owner, escrow).
      // Neither advances to green until the real on-chain check passes.
      console.log('[create] building confirmFn', {
        mode,
        tokenAddress,
        operator: CONTRACT_ADDRESS,
        tokenId: mode === 'op721' ? tokenId : undefined,
        required: mode === 'op20' ? tokenAmountRaw.toString() : undefined,
      });
      const confirmFn = mode === 'op20'
        ? async () => {
            const allowance = await fetchAllowance(tokenAddress, address, CONTRACT_ADDRESS);
            const ok = allowance >= tokenAmountRaw;
            console.log('[create] confirmFn result', {
              ok,
              allowance: allowance.toString(),
              required: tokenAmountRaw.toString(),
            });
            return ok;
          }
        : async () => {
            try {
              return await fetchNftApproval(tokenAddress, BigInt(tokenId), CONTRACT_ADDRESS, address);
            } catch (err) {
              console.warn('[create] NFT confirmFn caught unexpected error — returning false', err);
              return false;
            }
          };

      flow.setApprovePending(tx.transactionId, confirmFn);
      saveCreateDraft({
        mode, tokenAddress, tokenAmountHuman, tokenId, btcValue,
        makerRecipientKey, allowedTaker, tokenDecimals,
        phase: 'approve_pending',
        approveTxid: tx.transactionId,
        createTxid: null,
        predictedOfferId: null,
      });
    } catch (e) {
      flow.setApproveFailed(e instanceof Error ? e.message : 'Approval failed');
    }
  };

  // ── Step 2: Create offer ──────────────────────────────────────────────────
  const handleCreate = async () => {
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }
    if (!address) { await connect(); return; }

    flow.setCreateSimulating();
    try {
      const fnName = mode === 'op20' ? 'createOffer' : 'createNFTOffer';
      const simulation = await simulateEscrowWrite(fnName, getCallArgs(), address);

      if (simulation.revert) {
        flow.setCreateFailed(
          (simulation.revert as { message?: string }).message ?? 'Simulation reverted',
        );
        return;
      }

      // offerId is decoded from the simulation's output (ABI: UINT256)
      const predictedOfferId = simulation.properties?.offerId != null
        ? BigInt(String(simulation.properties.offerId))
        : 0n;

      if (predictedOfferId === 0n) {
        flow.setCreateFailed('Simulation returned no offer ID — check your inputs and try again.');
        return;
      }

      const tx = await simulation.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: address,
        maximumAllowedSatToSpend: 100_000n,
        network: OP_NETWORK,
      });
      flow.setCreatePending(tx.transactionId, predictedOfferId);
      saveCreateDraft({
        mode, tokenAddress, tokenAmountHuman, tokenId, btcValue,
        makerRecipientKey, allowedTaker, tokenDecimals,
        phase: 'create_pending',
        approveTxid: flow.state.approveTxid ?? '',
        createTxid: tx.transactionId,
        predictedOfferId: predictedOfferId.toString(),
      });
    } catch (e) {
      flow.setCreateFailed(e instanceof Error ? e.message : 'Transaction failed');
    }
  };

  return (
    <>
      {/* NFT picker modal */}
      {nftPickerOpen && address && (
        <NftPicker
          walletAddress={address}
          initialContract={tokenAddress}
          onSelect={handleNftSelect}
          onClose={() => setNftPickerOpen(false)}
        />
      )}

      {/* Token picker modal */}
      {tokenPickerOpen && (
        <TokenPicker
          walletAddress={address ?? ''}
          onSelect={handleTokenSelect}
          onClose={() => setTokenPickerOpen(false)}
        />
      )}

      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-4 mb-3">
            <a
              href="/assets"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors"
            >
              ← Trade Assets
            </a>
            <span className="text-slate-600">|</span>
            <a
              href="/request/create"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors"
            >
              Request Assets →
            </a>
          </div>
          <h1 className="text-2xl font-bold text-white">Create Listing</h1>
          <p className="text-sm text-slate-400 mt-1">
            Escrow OP-20 tokens or an OP-721 NFT in exchange for BTC.
          </p>
        </div>

        {/* Mode selector */}
        {(() => {
          const isModeChangeable = ['idle', 'approve_failed', 'create_failed'].includes(flow.state.phase);
          return (
            <div className="card">
              <p className="text-xs text-slate-400 mb-3">Offer type</p>
              <div className="flex gap-2">
                {(['op20', 'op721'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { if (!isModeChangeable) return; setMode(m); flow.reset(); }}
                    disabled={!isModeChangeable}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                      mode === m
                        ? 'bg-brand border-brand text-white'
                        : 'border-surface-border text-slate-400 hover:text-white'
                    }${!isModeChangeable ? ' opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {m === 'op20' ? 'OP-20 Token' : 'OP-721 NFT'}
                  </button>
                ))}
              </div>
              {!isModeChangeable && (
                <p className="text-xs text-amber-500/80 mt-2">
                  Mode locked while a transaction is in progress. Reset the flow to switch.
                </p>
              )}
            </div>
          );
        })()}

        <form onSubmit={(e) => e.preventDefault()} className="card space-y-5">
          {/* Token address */}
          <div>
            <label htmlFor="token-addr">
              {mode === 'op20' ? 'OP-20 Token' : 'OP-721 NFT Contract'} address
            </label>
            <input
              id="token-addr"
              placeholder="opt1sq…"
              value={tokenAddress}
              onChange={(e) => {
                setTokenAddress(e.target.value);
                setTokenMeta(null);
                setTokenBalance(null);
                setTokenAmountHuman('');
              }}
              required
            />
          </div>

          {/* Token amount or ID */}
          {mode === 'op20' ? (
            <div>
              <label htmlFor="token-amount">
                Token amount
                {tokenMeta && (
                  <span className="text-slate-500 ml-1 font-normal text-xs">
                    · ${tokenMeta.symbol}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="token-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="1.5"
                  value={tokenAmountHuman}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d*\.?\d{0,4}$/.test(v) || v === '') setTokenAmountHuman(v);
                  }}
                  className="flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={() => setTokenPickerOpen(true)}
                  className="btn-secondary text-xs shrink-0 px-3 py-2"
                >
                  Saved tokens
                </button>
              </div>
              {/* Balance + percentage shortcuts — shown once balance is known */}
              {tokenBalance !== null && (
                <>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Balance:{' '}
                    <span className="text-slate-200">
                      {formatTokenBalance(tokenBalance, tokenDecimals)}
                      {tokenMeta ? ` ${tokenMeta.symbol}` : ''}
                    </span>
                  </p>
                  <div className="flex gap-1.5 mt-1.5">
                    {([25n, 50n, 75n, 100n] as bigint[]).map((pct) => (
                      <button
                        key={pct.toString()}
                        type="button"
                        onClick={() => {
                          const full = formatUnits(tokenBalance! * pct / 100n, tokenDecimals);
                          const [int, frac = ''] = full.split('.');
                          setTokenAmountHuman(frac ? `${int}.${frac.slice(0, 4)}` : int);
                        }}
                        className="flex-1 text-xs py-1 rounded border border-surface-border text-slate-400 hover:text-white hover:border-brand transition-colors"
                      >
                        {pct === 100n ? 'Max' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="token-id">NFT Token ID</label>
              <div className="flex items-center gap-2">
                <input
                  id="token-id"
                  type="text"
                  inputMode="numeric"
                  placeholder="42"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  className="flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={handleNftPickerOpen}
                  className="btn-secondary text-xs shrink-0 px-3 py-2"
                >
                  Select from your wallet
                </button>
              </div>
            </div>
          )}

          {/* BTC price */}
          <div>
            <label htmlFor="btc-value">{sharedFees ? 'Desired BTC price' : 'BTC price'}</label>
            <div className="relative">
              <input
                id="btc-value"
                type="text"
                inputMode="decimal"
                placeholder="0.001"
                value={btcValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*\.?\d*$/.test(v) || v === '') setBtcValue(v);
                }}
                className="pr-12"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">
                BTC
              </span>
            </div>
            {btcSatsRaw > 0n && !sharedFeesInfo && (
              <p className="text-xs text-slate-500 mt-1">
                = {btcSatsRaw.toLocaleString()} sats
              </p>
            )}
            {sharedFeesInfo && (
              <div className="mt-1.5 rounded-lg bg-emerald-900/15 border border-emerald-800/30 px-3 py-2">
                <p className="text-xs text-slate-400">
                  Actual listing price:{' '}
                  <span className="text-white font-semibold font-mono">
                    {formatBtcFromSats(sharedFeesInfo.adjustedSats)}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Platform fee — fixed, not user-configurable */}
          <div>
            <div className={`flex items-center justify-between rounded-lg bg-surface px-4 py-3 border ${feeDustError ? 'border-red-700' : 'border-surface-border'}`}>
              <span className="text-sm text-slate-400">Platform fee</span>
              <span className="text-sm font-semibold text-white">
                0.5%
                {btcSatsRaw > 0n && (
                  <span className="text-xs text-slate-500 font-normal ml-2">
                    = {formatBtcFromSats(BigInt(Math.ceil(Number(btcSatsRaw) * PLATFORM_FEE_BPS / 10_000)))}
                  </span>
                )}
              </span>
            </div>
            {feeDustError && (
              <p className="text-xs text-red-400 mt-1.5 px-1">{feeDustError}</p>
            )}
          </div>

          {/* Private OTC */}
          <div className={`rounded-xl border p-4 transition-colors duration-200 ${
            allowedTaker || privateBuyerLocked
              ? 'border-sky-600/40 bg-sky-900/10'
              : 'border-surface-border bg-surface/40'
          }`}>
            <label htmlFor="allowed-taker" className="flex items-center gap-2 mb-2">
              <span className="text-sky-400 text-sm">🔒</span>
              <span className="text-sm font-semibold text-slate-200">
                Private OTC
              </span>
              <span className="text-[10px] text-slate-500 font-normal">optional</span>
              {privateBuyerLocked && (
                <span className="ml-1 text-[10px] font-bold text-amber-400 border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 rounded-full">
                  from request
                </span>
              )}
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Restrict this listing to a single wallet. Only that address can buy it.
            </p>
            <input
              id="allowed-taker"
              placeholder="opt1p… / tb1p… / 0x…"
              value={allowedTaker}
              onChange={(e) => !privateBuyerLocked && setAllowedTaker(e.target.value)}
              disabled={privateBuyerLocked}
              className={privateBuyerLocked ? 'opacity-60 cursor-not-allowed' : ''}
            />
            {privateBuyerLocked ? (
              <p className="text-xs text-amber-400/70 mt-2">
                Locked to the requester&apos;s address. Only they can fill this listing.
              </p>
            ) : allowedTaker ? (
              <p className="text-xs text-sky-400/70 mt-2 flex items-center gap-1.5">
                <span>🔔</span>
                That wallet will see a notification when they connect.
              </p>
            ) : null}

            {/* Split fees — always visible, dynamic hints */}
            {(() => {
              const hasBuyer = !!(allowedTaker || sharedFeesLocked);
              const hasPrice = btcSatsRaw > 0n;
              const canToggle = hasBuyer && hasPrice && !sharedFeesLocked;
              const hint = !hasBuyer ? 'enter buyer wallet first' : !hasPrice ? 'enter a BTC price first' : null;
              return (
                <div className="mt-4 pt-4 border-t border-sky-800/30">
                  <label className={`flex items-center gap-2 mb-2${canToggle ? ' cursor-pointer' : ''}`}>
                    <input
                      type="checkbox"
                      checked={sharedFees}
                      onChange={(e) => canToggle && setSharedFees(e.target.checked)}
                      disabled={!canToggle && !sharedFeesLocked}
                      className={`w-4 h-4 rounded accent-emerald-500${!canToggle && !sharedFeesLocked ? ' opacity-40' : ''}`}
                    />
                    <span className={`text-sm font-semibold${!canToggle && !sharedFeesLocked ? ' text-slate-500' : ' text-slate-200'}`}>
                      Split fees
                    </span>
                    {hint && (
                      <span className="text-[10px] text-slate-300 font-normal">{hint}</span>
                    )}
                    {sharedFeesLocked && (
                      <span className="ml-1 text-[10px] font-bold text-amber-400 border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 rounded-full">
                        from request
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-slate-500">
                    Adjusts the listing price so both parties share the platform fee.
                  </p>

                  {sharedFees && (
                    <div className="mt-2 rounded-lg border border-sky-800/30 bg-sky-900/10 px-3 py-2">
                      <p className="text-[11px] text-sky-300/80 leading-relaxed">
                        The price is recalculated so both parties cover half the fee. This is the only fee-sharing method that keeps settlement fully trustless.
                      </p>
                    </div>
                  )}

                  {sharedFees && sharedFeesInfo && (
                    <div className="mt-3 pt-3 border-t border-emerald-800/30 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Your desired price</span>
                        <span className="text-slate-300 font-mono">{formatBtcFromSats(sharedFeesInfo.originalSats)} BTC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Adjusted listing price</span>
                        <span className="text-white font-mono font-semibold">{formatBtcFromSats(sharedFeesInfo.adjustedSats)} BTC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fee on adjusted price</span>
                        <span className="text-slate-300 font-mono">{formatBtcFromSats(sharedFeesInfo.adjustedFee)} BTC</span>
                      </div>
                      <div className="border-t border-emerald-800/20 pt-1.5 mt-1.5" />
                      <div className="flex justify-between">
                        <span className="text-slate-400">Your share</span>
                        <span className="text-emerald-400 font-mono">-{formatBtcFromSats(sharedFeesInfo.sellerCost)} BTC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Buyer&apos;s share</span>
                        <span className="text-emerald-400 font-mono">-{formatBtcFromSats(sharedFeesInfo.buyerCost)} BTC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Buyer pays total</span>
                        <span className="text-white font-mono font-semibold">{formatBtcFromSats(sharedFeesInfo.buyerTotal)} BTC</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Validation error (pre-tx) */}
          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
              {error}
            </p>
          )}

          {/* Don't-close warning — shown once a tx has been broadcast */}
          {(flow.state.approveTxid !== null || flow.state.createTxid !== null) &&
           flow.state.phase !== 'create_confirmed' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2.5">
              <p className="text-xs text-amber-400/80 leading-relaxed">
                Keep this tab open — closing it will require you to recreate the listing.
              </p>
            </div>
          )}

          {/* Transaction progress */}
          <TxProgress
            state={flow.state}
            mode={mode}
            onApprove={handleApprove}
            onCreate={handleCreate}
            onReset={() => { clearCreateDraft(); flow.reset(); }}
            onCheckApproveStatus={() => void flow.checkApproveStatus()}
            onCheckCreateStatus={() => void flow.checkCreateStatus()}
            onRetryCreate={flow.retryCreate}
            disabled={!!feeDustError}
          />

        </form>
      </div>
    </>
  );
}
