import { AntiFraudGateway } from '../../src/gateways/antiFraudGateway';
import { CustomerValidationProvider } from '../../src/gateways/customerValidationProvider';
import { AccountRepository } from '../../src/repositories/accountRepository';
import { createDatabase } from '../../src/repositories/database';
import { TransactionRepository } from '../../src/repositories/transactionRepository';
import { TransferRepository } from '../../src/repositories/transferRepository';
import { AccountService } from '../../src/services/accountService';
import { StatementService } from '../../src/services/statementService';
import { TransferService } from '../../src/services/transferService';
import {
  approvingCustomerValidation,
  createAntiFraudMock,
  createLoggerSpy,
  fixedClock,
  sequentialIds,
} from '../doubles';

export function buildTestContext(
  opts: { antiFraud?: AntiFraudGateway; customerValidation?: CustomerValidationProvider } = {},
) {
  const db = createDatabase(':memory:');
  const clock = fixedClock();
  const generateId = sequentialIds();
  const logger = createLoggerSpy();
  const antiFraud = opts.antiFraud ?? createAntiFraudMock();
  const repos = {
    accounts: new AccountRepository(db),
    transfers: new TransferRepository(db),
    transactions: new TransactionRepository(db),
  };
  const accountService = new AccountService(
    repos.accounts,
    opts.customerValidation ?? approvingCustomerValidation(),
    generateId,
    clock,
  );
  const transferService = new TransferService({ db, ...repos, antiFraud, generateId, clock, logger });
  const statementService = new StatementService(repos.accounts, repos.transactions);

  let docSeq = 10_000_000_000;
  const openAccount = (initialBalance: number, ownerName = 'Cliente Teste') =>
    accountService.create({ ownerName, document: String(++docSeq), initialBalance });

  return { db, clock, logger, antiFraud, repos, accountService, transferService, statementService, openAccount };
}
