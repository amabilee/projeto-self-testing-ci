import { Account } from '../domain/account';
import { Db } from './database';

interface AccountRow {
  id: string;
  owner_name: string;
  document: string;
  balance_cents: number;
  created_at: string;
}

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  ownerName: row.owner_name,
  document: row.document,
  balanceCents: row.balance_cents,
  createdAt: row.created_at,
});

export class AccountRepository {
  constructor(private readonly db: Db) {}

  create(account: Account): void {
    this.db
      .prepare(
        `INSERT INTO accounts (id, owner_name, document, balance_cents, created_at)
         VALUES (@id, @ownerName, @document, @balanceCents, @createdAt)`,
      )
      .run(account);
  }

  findById(id: string): Account | undefined {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
    return row ? toAccount(row) : undefined;
  }

  existsByDocument(document: string): boolean {
    return this.db.prepare('SELECT 1 FROM accounts WHERE document = ?').get(document) !== undefined;
  }

  updateBalance(id: string, balanceCents: number): void {
    this.db.prepare('UPDATE accounts SET balance_cents = ? WHERE id = ?').run(balanceCents, id);
  }
}
