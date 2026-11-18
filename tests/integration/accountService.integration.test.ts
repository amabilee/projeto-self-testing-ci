import { AccountNotFoundError, CustomerValidationError, ValidationError } from '../../src/domain/errors';
import { CustomerValidationStub, rejectingCustomerValidation } from '../doubles';
import { buildTestContext } from './helpers';

describe('AccountService (integração com SQLite em memória + Stub de validação cadastral)', () => {
  it('cria conta quando o Stub aprova o cadastro e permite consultá-la', async () => {
    const ctx = buildTestContext();
    const created = await ctx.accountService.create({
      ownerName: 'Ana Souza',
      document: '529.982.247-25',
      initialBalance: 250,
    });

    expect(created).toEqual({
      id: 'id-1',
      ownerName: 'Ana Souza',
      document: '52998224725',
      balanceCents: 25_000,
      createdAt: '2026-01-15T12:00:00.000Z',
    });
    expect(ctx.accountService.getById(created.id)).toEqual(created);
  });

  it('recusa a abertura quando o Stub retorna cadastro reprovado (com motivo)', async () => {
    const ctx = buildTestContext({ customerValidation: rejectingCustomerValidation('CPF irregular') });
    await expect(ctx.accountService.create({ ownerName: 'Ana', document: '52998224725' })).rejects.toThrow(
      new CustomerValidationError('CPF irregular'),
    );
  });

  it('usa mensagem padrão quando o Stub reprova sem motivo', async () => {
    const ctx = buildTestContext({ customerValidation: new CustomerValidationStub({ valid: false }) });
    await expect(ctx.accountService.create({ ownerName: 'Ana', document: '52998224725' })).rejects.toThrow(
      'Validação cadastral reprovada',
    );
  });

  it('não permite duas contas para o mesmo documento', async () => {
    const ctx = buildTestContext();
    await ctx.accountService.create({ ownerName: 'Ana', document: '52998224725' });
    await expect(ctx.accountService.create({ ownerName: 'Ana 2', document: '529.982.247-25' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('lança AccountNotFoundError para id inexistente', () => {
    const ctx = buildTestContext();
    expect(() => ctx.accountService.getById('inexistente')).toThrow(AccountNotFoundError);
  });

  it('o banco recusa saldo negativo (constraint CHECK)', async () => {
    const ctx = buildTestContext();
    const acc = await ctx.openAccount(1);
    expect(() => ctx.repos.accounts.updateBalance(acc.id, -1)).toThrow(/CHECK constraint/);
  });
});
