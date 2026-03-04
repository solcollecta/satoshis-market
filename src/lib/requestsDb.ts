/**
 * lib/requestsDb.ts — CRUD for buy requests (server-side only).
 */
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';

export type RequestStatus = 'open' | 'fulfilled' | 'cancelled';
export type AssetType     = 'op20' | 'op721';

export interface BuyRequest {
  id:               string;
  createdAt:        number;
  updatedAt:        number;
  status:           RequestStatus;
  requesterAddress: string;
  assetType:        AssetType;
  contractAddress:  string;
  /** OP-20 only — raw bigint as string */
  tokenAmountRaw:   string | null;
  tokenDecimals:    number | null;
  tokenSymbol:      string | null;
  tokenName:        string | null;
  /** OP-721 only */
  tokenId:          string | null;
  /** satoshis as string */
  btcSats:          string;
  restrictedSeller: string | null;
  fulfilledAt:      number | null;
  fulfilledBy:      string | null;
  listingId:        string | null;
}

// ── Row mapping ───────────────────────────────────────────────────────────────

interface RawRow {
  id:                string;
  created_at:        number;
  updated_at:        number;
  status:            string;
  requester_address: string;
  asset_type:        string;
  contract_address:  string;
  token_amount_raw:  string | null;
  token_decimals:    number | null;
  token_symbol:      string | null;
  token_name:        string | null;
  token_id:          string | null;
  btc_sats:          string;
  restricted_seller: string | null;
  fulfilled_at:      number | null;
  fulfilled_by:      string | null;
  listing_id:        string | null;
}

function rowToRequest(row: RawRow): BuyRequest {
  return {
    id:               row.id,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
    status:           row.status as RequestStatus,
    requesterAddress: row.requester_address,
    assetType:        row.asset_type as AssetType,
    contractAddress:  row.contract_address,
    tokenAmountRaw:   row.token_amount_raw,
    tokenDecimals:    row.token_decimals,
    tokenSymbol:      row.token_symbol,
    tokenName:        row.token_name,
    tokenId:          row.token_id,
    btcSats:          row.btc_sats,
    restrictedSeller: row.restricted_seller,
    fulfilledAt:      row.fulfilled_at,
    fulfilledBy:      row.fulfilled_by,
    listingId:        row.listing_id,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export interface ListRequestsFilter {
  status?:    string;
  assetType?: string;
  q?:         string;
}

export function listRequests(filter: ListRequestsFilter = {}): BuyRequest[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.assetType) {
    conditions.push('asset_type = ?');
    params.push(filter.assetType);
  }
  if (filter.q) {
    conditions.push('(contract_address LIKE ? OR token_symbol LIKE ? OR token_name LIKE ?)');
    const like = `%${filter.q}%`;
    params.push(like, like, like);
  }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql    = `SELECT * FROM requests ${where} ORDER BY created_at DESC`;
  const rows   = db.prepare(sql).all(...params) as RawRow[];
  return rows.map(rowToRequest);
}

export function getRequest(id: string): BuyRequest | null {
  const db  = getDb();
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RawRow | undefined;
  return row ? rowToRequest(row) : null;
}

export interface CreateRequestData {
  requesterAddress: string;
  assetType:        AssetType;
  contractAddress:  string;
  tokenAmountRaw?:  string;
  tokenDecimals?:   number;
  tokenSymbol?:     string;
  tokenName?:       string;
  tokenId?:         string;
  btcSats:          string;
  restrictedSeller?: string;
}

export function createRequest(data: CreateRequestData): BuyRequest {
  const db  = getDb();
  const id  = uuidv4();
  const now = Date.now();

  db.prepare(`
    INSERT INTO requests (
      id, created_at, updated_at, status,
      requester_address, asset_type, contract_address,
      token_amount_raw, token_decimals, token_symbol, token_name,
      token_id, btc_sats, restricted_seller
    ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, now, now,
    data.requesterAddress, data.assetType, data.contractAddress,
    data.tokenAmountRaw  ?? null,
    data.tokenDecimals   ?? null,
    data.tokenSymbol     ?? null,
    data.tokenName       ?? null,
    data.tokenId         ?? null,
    data.btcSats,
    data.restrictedSeller ?? null,
  );

  return getRequest(id)!;
}

export function cancelRequest(id: string, requesterAddress: string): boolean {
  const db  = getDb();
  const now = Date.now();
  const result = db.prepare(`
    UPDATE requests
    SET status = 'cancelled', updated_at = ?
    WHERE id = ? AND requester_address = ? AND status = 'open'
  `).run(now, id, requesterAddress);
  return result.changes > 0;
}

export function fulfillRequest(id: string, listingId: string, fulfilledBy: string): boolean {
  const db  = getDb();
  const now = Date.now();
  const result = db.prepare(`
    UPDATE requests
    SET status = 'fulfilled', updated_at = ?, fulfilled_at = ?, fulfilled_by = ?, listing_id = ?
    WHERE id = ? AND status = 'open'
  `).run(now, now, fulfilledBy, listingId, id);
  return result.changes > 0;
}
