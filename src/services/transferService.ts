import { createHash } from 'node:crypto';
import { AccountNotFoundError, IdempotencyConflictError, ValidationError } from '../domain/errors';
import { toCents } from '../domain/money';
import { calculateTransfer } from '../domain/transfer';
import { AntiFraudGateway } from '../gateways/antiFraudGateway';
import { AccountRepository } from '../repositories/accountRepository';
import { Db } from '../repositories/database';
import { TransactionRepository } from '../repositories/transactionRepository';
import { TransferRecord, TransferRepository } from '../repositories/transferRepository';
import { Clock, IdGenerator, Logger } from './types';

export interface TransferInput {
  fromAccountId: unknown;
  toAccountId: unknown;
  amount: unknown;
  description?: unknown;
  idempotencyKey?: string;
}

export interface TransferOutcome {
  transfer: TransferRecord;
  replayed: boolean;
}

export interface TransferServiceDeps {
  db: Db;
  accounts: AccountRepository;
  transfers: TransferRepository;
  transactions: TransactionRepository;
  antiFraud: AntiFraudGateway;
  generateId: IdGenerator;
  clock: Clock;
  logger: Logger;
}

const hashRequest = (from: string, to: string, amountCents: number): string =>
  createHash('sha256').update(`${from}|${to}|${amountCents}`).digest('hex');

export class TransferService {
  constructor(private readonly deps: TransferServiceDeps) {}

  async transfer(input: TransferInput): Promise<TransferOutcome> {
    const { fromAccountId, toAccountId } = input;
    if (typeof fromAccountId !== 'string' || typeof toAccountId !== 'string' || !fromAccountId || !toAccountId) {
      throw new ValidationError('fromAccountId e toAccountId são obrigatórios');
    }
    if (input.description !== undefined && typeof input.description !== 'string') {
      throw new ValidationError('description deve ser texto');
    }
    if (input.idempotencyKey !== undefined && (input.idempotencyKey.length === 0 || input.idempotencyKey.length > 128)) {
      throw new ValidationError('Idempotency-Key deve ter entre 1 e 128 caracteres');
    }
    const amountCents = toCents(input.amount);
    const requestHash = hashRequest(fromAccountId, toAccountId, amountCents);
    const description = input.description ?? null;

    const outcome = this.deps.db
      .transaction((): TransferOutcome => {
        if (input.idempotencyKey) {
          const previous = this.deps.transfers.findByIdempotencyKey(input.idempotencyKey);
          if (previous) {
            if (previous.requestHash !== requestHash) throw new IdempotencyConflictError();
            return { transfer: previous, replayed: true };
          }
        }

        const from = this.deps.accounts.findById(fromAccountId);
        if (!from) throw new AccountNotFoundError(fromAccountId);
        const to = this.deps.accounts.findById(toAccountId);
        if (!to) throw new AccountNotFoundError(toAccountId);

        const balances = calculateTransfer(from, to, amountCents);
        const now = this.deps.clock().toISOString();
        const transfer: TransferRecord = {
          id: this.deps.generateId(),
          fromAccountId,
          toAccountId,
          amountCents,
          description,
          idempotencyKey: input.idempotencyKey ?? null,
          requestHash,
          createdAt: now,
        };

        this.deps.transfers.insert(transfer);
        this.deps.accounts.updateBalance(from.id, balances.fromBalanceCents);
        this.deps.accounts.updateBalance(to.id, balances.toBalanceCents);
        this.deps.transactions.insert({
          id: this.deps.generateId(),
          accountId: from.id,
          transferId: transfer.id,
          type: 'DEBIT',
          amountCents,
          balanceAfterCents: balances.fromBalanceCents,
          counterpartyAccountId: to.id,
          description,
          createdAt: now,
        });
        this.deps.transactions.insert({
          id: this.deps.generateId(),
          accountId: to.id,
          transferId: transfer.id,
          type: 'CREDIT',
          amountCents,
          balanceAfterCents: balances.toBalanceCents,
          counterpartyAccountId: from.id,
          description,
          createdAt: now,
        });
        return { transfer, replayed: false };
      })
      .immediate();

    if (!outcome.replayed) {
      await this.notifyAntiFraud(outcome.transfer);
    }
    return outcome;
  }

  private async notifyAntiFraud(transfer: TransferRecord): Promise<void> {
    try {
      await this.deps.antiFraud.notifyTransfer({
        transferId: transfer.id,
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        amountCents: transfer.amountCents,
        occurredAt: transfer.createdAt,
      });
    } catch (error) {
      this.deps.logger.error('Falha ao notificar serviço anti-fraude', {
        transferId: transfer.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
