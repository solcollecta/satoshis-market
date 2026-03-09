"use client";

import React, { useMemo, useState } from "react";
import { connectWallet, detectProvider } from "@/lib/wallet";

// Deployed TestToken contract — configurable via env var
const TOKEN_CONTRACT =
  process.env.NEXT_PUBLIC_MINT_TOKEN_ADDRESS ?? "opt1sqpfywwx4ytplgll9qyr5jl4j8q5jrr29vs9xww6t";

// Selector from your token build output:
// faucetMint(uint256) => 0x8774ffe6
const FAUCET_MINT_SELECTOR_HEX = "0x8774ffe6";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Encode uint256 as 32-byte big-endian
function u256ToBytesBE(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("uint256 must be >= 0");
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function MintPage() {
  const [amount, setAmount] = useState<string>("10000");
  const [status, setStatus] = useState<string>("");
  const [txid, setTxid] = useState<string>("");

  const calldataHex = useMemo(() => {
    const amt = BigInt(amount || "0");
    const selector = hexToBytes(FAUCET_MINT_SELECTOR_HEX); // 4 bytes
    const arg = u256ToBytesBE(amt); // 32 bytes
    const calldata = concatBytes(selector, arg);
    return bytesToHex(calldata);
  }, [amount]);

  async function mint() {
    setStatus("");
    setTxid("");

    try {
      const provider = detectProvider();
      if (provider !== "opnet") {
        throw new Error(
          `Please use OPNet Wallet for minting here. Detected: ${provider}.`
        );
      }

      // Ensure connected (prompts if needed)
      await connectWallet();

      // @ts-ignore - declared by @btc-vision/transaction
      const opnet = window.opnet;
      if (!opnet?.web3?.signAndBroadcastInteraction) {
        throw new Error(
          "OPNet web3 provider not available. Make sure OPNet Wallet is enabled and refreshed."
        );
      }

      // Canonical OPNet write call: to = contract address, calldata = Buffer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (opnet.web3.signAndBroadcastInteraction as any)({
        to: TOKEN_CONTRACT,
        calldata: hexToBytes(calldataHex),
      });

      // Return type is [BroadcastedTransaction, BroadcastedTransaction, UTXO[], string]
      const guessedTxid: string = Array.isArray(res) ? (res[3] ?? "") : "";

      setTxid(guessedTxid);
      setStatus("Mint transaction sent successfully.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Mint TEST (faucetMint)</h1>

      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Token contract: <code>{TOKEN_CONTRACT}</code>
      </p>

      <div style={{ marginTop: 24 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Amount (max 10000 per address)
        </label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#0b1220",
            color: "white",
          }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8 }}>Calldata (preview)</div>
        <code style={{ display: "block", whiteSpace: "pre-wrap", opacity: 0.85 }}>
          {calldataHex}
        </code>
      </div>

      <button
        onClick={mint}
        style={{
          marginTop: 20,
          padding: "12px 16px",
          borderRadius: 12,
          border: "none",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Mint
      </button>

      {status && (
        <p style={{ marginTop: 16 }}>
          <strong>Status:</strong> {status}
        </p>
      )}

      {txid && (
        <p style={{ marginTop: 8 }}>
          <strong>TxID:</strong> <code>{txid}</code>
        </p>
      )}
    </div>
  );
}