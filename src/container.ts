import { randomUUID } from 'node:crypto';
import { AppConfig } from './config';
import { AntiFraudGateway, HttpAntiFraudGateway } from './gateways/antiFraudGateway';
import {
  CustomerValidationProvider,
  LocalCustomerValidationProvider,
} from './gateways/customerValidationProvider';
import { AccountRepository } from './repositories/accountRepository';
import { Db, createDatabase } from './repositories/database';
import { TransactionRepository } from './repositories/transactionRepository';
import { TransferRepository } from './repositories/transferRepository';
import { AccountService } from './services/accountService';
import { StatementService } from './services/statementService';
import { TransferService } from './services/transferService';
import { Clock, IdGenerator, Logger } from './services/types';

export interface Container {
  db: Db;
  logger: Logger;
  accountService: AccountService;
  transferService: TransferService;
  statementService: StatementService;
}

export interface ContainerOverrides {
  db?: Db;
  antiFraud?: AntiFraudGateway;
  customerValidation?: CustomerValidationProvider;
  generateId?: IdGenerator;
  clock?: Clock;
  logger?: Logger;
}

export const consoleLogger: Logger = {
  info: (message, meta) => console.info(JSON.stringify({ level: 'info', message, ...meta })),
  error: (message, meta) => console.error(JSON.stringify({ level: 'error', message, ...meta })),
};

export function buildContainer(config: AppConfig, overrides: ContainerOverrides = {}): Container {
  const db = overrides.db ?? createDatabase(config.databasePath);
  const logger = overrides.logger ?? consoleLogger;
  const generateId = overrides.generateId ?? randomUUID;
  const clock = overrides.clock ?? (() => new Date());

  const accounts = new AccountRepository(db);
  const transfers = new TransferRepository(db);
  const transactions = new TransactionRepository(db);

  const antiFraud =
    overrides.antiFraud ?? new HttpAntiFraudGateway(config.antiFraudWebhookUrl, config.antiFraudTimeoutMs);
  const customerValidation = overrides.customerValidation ?? new LocalCustomerValidationProvider();

  return {
    db,
    logger,
    accountService: new AccountService(accounts, customerValidation, generateId, clock),
    transferService: new TransferService({
      db,
      accounts,
      transfers,
      transactions,
      antiFraud,
      generateId,
      clock,
      logger,
    }),
    statementService: new StatementService(accounts, transactions),
  };
}
