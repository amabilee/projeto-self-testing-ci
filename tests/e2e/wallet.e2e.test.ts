import http from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { Express } from 'express';
import { buildContainer, Container } from '../../src/container';
import { loadConfig } from '../../src/config';
import { createApp } from '../../src/http/app';
import { createLoggerSpy } from '../doubles';

describe('Wallet API — E2E', () => {
  let webhook: http.Server;
  let received: Array<{ type: string; data: Record<string, unknown> }>;
  let container: Container;
  let app: Express;

  beforeAll(async () => {
    webhook = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push(JSON.parse(body));
        res.writeHead(202).end();
      });
    });
    await new Promise<void>((resolve) => webhook.listen(0, resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => webhook.close(resolve));
  });

  beforeEach(() => {
    received = [];
    const { port } = webhook.address() as AddressInfo;
    container = buildContainer(
      loadConfig({ DATABASE_PATH: ':memory:', ANTIFRAUD_WEBHOOK_URL: `http://127.0.0.1:${port}/hook` }),
      { logger: createLoggerSpy() },
    );
    app = createApp(container);
  });

  afterEach(() => container.db.close());

  const createAccount = async (ownerName: string, document: string, initialBalance: number) => {
    const res = await request(app).post('/accounts').send({ ownerName, document, initialBalance }).expect(201);
    return res.body as { id: string; balance: number };
  };

  it('fluxo completo: registro de contas → transferências → extrato final', async () => {
    const alice = await createAccount('Alice Lima', '529.982.247-25', 500);
    const bob = await createAccount('Bob Costa', '168.995.350-09', 50);

    const t1 = await request(app)
      .post('/transfers')
      .set('Idempotency-Key', 'e2e-1')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 120.35, description: 'Pagamento' })
      .expect(201);
    expect(t1.headers['idempotent-replayed']).toBe('false');
    expect(t1.body).toMatchObject({ fromAccountId: alice.id, toAccountId: bob.id, amount: 120.35, description: 'Pagamento' });

    await request(app).post('/transfers').send({ fromAccountId: bob.id, toAccountId: alice.id, amount: 20 }).expect(201);

    const aliceNow = await request(app).get(`/accounts/${alice.id}`).expect(200);
    expect(aliceNow.body.balance).toBe(399.65);
    const bobNow = await request(app).get(`/accounts/${bob.id}`).expect(200);
    expect(bobNow.body.balance).toBe(150.35);

    const statement = await request(app).get(`/accounts/${alice.id}/statement`).expect(200);
    expect(statement.body).toMatchObject({
      accountId: alice.id,
      ownerName: 'Alice Lima',
      currentBalance: 399.65,
      totals: { credits: 20, debits: 120.35 },
      filter: { from: null, to: null, type: null },
    });
    expect(statement.body.transactions.map((t: { type: string; amount: number; balanceAfter: number }) => [t.type, t.amount, t.balanceAfter])).toEqual([
      ['debit', 120.35, 379.65],
      ['credit', 20, 399.65],
    ]);

    const credits = await request(app).get(`/accounts/${alice.id}/statement`).query({ type: 'credit' }).expect(200);
    expect(credits.body.transactions).toHaveLength(1);
    expect(credits.body.filter.type).toBe('credit');

    const future = await request(app).get(`/accounts/${alice.id}/statement`).query({ from: '2999-01-01' }).expect(200);
    expect(future.body.transactions).toHaveLength(0);

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({
      type: 'transfer.completed',
      data: expect.objectContaining({ transferId: t1.body.id, amountCents: 12035 }),
    });
  });

  it('repetição com a mesma Idempotency-Key retorna 200 sem novo débito', async () => {
    const alice = await createAccount('Alice Lima', '52998224725', 100);
    const bob = await createAccount('Bob Costa', '16899535009', 0);
    const send = () =>
      request(app).post('/transfers').set('Idempotency-Key', 'k-1').send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 10 });

    const first = await send().expect(201);
    const second = await send().expect(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);

    const res = await request(app).get(`/accounts/${alice.id}`);
    expect(res.body.balance).toBe(90);

    await request(app)
      .post('/transfers')
      .set('Idempotency-Key', 'k-1')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 99 })
      .expect(409)
      .expect((r) => expect(r.body.error.code).toBe('IDEMPOTENCY_CONFLICT'));
  });

  it('50 transferências HTTP simultâneas mantêm a consistência dos saldos', async () => {
    const alice = await createAccount('Alice Lima', '52998224725', 100);
    const bob = await createAccount('Bob Costa', '16899535009', 0);

    const responses = await Promise.all(
      Array.from({ length: 50 }, () =>
        request(app).post('/transfers').send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 4 }),
      ),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(25);
    expect(statuses.filter((s) => s === 422)).toHaveLength(25);

    expect((await request(app).get(`/accounts/${alice.id}`)).body.balance).toBe(0);
    expect((await request(app).get(`/accounts/${bob.id}`)).body.balance).toBe(100);
  });

  describe('respostas de erro', () => {
    it('400 para dados de conta inválidos', async () => {
      const res = await request(app).post('/accounts').send({ ownerName: 'A', document: '1' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('422 para documento reprovado na validação cadastral', async () => {
      const res = await request(app).post('/accounts').send({ ownerName: 'Fulano', document: '11111111111' }).expect(422);
      expect(res.body.error.code).toBe('CUSTOMER_VALIDATION_FAILED');
    });

    it('400 para JSON malformado', async () => {
      const res = await request(app).post('/transfers').set('Content-Type', 'application/json').send('{"amount":').expect(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });

    it('400 para corpo vazio', async () => {
      await request(app).post('/transfers').expect(400);
      await request(app).post('/accounts').expect(400);
    });

    it('404 para conta inexistente', async () => {
      await request(app).get('/accounts/nao-existe').expect(404);
      await request(app).get('/accounts/nao-existe/statement').expect(404);
    });

    it('400 para filtro de extrato inválido', async () => {
      const alice = await createAccount('Alice Lima', '52998224725', 1);
      await request(app).get(`/accounts/${alice.id}/statement`).query({ type: 'pix' }).expect(400);
    });

    it('422 para saldo insuficiente', async () => {
      const alice = await createAccount('Alice Lima', '52998224725', 1);
      const bob = await createAccount('Bob Costa', '16899535009', 0);
      const res = await request(app).post('/transfers').send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 2 }).expect(422);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('404 para rota desconhecida e /health responde ok', async () => {
      await request(app).get('/nada').expect(404);
      await request(app).get('/health').expect(200, { status: 'ok' });
    });

    it('500 para erro inesperado, sem vazar detalhes', async () => {
      container.db.close();
      const res = await request(app).get('/accounts/qualquer').expect(500);
      expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' } });
      expect(container.logger.error).toHaveBeenCalled();
    });
  });
});
