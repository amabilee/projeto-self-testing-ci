import { AntiFraudGateway } from '../../src/gateways/antiFraudGateway';
import {
  CustomerValidationProvider,
  CustomerValidationResult,
} from '../../src/gateways/customerValidationProvider';
import { Clock, IdGenerator, Logger } from '../../src/services/types';

export class CustomerValidationStub implements CustomerValidationProvider {
  constructor(private readonly fixedResult: CustomerValidationResult) {}
  async validate(_document: string): Promise<CustomerValidationResult> {
    return this.fixedResult;
  }
}

export const approvingCustomerValidation = () => new CustomerValidationStub({ valid: true });
export const rejectingCustomerValidation = (reason = 'CPF com restrição cadastral') =>
  new CustomerValidationStub({ valid: false, reason });

export function createAntiFraudMock(): jest.Mocked<AntiFraudGateway> {
  return { notifyTransfer: jest.fn().mockResolvedValue(undefined) };
}

export function fixedClock(initialIso = '2026-01-15T12:00:00.000Z'): Clock & { set(iso: string): void } {
  let current = new Date(initialIso);
  const clock = (() => new Date(current)) as Clock & { set(iso: string): void };
  clock.set = (iso: string) => {
    current = new Date(iso);
  };
  return clock;
}

export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function createLoggerSpy(): jest.Mocked<Logger> {
  return { info: jest.fn(), error: jest.fn() };
}
