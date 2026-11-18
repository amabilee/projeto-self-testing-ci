import { Db } from './database';

export interface TransferRecord {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  description: string | null;
  idempotencyKey: string | null;
  requestHash: string | null;
  createdAt: string;
}

interface TransferRow {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  description: string | null;
  idempotency_key: string | null;
  request_hash: string | null;
  created_at: string;
}

const toRecord = (row: TransferRow): TransferRecord => ({
  id: row.id,
  fromAccountId: row.from_account_id,
  toAccountId: row.to_account_id,
  amountCents: row.amount_cents,
  description: row.description,
  idempotencyKey: row.idempotency_key,
  requestHash: row.request_hash,
  createdAt: row.created_at,
});

export class TransferRepository {
  constructor(private readonly db: Db) {}

  insert(transfer: TransferRecord): void {
    this.db
      .prepare(
        `INSERT INTO transfers (id, from_account_id, to_account_id, amount_cents, description, idempotency_key, request_hash, created_at)
         VALUES (@id, @fromAccountId, @toAccountId, @amountCents, @description, @idempotencyKey, @requestHash, @createdAt)`,
      )
      .run(transfer);
  }

  findByIdempotencyKey(key: string): TransferRecord | undefined {
    const row = this.db.prepare('SELECT * FROM transfers WHERE idempotency_key = ?').get(key) as
      | TransferRow
      | undefined;
    return row ? toRecord(row) : undefined;
  }
}
