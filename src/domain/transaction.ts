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

function parseDate(value: unknown, field: string, endOfDay: boolean): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${field} deve ser uma data ISO-8601`);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const normalized = isDateOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} deve ser uma data ISO-8601`);
  return date.toISOString();
}

export function parseStatementFilter(query: RawStatementQuery): StatementFilter {
  const from = parseDate(query.from, 'from', false);
  const to = parseDate(query.to, 'to', true);
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
