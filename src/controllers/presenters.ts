import { Account } from '../domain/account';
import { fromCents } from '../domain/money';
import { Transaction } from '../domain/transaction';
import { TransferRecord } from '../repositories/transferRepository';
import { Statement } from '../services/statementService';

export const presentAccount = (a: Account) => ({
  id: a.id,
  ownerName: a.ownerName,
  document: a.document,
  balance: fromCents(a.balanceCents),
  createdAt: a.createdAt,
});

export const presentTransfer = (t: TransferRecord) => ({
  id: t.id,
  fromAccountId: t.fromAccountId,
  toAccountId: t.toAccountId,
  amount: fromCents(t.amountCents),
  description: t.description,
  createdAt: t.createdAt,
});

export const presentTransaction = (t: Transaction) => ({
  id: t.id,
  transferId: t.transferId,
  type: t.type.toLowerCase(),
  amount: fromCents(t.amountCents),
  balanceAfter: fromCents(t.balanceAfterCents),
  counterpartyAccountId: t.counterpartyAccountId,
  description: t.description,
  createdAt: t.createdAt,
});

export const presentStatement = (s: Statement) => ({
  accountId: s.account.id,
  ownerName: s.account.ownerName,
  currentBalance: fromCents(s.account.balanceCents),
  filter: { from: s.filter.from ?? null, to: s.filter.to ?? null, type: s.filter.type?.toLowerCase() ?? null },
  totals: { credits: fromCents(s.totals.creditsCents), debits: fromCents(s.totals.debitsCents) },
  transactions: s.transactions.map(presentTransaction),
});
