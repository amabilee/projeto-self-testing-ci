import { loadConfig } from '../../src/config';
import {
  AccountNotFoundError,
  CustomerValidationError,
  IdempotencyConflictError,
  InsufficientFundsError,
  SameAccountTransferError,
  ValidationError,
} from '../../src/domain/errors';
import { LocalCustomerValidationProvider } from '../../src/gateways/customerValidationProvider';
import { statusFor } from '../../src/http/errorHandler';

describe('statusFor (mapeamento erro de domínio → HTTP)', () => {
  it.each([
    [new AccountNotFoundError('x'), 404],
    [new IdempotencyConflictError(), 409],
    [new InsufficientFundsError(), 422],
    [new CustomerValidationError('x'), 422],
    [new SameAccountTransferError(), 400],
    [new ValidationError('x'), 400],
  ])('%s → %p', (error, status) => {
    expect(statusFor(error)).toBe(status);
  });
});

describe('loadConfig', () => {
  it('usa valores padrão', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      databasePath: ':memory:',
      antiFraudWebhookUrl: 'http://localhost:4000/webhooks/antifraud',
      antiFraudTimeoutMs: 2000,
    });
  });

  it('lê variáveis de ambiente', () => {
    const config = loadConfig({
      PORT: '8080',
      DATABASE_PATH: './x.db',
      ANTIFRAUD_WEBHOOK_URL: 'http://af',
      ANTIFRAUD_TIMEOUT_MS: '500',
    });
    expect(config).toEqual({ port: 8080, databasePath: './x.db', antiFraudWebhookUrl: 'http://af', antiFraudTimeoutMs: 500 });
  });
});

describe('LocalCustomerValidationProvider', () => {
  const provider = new LocalCustomerValidationProvider();

  it('aprova documento comum', async () => {
    await expect(provider.validate('12345678901')).resolves.toEqual({ valid: true });
  });

  it('reprova documento com dígitos repetidos', async () => {
    await expect(provider.validate('11111111111')).resolves.toEqual({ valid: false, reason: 'Documento inválido' });
  });
});
