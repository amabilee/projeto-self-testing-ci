import {
  AccountNotFoundError,
  IdempotencyConflictError,
  InsufficientFundsError,
  SameAccountTransferError,
  ValidationError,
} from '../../src/domain/errors';
import { createAntiFraudMock } from '../doubles';
import { buildTestContext } from './helpers';

describe('TransferService (integração com SQLite em memória + Mock anti-fraude)', () => {
  it('persiste a transferência, atualiza saldos e gera lançamentos de débito e crédito', async () => {
    const ctx = buildTestContext();
    const alice = await ctx.openAccount(100);
    const bob = await ctx.openAccount(20);

    const { transfer, replayed } = await ctx.transferService.transfer({
      fromAccountId: alice.id,
      toAccountId: bob.id,
      amount: 30.5,
      description: 'Aluguel',
    });

    expect(replayed).toBe(false);
    expect(transfer).toMatchObject({ fromAccountId: alice.id, toAccountId: bob.id, amountCents: 3050 });
    expect(ctx.repos.accounts.findById(alice.id)?.balanceCents).toBe(6950);
    expect(ctx.repos.accounts.findById(bob.id)?.balanceCents).toBe(5050);

    const [debit] = ctx.repos.transactions.findByAccount(alice.id);
    const [credit] = ctx.repos.transactions.findByAccount(bob.id);
    expect(debit).toMatchObject({ type: 'DEBIT', amountCents: 3050, balanceAfterCents: 6950, counterpartyAccountId: bob.id, description: 'Aluguel' });
    expect(credit).toMatchObject({ type: 'CREDIT', amountCents: 3050, balanceAfterCents: 5050, counterpartyAccountId: alice.id });
  });

  describe('interação com o serviço anti-fraude (MOCK)', () => {
    it('notifica exatamente UMA vez com os parâmetros corretos', async () => {
      const antiFraud = createAntiFraudMock();
      const ctx = buildTestContext({ antiFraud });
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);

      const { transfer } = await ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 10 });

      expect(antiFraud.notifyTransfer).toHaveBeenCalledTimes(1);
      expect(antiFraud.notifyTransfer).toHaveBeenCalledWith({
        transferId: transfer.id,
        fromAccountId: alice.id,
        toAccountId: bob.id,
        amountCents: 1000,
        occurredAt: '2026-01-15T12:00:00.000Z',
      });
    });

    it('NÃO notifica quando a transferência é rejeitada por saldo insuficiente', async () => {
      const antiFraud = createAntiFraudMock();
      const ctx = buildTestContext({ antiFraud });
      const alice = await ctx.openAccount(5);
      const bob = await ctx.openAccount(0);

      await expect(
        ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 10 }),
      ).rejects.toThrow(InsufficientFundsError);
      expect(antiFraud.notifyTransfer).not.toHaveBeenCalled();
    });

    it('NÃO notifica novamente em uma repetição idempotente', async () => {
      const antiFraud = createAntiFraudMock();
      const ctx = buildTestContext({ antiFraud });
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);
      const input = { fromAccountId: alice.id, toAccountId: bob.id, amount: 10, idempotencyKey: 'key-1' };

      await ctx.transferService.transfer(input);
      await ctx.transferService.transfer(input);
      await ctx.transferService.transfer(input);

      expect(antiFraud.notifyTransfer).toHaveBeenCalledTimes(1);
    });

    it('mantém a transferência e registra log de erro quando o gateway falha', async () => {
      const antiFraud = createAntiFraudMock();
      antiFraud.notifyTransfer.mockRejectedValueOnce(new Error('timeout'));
      const ctx = buildTestContext({ antiFraud });
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);

      const { transfer } = await ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 10 });

      expect(ctx.repos.accounts.findById(alice.id)?.balanceCents).toBe(9000);
      expect(ctx.logger.error).toHaveBeenCalledWith('Falha ao notificar serviço anti-fraude', {
        transferId: transfer.id,
        error: 'timeout',
      });
    });

    it('registra log mesmo quando o gateway rejeita com valor que não é Error', async () => {
      const antiFraud = createAntiFraudMock();
      antiFraud.notifyTransfer.mockRejectedValueOnce('falha-bruta');
      const ctx = buildTestContext({ antiFraud });
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);

      await ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 1 });
      expect(ctx.logger.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: 'falha-bruta' }));
    });
  });

  describe('idempotência', () => {
    it('retorna a mesma transferência e não debita duas vezes', async () => {
      const ctx = buildTestContext();
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);
      const input = { fromAccountId: alice.id, toAccountId: bob.id, amount: 25, idempotencyKey: 'abc' };

      const first = await ctx.transferService.transfer(input);
      const second = await ctx.transferService.transfer(input);

      expect(second.replayed).toBe(true);
      expect(second.transfer.id).toBe(first.transfer.id);
      expect(ctx.repos.accounts.findById(alice.id)?.balanceCents).toBe(7500);
      expect(ctx.repos.transactions.findByAccount(alice.id)).toHaveLength(1);
    });

    it('rejeita a mesma chave com payload diferente', async () => {
      const ctx = buildTestContext();
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);

      await ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 25, idempotencyKey: 'abc' });
      await expect(
        ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 30, idempotencyKey: 'abc' }),
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it.each([[''], ['x'.repeat(129)]])('rejeita Idempotency-Key com tamanho inválido', async (idempotencyKey) => {
      const ctx = buildTestContext();
      await expect(
        ctx.transferService.transfer({ fromAccountId: 'a', toAccountId: 'b', amount: 1, idempotencyKey }),
      ).rejects.toThrow('Idempotency-Key deve ter entre 1 e 128');
    });
  });

  describe('concorrência', () => {
    it('50 transferências simultâneas não geram saldo negativo nem perda de dinheiro', async () => {
      const ctx = buildTestContext();
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);

      const results = await Promise.allSettled(
        Array.from({ length: 50 }, () =>
          ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 2.5 }),
        ),
      );

      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(ok).toHaveLength(40);
      expect(failed).toHaveLength(10);
      failed.forEach((f) => expect(f.reason).toBeInstanceOf(InsufficientFundsError));

      const a = ctx.repos.accounts.findById(alice.id)!;
      const b = ctx.repos.accounts.findById(bob.id)!;
      expect(a.balanceCents).toBe(0);
      expect(b.balanceCents).toBe(10_000);
      expect(ctx.antiFraud.notifyTransfer).toHaveBeenCalledTimes(40);
    });

    it('requisições simultâneas com a mesma Idempotency-Key geram apenas uma transferência', async () => {
      const ctx = buildTestContext();
      const alice = await ctx.openAccount(100);
      const bob = await ctx.openAccount(0);
      const input = { fromAccountId: alice.id, toAccountId: bob.id, amount: 10, idempotencyKey: 'same' };

      const outcomes = await Promise.all(Array.from({ length: 20 }, () => ctx.transferService.transfer(input)));

      expect(new Set(outcomes.map((o) => o.transfer.id)).size).toBe(1);
      expect(outcomes.filter((o) => !o.replayed)).toHaveLength(1);
      expect(ctx.repos.accounts.findById(alice.id)?.balanceCents).toBe(9000);
    });
  });

  describe('validações e erros', () => {
    it('rejeita conta de origem inexistente sem alterar dados', async () => {
      const ctx = buildTestContext();
      const bob = await ctx.openAccount(0);
      await expect(
        ctx.transferService.transfer({ fromAccountId: 'nope', toAccountId: bob.id, amount: 1 }),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('rejeita conta de destino inexistente e faz rollback', async () => {
      const ctx = buildTestContext();
      const alice = await ctx.openAccount(10);
      await expect(
        ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: 'nope', amount: 1 }),
      ).rejects.toThrow(AccountNotFoundError);
      expect(ctx.repos.accounts.findById(alice.id)?.balanceCents).toBe(1000);
    });

    it('rejeita transferência para a mesma conta', async () => {
      const ctx = buildTestContext();
      const alice = await ctx.openAccount(10);
      await expect(
        ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: alice.id, amount: 1 }),
      ).rejects.toThrow(SameAccountTransferError);
    });

    it.each([
      [{ fromAccountId: undefined, toAccountId: 'b', amount: 1 }],
      [{ fromAccountId: 'a', toAccountId: 123, amount: 1 }],
      [{ fromAccountId: '', toAccountId: 'b', amount: 1 }],
      [{ fromAccountId: 'a', toAccountId: 'b', amount: 1, description: 42 }],
      [{ fromAccountId: 'a', toAccountId: 'b', amount: 'dez' }],
    ])('rejeita payload inválido %p', async (input) => {
      const ctx = buildTestContext();
      await expect(ctx.transferService.transfer(input)).rejects.toThrow(ValidationError);
    });
  });
});
