import { ValidationError } from './errors';

export type TransactionType = 'DEBIT' | 'CREDIT';

export interface Transaction {
  id: string;
  accountId: string;
  transferId: string;
  type: TransactionType;
  amountCents: number;
  balanceAfterCents: number;
  counterpartyAccountId: string;
  description: string | null;
  createdAt: string;
}

export interface StatementFilter {
  from?: string;
  to?: string;
  type?: TransactionType;
}

export interface RawStatementQuery {
  from?: unknown;
  to?: unknown;
  type?: unknown;
}

export function parseStatementFilter(query: RawStatementQuery): StatementFilter {
  let from: string | undefined;
  if (query.from !== undefined && query.from !== '') {
    if (typeof query.from !== 'string') throw new ValidationError('from deve ser uma data ISO-8601');
    const raw = /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? `${query.from}T00:00:00.000Z` : query.from;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new ValidationError('from deve ser uma data ISO-8601');
    from = date.toISOString();
  }

  let to: string | undefined;
  if (query.to !== undefined && query.to !== '') {
    if (typeof query.to !== 'string') throw new ValidationError('to deve ser uma data ISO-8601');
    const raw = /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? `${query.to}T23:59:59.999Z` : query.to;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new ValidationError('to deve ser uma data ISO-8601');
    to = date.toISOString();
  }

  if (from && to && from > to) {
    throw new ValidationError('from deve ser anterior ou igual a to');
  }

  let type: TransactionType | undefined;
  if (query.type !== undefined && query.type !== '') {
    const normalized = String(query.type).toUpperCase();
    if (normalized !== 'DEBIT' && normalized !== 'CREDIT') {
      throw new ValidationError('type deve ser "debit" ou "credit"');
    }
    type = normalized;
  }
  return { from, to, type };
}

export interface StatementTotals {
  creditsCents: number;
  debitsCents: number;
}

export function summarizeTransactions(transactions: Transaction[]): StatementTotals {
  return transactions.reduce<StatementTotals>(
    (acc, t) => {
      if (t.type === 'CREDIT') acc.creditsCents += t.amountCents;
      else acc.debitsCents += t.amountCents;
      return acc;
    },
    { creditsCents: 0, debitsCents: 0 },
  );
}
