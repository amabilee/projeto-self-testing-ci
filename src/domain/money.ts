import { ValidationError } from './errors';

export const maxAmountCents = 100000000000;

export function toCents(value: unknown, options: { allowZero?: boolean } = {}): number {
  if (typeof value !== 'number') {
    throw new ValidationError('Valor monetário deve ser um número');
  }
  if (!Number.isFinite(value)) {
    throw new ValidationError('Valor monetário deve ser um número');
  }
  const cents = Math.round(value * 100);
  if (Math.abs(cents - value * 100) > 0.000001) {
    throw new ValidationError('Valor monetário deve ter no máximo 2 casas decimais');
  }
  if (cents < 0) {
    if (options.allowZero) {
      throw new ValidationError('Valor não pode ser negativo');
    }
    throw new ValidationError('Valor deve ser maior que zero');
  }
  if (cents === 0 && !options.allowZero) {
    throw new ValidationError('Valor deve ser maior que zero');
  }
  if (cents > maxAmountCents) {
    throw new ValidationError('Valor excede o limite permitido');
  }
  return cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}
