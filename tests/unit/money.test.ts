import { ValidationError } from '../../src/domain/errors';
import { maxAmountCents, fromCents, toCents } from '../../src/domain/money';

describe('toCents', () => {
  it.each([
    [10, 1000],
    [10.5, 1050],
    [0.01, 1],
    [0.1 + 0.2, 30],
    [1234.56, 123456],
  ])('converte %p para %p centavos', (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });

  it.each([['10'], [null], [undefined], [NaN], [Infinity], [{}]])('rejeita valor não numérico %p', (input) => {
    expect(() => toCents(input)).toThrow(new ValidationError('Valor monetário deve ser um número'));
  });

  it('rejeita mais de 2 casas decimais', () => {
    expect(() => toCents(10.123)).toThrow('no máximo 2 casas decimais');
  });

  it('rejeita zero por padrão', () => {
    expect(() => toCents(0)).toThrow('Valor deve ser maior que zero');
  });

  it('aceita zero quando allowZero=true', () => {
    expect(toCents(0, { allowZero: true })).toBe(0);
  });

  it('rejeita negativos', () => {
    expect(() => toCents(-1)).toThrow('Valor deve ser maior que zero');
    expect(() => toCents(-1, { allowZero: true })).toThrow('Valor não pode ser negativo');
  });

  it('rejeita valores acima do limite', () => {
    expect(toCents(maxAmountCents / 100)).toBe(maxAmountCents);
    expect(() => toCents(maxAmountCents / 100 + 0.01)).toThrow('excede o limite');
  });
});

describe('fromCents', () => {
  it('converte centavos para decimal', () => {
    expect(fromCents(1050)).toBe(10.5);
    expect(fromCents(0)).toBe(0);
  });
});
