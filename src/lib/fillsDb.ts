/**
 * lib/fillsDb.ts — Fill txid + seller address storage (server-side only).
 *
 * Stores the fill transaction ID and seller address for each listing.
 * Used for: OPScan link on filled listings + seller sale notifications.
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
      listing_id     BIGINT PRIMARY KEY,
      fill_txid      TEXT NOT NULL,
      seller_address TEXT NOT NULL DEFAULT '',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Add seller_address column if missing (migration for existing tables)
  await sql`
    ALTER TABLE listing_fills
    ADD COLUMN IF NOT EXISTS seller_address TEXT NOT NULL DEFAULT ''
  `.catch(() => { /* column already exists */ });
  // Index for fast seller lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_fills_seller
    ON listing_fills (seller_address, created_at DESC)
  `.catch(() => { /* index already exists */ });
  _init = true;
}

export async function getFillTxid(listingId: string): Promise<string | null> {
  await ensureTable();
  const sql = getSQL();
  const rows = await sql`SELECT fill_txid FROM listing_fills WHERE listing_id = ${listingId}`;
  return (rows[0] as { fill_txid: string } | undefined)?.fill_txid ?? null;
}

export async function saveFillTxid(listingId: string, txid: string, seller: string): Promise<void> {
  await ensureTable();
  const sql = getSQL();

  // Check if txid differs from existing (warn if overwriting)
  const existing = await sql`SELECT fill_txid FROM listing_fills WHERE listing_id = ${listingId}`;
  if (existing.length > 0 && (existing[0] as { fill_txid: string }).fill_txid !== txid) {
    console.warn(`[fillsDb] listing ${listingId}: txid changed — overwriting`);
  }

  await sql`
    INSERT INTO listing_fills (listing_id, fill_txid, seller_address)
    VALUES (${listingId}, ${txid}, ${seller})
    ON CONFLICT (listing_id) DO UPDATE SET
      fill_txid = EXCLUDED.fill_txid,
      seller_address = EXCLUDED.seller_address
  `;
}

export interface SaleRecord {
  listingId: string;
  txid: string;
  createdAt: string;
}

export async function getSalesForSeller(sellerAddress: string, limit = 20): Promise<SaleRecord[]> {
  await ensureTable();
  const sql = getSQL();
  const rows = await sql`
    SELECT listing_id, fill_txid, created_at
    FROM listing_fills
    WHERE seller_address = ${sellerAddress}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return (rows as { listing_id: string; fill_txid: string; created_at: string }[]).map(r => ({
    listingId: r.listing_id,
    txid: r.fill_txid,
    createdAt: r.created_at,
  }));
}
