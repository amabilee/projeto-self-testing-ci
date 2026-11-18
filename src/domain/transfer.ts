import { Account } from './account';
import { InsufficientFundsError, SameAccountTransferError, ValidationError } from './errors';

export function calculateTransfer(
  from: Account,
  to: Account,
  amountCents: number,
): { fromBalanceCents: number; toBalanceCents: number } {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('Valor da transferência deve ser um inteiro positivo em centavos');
  }
  if (from.id === to.id) {
    throw new SameAccountTransferError();
  }
  if (from.balanceCents < amountCents) {
    throw new InsufficientFundsError();
  }
  const newFromBalance = from.balanceCents - amountCents;
  const newToBalance = to.balanceCents + amountCents;
  return { fromBalanceCents: newFromBalance, toBalanceCents: newToBalance };
}
