import { ValidationError } from '../../src/domain/errors';
import { Transaction, parseStatementFilter, summarizeTransactions } from '../../src/domain/transaction';

describe('parseStatementFilter', () => {
  it('retorna filtro vazio quando nada é informado', () => {
    expect(parseStatementFilter({})).toEqual({ from: undefined, to: undefined, type: undefined });
  });

  it('ignora parâmetros vazios', () => {
    expect(parseStatementFilter({ from: '', to: '', type: '' })).toEqual({
      from: undefined,
      to: undefined,
      type: undefined,
    });
  });

  it('expande datas sem horário para o dia inteiro', () => {
    expect(parseStatementFilter({ from: '2026-01-10', to: '2026-01-12' })).toEqual({
      from: '2026-01-10T00:00:00.000Z',
      to: '2026-01-12T23:59:59.999Z',
      type: undefined,
    });
  });

  it('aceita datas com horário', () => {
    expect(parseStatementFilter({ from: '2026-01-10T08:30:00Z' }).from).toBe('2026-01-10T08:30:00.000Z');
  });

  it.each(['debit', 'DEBIT', 'Credit'])('normaliza o tipo %p', (type) => {
    expect(parseStatementFilter({ type }).type).toBe(String(type).toUpperCase());
  });

  it('rejeita tipo desconhecido', () => {
    expect(() => parseStatementFilter({ type: 'pix' })).toThrow('type deve ser "debit" ou "credit"');
  });

  it.each([['not-a-date'], [['2026-01-01']], ['2026-13-45']])('rejeita data inválida %p', (from) => {
    expect(() => parseStatementFilter({ from })).toThrow(ValidationError);
  });

  it('rejeita período invertido', () => {
    expect(() => parseStatementFilter({ from: '2026-02-01', to: '2026-01-01' })).toThrow('from deve ser anterior');
  });
});

describe('summarizeTransactions', () => {
  const tx = (type: 'DEBIT' | 'CREDIT', amountCents: number): Transaction => ({
    id: `${type}-${amountCents}`,
    accountId: 'a',
    transferId: 't',
    type,
    amountCents,
    balanceAfterCents: 0,
    counterpartyAccountId: 'b',
    description: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('soma créditos e débitos separadamente', () => {
    expect(summarizeTransactions([tx('CREDIT', 1000), tx('DEBIT', 300), tx('CREDIT', 50)])).toEqual({
      creditsCents: 1050,
      debitsCents: 300,
    });
  });

  it('retorna zeros para lista vazia', () => {
    expect(summarizeTransactions([])).toEqual({ creditsCents: 0, debitsCents: 0 });
  });
});
