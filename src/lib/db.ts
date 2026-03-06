/**
 * lib/db.ts — Neon Postgres pool (server-side only).
 * Auto-creates requests table on first query.
 * Reads DATABASE_URL from env (set in Vercel project settings).
 */
import { neon } from '@neondatabase/serverless';

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL env var is not set');
  return neon(url);
}

let _initialized = false;

export async function ensureTable() {
  if (_initialized) return;

  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS requests (
      id                 TEXT PRIMARY KEY,
      created_at         BIGINT NOT NULL,
      updated_at         BIGINT NOT NULL,
      status             TEXT    NOT NULL DEFAULT 'open',
      requester_address  TEXT    NOT NULL,
      asset_type         TEXT    NOT NULL,
      contract_address   TEXT    NOT NULL,
      token_amount_raw   TEXT,
      token_decimals     INTEGER,
      token_symbol       TEXT,
      token_name         TEXT,
      token_id           TEXT,
      btc_sats           TEXT    NOT NULL,
      restricted_seller  TEXT,
      fulfilled_at       BIGINT,
      fulfilled_by       TEXT,
      listing_id         TEXT,
      shared_fees        BOOLEAN DEFAULT FALSE
    )
  `;

  // Migration: add shared_fees column if missing (existing tables)
  await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS shared_fees BOOLEAN DEFAULT FALSE`;

  _initialized = true;
}

export { getSQL };
