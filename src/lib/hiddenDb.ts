/**
 * lib/hiddenDb.ts — "Hidden" listing storage (server-side only).
 *
 * Stores offer IDs that the creator marked as "Hidden — Hide from Marketplace".
 * These listings exist on-chain but are hidden from the public grid.
 * Only the seller and the allowed taker (buyer) can see them.
 * Anyone with the direct link (/listing/[id]) can still access the detail page.
 *
 * Table: hidden_listings (auto-created on first access)
 */
import { getSQL } from './db';

let _init = false;

async function ensureTable() {
  if (_init) return;
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS hidden_listings (
      offer_id        TEXT PRIMARY KEY,
      creator_address TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  _init = true;
}

/** Mark an offer as hidden from the marketplace. */
export async function markHidden(offerId: string, creatorAddress: string): Promise<void> {
  await ensureTable();
  const sql = getSQL();
  await sql`
    INSERT INTO hidden_listings (offer_id, creator_address)
    VALUES (${offerId}, ${creatorAddress})
    ON CONFLICT (offer_id) DO NOTHING
  `;
}

/** Remove hidden flag (make visible again). */
export async function markVisible(offerId: string): Promise<void> {
  await ensureTable();
  const sql = getSQL();
  await sql`DELETE FROM hidden_listings WHERE offer_id = ${offerId}`;
}

/** Get all hidden offer IDs. */
export async function getHiddenIds(): Promise<Set<string>> {
  await ensureTable();
  const sql = getSQL();
  const rows = await sql`SELECT offer_id FROM hidden_listings`;
  return new Set((rows as { offer_id: string }[]).map(r => r.offer_id));
}

/** Check if a specific offer is hidden. */
export async function isHidden(offerId: string): Promise<boolean> {
  await ensureTable();
  const sql = getSQL();
  const rows = await sql`SELECT 1 FROM hidden_listings WHERE offer_id = ${offerId} LIMIT 1`;
  return rows.length > 0;
}
