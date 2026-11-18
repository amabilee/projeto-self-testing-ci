import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

export function createDatabase(filename = ':memory:'): Db {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            TEXT PRIMARY KEY,
      owner_name    TEXT NOT NULL,
      document      TEXT NOT NULL UNIQUE,
      balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id               TEXT PRIMARY KEY,
      from_account_id  TEXT NOT NULL REFERENCES accounts(id),
      to_account_id    TEXT NOT NULL REFERENCES accounts(id),
      amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
      description      TEXT,
      idempotency_key  TEXT UNIQUE,
      request_hash     TEXT,
      created_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      seq                     INTEGER PRIMARY KEY AUTOINCREMENT,
      id                      TEXT NOT NULL UNIQUE,
      account_id              TEXT NOT NULL REFERENCES accounts(id),
      transfer_id             TEXT NOT NULL REFERENCES transfers(id),
      type                    TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
      amount_cents            INTEGER NOT NULL CHECK (amount_cents > 0),
      balance_after_cents     INTEGER NOT NULL,
      counterparty_account_id TEXT NOT NULL,
      description             TEXT,
      created_at              TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions (account_id, created_at);
  `);
  return db;
}
