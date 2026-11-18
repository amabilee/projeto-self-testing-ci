import { Request, Response } from 'express';
import { TransferService } from '../services/transferService';
import { presentTransfer } from './presenters';

export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const body = req.body ?? {};
    const { transfer, replayed } = await this.transfers.transfer({
      fromAccountId: body.fromAccountId,
      toAccountId: body.toAccountId,
      amount: body.amount,
      description: body.description,
      idempotencyKey: req.header('Idempotency-Key'),
    });
    res
      .status(replayed ? 200 : 201)
      .set('Idempotent-Replayed', String(replayed))
      .json(presentTransfer(transfer));
  };
}
