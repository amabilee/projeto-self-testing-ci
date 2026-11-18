import { Request, Response } from 'express';
import { AccountService } from '../services/accountService';
import { StatementService } from '../services/statementService';
import { presentAccount, presentStatement } from './presenters';

export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly statements: StatementService,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const account = await this.accounts.create({
      ownerName: body.ownerName,
      document: body.document,
      initialBalance: body.initialBalance,
    });
    res.status(201).location(`/accounts/${account.id}`).json(presentAccount(account));
  };

  getById = (req: Request<{ id: string }>, res: Response): void => {
    res.json(presentAccount(this.accounts.getById(req.params.id)));
  };

  statement = (req: Request<{ id: string }>, res: Response): void => {
    const statement = this.statements.getStatement(req.params.id, {
      from: req.query.from,
      to: req.query.to,
      type: req.query.type,
    });
    res.json(presentStatement(statement));
  };
}
