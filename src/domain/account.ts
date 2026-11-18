import { ValidationError } from './errors';
import { toCents } from './money';

export interface Account {
  id: string;
  ownerName: string;
  document: string;
  balanceCents: number;
  createdAt: string;
}

export interface NewAccountInput {
  ownerName: unknown;
  document: unknown;
  initialBalance?: unknown;
}

export interface ValidatedNewAccount {
  ownerName: string;
  document: string;
  initialBalanceCents: number;
}

export function validateNewAccount(input: NewAccountInput): ValidatedNewAccount {
  if (typeof input.ownerName !== 'string' || input.ownerName.trim().length < 3) {
    throw new ValidationError('ownerName deve ter ao menos 3 caracteres');
  }
  if (typeof input.document !== 'string') {
    throw new ValidationError('document é obrigatório');
  }
  const document = input.document.replace(/\D/g, '');
  if (document.length !== 11 && document.length !== 14) {
    throw new ValidationError('document deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos)');
  }
  const initialBalanceCents =
    input.initialBalance === undefined ? 0 : toCents(input.initialBalance, { allowZero: true });

  return { ownerName: input.ownerName.trim(), document, initialBalanceCents };
}
