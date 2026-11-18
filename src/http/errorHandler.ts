import { NextFunction, Request, Response } from 'express';
import {
  AccountNotFoundError,
  CustomerValidationError,
  DomainError,
  IdempotencyConflictError,
  InsufficientFundsError,
} from '../domain/errors';
import { Logger } from '../services/types';

export function statusFor(error: DomainError): number {
  if (error instanceof AccountNotFoundError) return 404;
  if (error instanceof IdempotencyConflictError) return 409;
  if (error instanceof InsufficientFundsError || error instanceof CustomerValidationError) return 422;
  return 400;
}

export function createErrorHandler(logger: Logger) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof DomainError) {
      res.status(statusFor(error)).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Corpo da requisição não é um JSON válido' } });
      return;
    }
    logger.error('Erro inesperado', { error: error instanceof Error ? error.stack : String(error) });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' } });
  };
}
