import express, { Express } from 'express';
import { AccountController } from '../controllers/accountController';
import { TransferController } from '../controllers/transferController';
import { Container } from '../container';
import { createErrorHandler } from './errorHandler';

export function createApp(container: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const accounts = new AccountController(container.accountService, container.statementService);
  const transfers = new TransferController(container.transferService);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.post('/accounts', accounts.create);
  app.get('/accounts/:id', accounts.getById);
  app.get('/accounts/:id/statement', accounts.statement);
  app.post('/transfers', transfers.create);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
  });
  app.use(createErrorHandler(container.logger));
  return app;
}
