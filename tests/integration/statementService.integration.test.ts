import { AccountNotFoundError, ValidationError } from '../../src/domain/errors';
import { buildTestContext } from './helpers';

describe('StatementService (integração com SQLite em memória)', () => {
  async function scenario() {
    const ctx = buildTestContext();
    const alice = await ctx.openAccount(1000, 'Alice');
    const bob = await ctx.openAccount(1000, 'Bob');

    ctx.clock.set('2026-01-10T10:00:00.000Z');
    await ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 100 });
    ctx.clock.set('2026-01-12T10:00:00.000Z');
    await ctx.transferService.transfer({ fromAccountId: bob.id, toAccountId: alice.id, amount: 40 });
    ctx.clock.set('2026-01-20T10:00:00.000Z');
    await ctx.transferService.transfer({ fromAccountId: alice.id, toAccountId: bob.id, amount: 10 });
    return { ctx, alice, bob };
  }

  it('retorna todas as transações em ordem cronológica com totais', async () => {
    const { ctx, alice } = await scenario();
    const st = ctx.statementService.getStatement(alice.id);

    expect(st.transactions.map((t) => [t.type, t.amountCents, t.balanceAfterCents])).toEqual([
      ['DEBIT', 10_000, 90_000],
      ['CREDIT', 4_000, 94_000],
      ['DEBIT', 1_000, 93_000],
    ]);
    expect(st.totals).toEqual({ creditsCents: 4_000, debitsCents: 11_000 });
    expect(st.account.balanceCents).toBe(93_000);
  });

  it('filtra por período', async () => {
    const { ctx, alice } = await scenario();
    const st = ctx.statementService.getStatement(alice.id, { from: '2026-01-11', to: '2026-01-15' });
    expect(st.transactions).toHaveLength(1);
    expect(st.transactions[0]).toMatchObject({ type: 'CREDIT', amountCents: 4_000 });
  });

  it('filtra por tipo', async () => {
    const { ctx, alice } = await scenario();
    const debits = ctx.statementService.getStatement(alice.id, { type: 'debit' });
    expect(debits.transactions.every((t) => t.type === 'DEBIT')).toBe(true);
    expect(debits.transactions).toHaveLength(2);
    expect(debits.totals.creditsCents).toBe(0);
  });

  it('combina período e tipo', async () => {
    const { ctx, alice } = await scenario();
    const st = ctx.statementService.getStatement(alice.id, { from: '2026-01-15', type: 'debit' });
    expect(st.transactions.map((t) => t.amountCents)).toEqual([1_000]);
  });

  it('valida filtros antes de consultar', async () => {
    const { ctx, alice } = await scenario();
    expect(() => ctx.statementService.getStatement(alice.id, { type: 'x' })).toThrow(ValidationError);
  });

  it('lança AccountNotFoundError para conta inexistente', () => {
    const ctx = buildTestContext();
    expect(() => ctx.statementService.getStatement('nope')).toThrow(AccountNotFoundError);
  });
});
