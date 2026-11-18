import { Account, NewAccountInput, validateNewAccount } from '../domain/account';
import { AccountNotFoundError, CustomerValidationError, ValidationError } from '../domain/errors';
import { CustomerValidationProvider } from '../gateways/customerValidationProvider';
import { AccountRepository } from '../repositories/accountRepository';
import { Clock, IdGenerator } from './types';

export class AccountService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly customerValidation: CustomerValidationProvider,
    private readonly generateId: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async create(input: NewAccountInput): Promise<Account> {
    const data = validateNewAccount(input);

    const validation = await this.customerValidation.validate(data.document);
    if (!validation.valid) {
      throw new CustomerValidationError(validation.reason ?? 'Validação cadastral reprovada');
    }
    if (this.accounts.existsByDocument(data.document)) {
      throw new ValidationError('Já existe uma conta para este documento');
    }

    const account: Account = {
      id: this.generateId(),
      ownerName: data.ownerName,
      document: data.document,
      balanceCents: data.initialBalanceCents,
      createdAt: this.clock().toISOString(),
    };
    this.accounts.create(account);
    return account;
  }

  getById(id: string): Account {
    const account = this.accounts.findById(id);
    if (!account) throw new AccountNotFoundError(id);
    return account;
  }
}
