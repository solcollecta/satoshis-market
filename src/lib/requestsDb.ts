/**
 * lib/requestsDb.ts — CRUD for buy requests (server-side only).
 */
import { v4 as uuidv4 } from 'uuid';
import { getSQL, ensureTable } from './db';

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
  tokenAmountRaw:   string | null;
  tokenDecimals:    number | null;
  tokenSymbol:      string | null;
  tokenName:        string | null;
  tokenId:          string | null;
  btcSats:          string;
  restrictedSeller: string | null;
  fulfilledAt:      number | null;
  fulfilledBy:      string | null;
  listingId:        string | null;
  sharedFees:       boolean;
}

// ── Row mapping ───────────────────────────────────────────────────────────────

interface RawRow {
  id:                string;
  created_at:        string;
  updated_at:        string;
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
  fulfilled_at:      string | null;
  fulfilled_by:      string | null;
  listing_id:        string | null;
  shared_fees:       boolean | null;
}

function rowToRequest(row: RawRow): BuyRequest {
  return {
    id:               row.id,
    createdAt:        Number(row.created_at),
    updatedAt:        Number(row.updated_at),
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
    fulfilledAt:      row.fulfilled_at ? Number(row.fulfilled_at) : null,
    fulfilledBy:      row.fulfilled_by,
    listingId:        row.listing_id,
    sharedFees:       !!row.shared_fees,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export interface ListRequestsFilter {
  status?:    string;
  assetType?: string;
  q?:         string;
}

export async function listRequests(filter: ListRequestsFilter = {}): Promise<BuyRequest[]> {
  await ensureTable();
  const sql = getSQL();

  // Build dynamic WHERE
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filter.status) {
    conditions.push(`status = $${idx++}`);
    values.push(filter.status);
  }
  if (filter.assetType) {
    conditions.push(`asset_type = $${idx++}`);
    values.push(filter.assetType);
  }
  if (filter.q) {
    const like = `%${filter.q}%`;
    conditions.push(`(contract_address LIKE $${idx++} OR token_symbol LIKE $${idx++} OR token_name LIKE $${idx++})`);
    values.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM requests ${where} ORDER BY created_at DESC`;

  const rows = await sql.query(query, values) as RawRow[];
  return rows.map(rowToRequest);
}

export async function getRequest(id: string): Promise<BuyRequest | null> {
  await ensureTable();
  const sql = getSQL();
  const rows = await sql`SELECT * FROM requests WHERE id = ${id}`;
  const row = rows[0] as RawRow | undefined;
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
  sharedFees?:      boolean;
}

export async function createRequest(data: CreateRequestData): Promise<BuyRequest> {
  await ensureTable();
  const sql = getSQL();
  const id  = uuidv4();
  const now = Date.now();

  await sql`
    INSERT INTO requests (
      id, created_at, updated_at, status,
      requester_address, asset_type, contract_address,
      token_amount_raw, token_decimals, token_symbol, token_name,
      token_id, btc_sats, restricted_seller, shared_fees
    ) VALUES (
      ${id}, ${now}, ${now}, ${'open'},
      ${data.requesterAddress}, ${data.assetType}, ${data.contractAddress},
      ${data.tokenAmountRaw ?? null}, ${data.tokenDecimals ?? null},
      ${data.tokenSymbol ?? null}, ${data.tokenName ?? null},
      ${data.tokenId ?? null}, ${data.btcSats},
      ${data.restrictedSeller ?? null}, ${data.sharedFees ?? false}
    )
  `;

  return (await getRequest(id))!;
}

export async function cancelRequest(id: string, requesterAddress: string): Promise<boolean> {
  await ensureTable();
  const sql = getSQL();
  const now = Date.now();
  const result = await sql`
    UPDATE requests
    SET status = 'cancelled', updated_at = ${now}
    WHERE id = ${id} AND requester_address = ${requesterAddress} AND status = 'open'
    RETURNING id
  `;
  return result.length > 0;
}

export async function fulfillRequest(id: string, listingId: string, fulfilledBy: string): Promise<boolean> {
  await ensureTable();
  const sql = getSQL();
  const now = Date.now();
  const result = await sql`
    UPDATE requests
    SET status = 'fulfilled', updated_at = ${now}, fulfilled_at = ${now},
        fulfilled_by = ${fulfilledBy}, listing_id = ${listingId}
    WHERE id = ${id} AND status = 'open'
    RETURNING id
  `;
  return result.length > 0;
}
