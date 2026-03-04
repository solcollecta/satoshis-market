/**
 * lib/db.ts — SQLite singleton (server-side only).
 * Auto-creates data/ dir + requests table on first import.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR  = process.env.DB_FILE_PATH
  ? path.dirname(process.env.DB_FILE_PATH)
  : path.join(process.cwd(), 'data');

const DB_PATH = process.env.DB_FILE_PATH ?? path.join(DB_DIR, 'requests.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id                 TEXT PRIMARY KEY,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL,
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
      fulfilled_at       INTEGER,
      fulfilled_by       TEXT,
      listing_id         TEXT
    )
  `);

  return _db;
}
