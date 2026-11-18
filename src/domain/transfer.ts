import { Account } from './account';
import { InsufficientFundsError, SameAccountTransferError, ValidationError } from './errors';

export interface TransferResult {
  fromBalanceCents: number;
  toBalanceCents: number;
}

export function calculateTransfer(from: Account, to: Account, amountCents: number): TransferResult {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('Valor da transferência deve ser um inteiro positivo em centavos');
  }
  if (from.id === to.id) {
    throw new SameAccountTransferError();
  }
  if (from.balanceCents < amountCents) {
    throw new InsufficientFundsError();
  }
  return {
    fromBalanceCents: from.balanceCents - amountCents,
    toBalanceCents: to.balanceCents + amountCents,
  };
}
