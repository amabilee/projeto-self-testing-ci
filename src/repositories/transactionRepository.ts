import { StatementFilter, Transaction } from '../domain/transaction';
import { Db } from './database';

interface TransactionRow {
  id: string;
  account_id: string;
  transfer_id: string;
  type: 'DEBIT' | 'CREDIT';
  amount_cents: number;
  balance_after_cents: number;
  counterparty_account_id: string;
  description: string | null;
  created_at: string;
}

const toTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  accountId: row.account_id,
  transferId: row.transfer_id,
  type: row.type,
  amountCents: row.amount_cents,
  balanceAfterCents: row.balance_after_cents,
  counterpartyAccountId: row.counterparty_account_id,
  description: row.description,
  createdAt: row.created_at,
});

export class TransactionRepository {
  constructor(private readonly db: Db) {}

  insert(t: Transaction): void {
    this.db
      .prepare(
        `INSERT INTO transactions (id, account_id, transfer_id, type, amount_cents, balance_after_cents, counterparty_account_id, description, created_at)
         VALUES (@id, @accountId, @transferId, @type, @amountCents, @balanceAfterCents, @counterpartyAccountId, @description, @createdAt)`,
      )
      .run(t);
  }

  findByAccount(accountId: string, filter: StatementFilter = {}): Transaction[] {
    const clauses = ['account_id = @accountId'];
    if (filter.from) clauses.push('created_at >= @from');
    if (filter.to) clauses.push('created_at <= @to');
    if (filter.type) clauses.push('type = @type');

    const rows = this.db
      .prepare(`SELECT * FROM transactions WHERE ${clauses.join(' AND ')} ORDER BY created_at ASC, seq ASC`)
      .all({ accountId, ...filter }) as TransactionRow[];
    return rows.map(toTransaction);
  }
}
