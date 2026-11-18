import { Account } from '../../src/domain/account';
import { InsufficientFundsError, SameAccountTransferError, ValidationError } from '../../src/domain/errors';
import { calculateTransfer } from '../../src/domain/transfer';

const account = (id: string, balanceCents: number): Account => ({
  id,
  ownerName: `Titular ${id}`,
  document: '12345678901',
  balanceCents,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('calculateTransfer', () => {
  it('debita a origem e credita o destino', () => {
    const result = calculateTransfer(account('a', 10_000), account('b', 500), 2_500);
    expect(result).toEqual({ fromBalanceCents: 7_500, toBalanceCents: 3_000 });
  });

  it('permite transferir exatamente o saldo total (saldo final zero)', () => {
    const result = calculateTransfer(account('a', 1_000), account('b', 0), 1_000);
    expect(result.fromBalanceCents).toBe(0);
    expect(result.toBalanceCents).toBe(1_000);
  });

  it('preserva o total de dinheiro do sistema (conservação de saldo)', () => {
    const from = account('a', 9_999);
    const to = account('b', 1);
    const r = calculateTransfer(from, to, 4_321);
    expect(r.fromBalanceCents + r.toBalanceCents).toBe(from.balanceCents + to.balanceCents);
  });

  it('lança InsufficientFundsError quando o saldo é menor que o valor', () => {
    expect(() => calculateTransfer(account('a', 999), account('b', 0), 1_000)).toThrow(InsufficientFundsError);
  });

  it('lança SameAccountTransferError para mesma conta', () => {
    const a = account('a', 1_000);
    expect(() => calculateTransfer(a, a, 100)).toThrow(SameAccountTransferError);
  });

  it.each([0, -100, 10.5])('rejeita valor inválido em centavos: %p', (amount) => {
    expect(() => calculateTransfer(account('a', 1_000), account('b', 0), amount)).toThrow(ValidationError);
  });

  it('não altera os objetos de entrada (função pura)', () => {
    const from = account('a', 1_000);
    const to = account('b', 0);
    calculateTransfer(from, to, 300);
    expect(from.balanceCents).toBe(1_000);
    expect(to.balanceCents).toBe(0);
  });
});
