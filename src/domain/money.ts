import { ValidationError } from './errors';

export const maxAmountCents = 100_000_000_000;

export function toCents(value: unknown, { allowZero = false } = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError('Valor monetário deve ser um número');
  }
  const cents = Math.round(value * 100);
  if (Math.abs(cents - value * 100) > 1e-6) {
    throw new ValidationError('Valor monetário deve ter no máximo 2 casas decimais');
  }
  if (cents < 0 || (!allowZero && cents === 0)) {
    throw new ValidationError(allowZero ? 'Valor não pode ser negativo' : 'Valor deve ser maior que zero');
  }
  if (cents > maxAmountCents) {
    throw new ValidationError('Valor excede o limite permitido');
  }
  return cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}
