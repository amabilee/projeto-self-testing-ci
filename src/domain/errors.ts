export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

export class AccountNotFoundError extends DomainError {
  readonly code = 'ACCOUNT_NOT_FOUND';
  constructor(accountId: string) {
    super(`Conta ${accountId} não encontrada`);
  }
}

export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';
  constructor() {
    super('Saldo insuficiente para realizar a transferência');
  }
}

export class SameAccountTransferError extends DomainError {
  readonly code = 'SAME_ACCOUNT_TRANSFER';
  constructor() {
    super('Conta de origem e destino devem ser diferentes');
  }
}

export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor() {
    super('Idempotency-Key já utilizada com um payload diferente');
  }
}

export class CustomerValidationError extends DomainError {
  readonly code = 'CUSTOMER_VALIDATION_FAILED';
}
