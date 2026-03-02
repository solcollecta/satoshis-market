import { fromBech32 } from "@btc-vision/bitcoin";

const addr = process.argv[2];
if (!addr) {
  console.log("Usage: node decode-key.mjs <address>");
  process.exit(1);
}

const { version, prefix, data } = fromBech32(addr);

console.log("prefix:", prefix);
console.log("version:", version);
console.log("program_len:", data.length);
console.log("program_hex:", "0x" + data.toString("hex"));