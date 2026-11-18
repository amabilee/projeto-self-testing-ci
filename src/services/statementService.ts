import { Account } from '../domain/account';
import { AccountNotFoundError } from '../domain/errors';
import {
  RawStatementQuery,
  StatementFilter,
  StatementTotals,
  Transaction,
  parseStatementFilter,
  summarizeTransactions,
} from '../domain/transaction';
import { AccountRepository } from '../repositories/accountRepository';
import { TransactionRepository } from '../repositories/transactionRepository';

export interface Statement {
  account: Account;
  filter: StatementFilter;
  transactions: Transaction[];
  totals: StatementTotals;
}

export class StatementService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  getStatement(accountId: string, query: RawStatementQuery = {}): Statement {
    const filter = parseStatementFilter(query);
    const account = this.accounts.findById(accountId);
    if (!account) throw new AccountNotFoundError(accountId);

    const transactions = this.transactions.findByAccount(accountId, filter);
    return { account, filter, transactions, totals: summarizeTransactions(transactions) };
  }
}
