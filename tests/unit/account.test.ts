import { validateNewAccount } from '../../src/domain/account';
import { ValidationError } from '../../src/domain/errors';

describe('validateNewAccount', () => {
  it('normaliza nome e documento e converte saldo inicial para centavos', () => {
    expect(
      validateNewAccount({ ownerName: '  Maria Silva ', document: '123.456.789-01', initialBalance: 150.75 }),
    ).toEqual({ ownerName: 'Maria Silva', document: '12345678901', initialBalanceCents: 15_075 });
  });

  it('aceita CNPJ com 14 dígitos', () => {
    expect(validateNewAccount({ ownerName: 'Empresa X', document: '12.345.678/0001-90' }).document).toBe(
      '12345678000190',
    );
  });

  it('assume saldo inicial zero quando omitido', () => {
    expect(validateNewAccount({ ownerName: 'João', document: '12345678901' }).initialBalanceCents).toBe(0);
  });

  it.each([[undefined], [''], ['ab'], [123]])('rejeita ownerName inválido: %p', (ownerName) => {
    expect(() => validateNewAccount({ ownerName, document: '12345678901' })).toThrow(ValidationError);
  });

  it('rejeita documento ausente', () => {
    expect(() => validateNewAccount({ ownerName: 'João', document: undefined })).toThrow('document é obrigatório');
  });

  it.each(['123', '1234567890123', '123456789012345'])('rejeita documento com tamanho inválido: %p', (document) => {
    expect(() => validateNewAccount({ ownerName: 'João', document })).toThrow('CPF (11 dígitos) ou CNPJ');
  });

  it('rejeita saldo inicial negativo', () => {
    expect(() => validateNewAccount({ ownerName: 'João', document: '12345678901', initialBalance: -1 })).toThrow(
      ValidationError,
    );
  });
});
