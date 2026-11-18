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
