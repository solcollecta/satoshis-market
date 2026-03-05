/**
 * lib/fillsDb.ts — Minimal fill txid storage (server-side only).
 *
 * Stores the fill transaction ID for each listing so all viewers
 * (buyer, seller, neutral) can see the OPScan link.
 *
 * Table: listing_fills  (auto-created on first access)
 * Primary key: listing_id (one fill per listing)
 */
import { getSQL } from './db';

let _init = false;

async function ensureTable() {
  if (_init) return;
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS listing_fills (
      listing_id BIGINT PRIMARY KEY,
      fill_txid  TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  _init = true;
}

export async function getFillTxid(listingId: string): Promise<string | null> {
  await ensureTable();
  const sql = getSQL();
  const rows = await sql`SELECT fill_txid FROM listing_fills WHERE listing_id = ${listingId}`;
  return (rows[0] as { fill_txid: string } | undefined)?.fill_txid ?? null;
}

export async function saveFillTxid(listingId: string, txid: string): Promise<void> {
  await ensureTable();
  const sql = getSQL();
  await sql`
    INSERT INTO listing_fills (listing_id, fill_txid)
    VALUES (${listingId}, ${txid})
    ON CONFLICT (listing_id) DO UPDATE SET fill_txid = EXCLUDED.fill_txid
  `;
}
