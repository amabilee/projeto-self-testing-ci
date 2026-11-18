# Wallet API — Projeto Self-Testing CI

API REST de carteira digital (contas, transferências com idempotência e controle de concorrência, extrato filtrado e notificação anti-fraude via webhook).

**Stack:** Node.js 22+ · TypeScript · Express 5 · SQLite (better-sqlite3) · Jest + ts-jest + Supertest · ESLint · K6 · GitHub Actions

## Como rodar

```bash
npm ci
cp .env.example .env
npm run antifraud:mock   # (terminal 1) gateway anti-fraude fictício na porta 4000
npm run dev              # (terminal 2) API na porta 3000
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run lint` / `npm run typecheck` | Análise estática (ESLint + tsc) |
| `npm run test:unit` | Testes unitários (domínio puro) |
| `npm run test:integration` | Integração (SQLite em memória, Mocks e Stubs) |
| `npm run test:e2e` | Ponta a ponta via HTTP real (Supertest) |
| `npm run test:coverage` | Todas as suítes + **coverage gate** (falha abaixo do limite) |
| `npm run build && npm start` | Build e execução de produção |
| `npm run load:test` | Teste de carga K6 (API precisa estar rodando) |

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/accounts` | Cria conta `{ ownerName, document, initialBalance }` |
| `GET` | `/accounts/:id` | Consulta conta e saldo |
| `POST` | `/transfers` | Transfere `{ fromAccountId, toAccountId, amount, description? }` — header opcional `Idempotency-Key` |
| `GET` | `/accounts/:id/statement?from=YYYY-MM-DD&to=YYYY-MM-DD&type=debit\|credit` | Extrato filtrado |
| `GET` | `/health` | Health check |

Exemplo:

```bash
curl -X POST localhost:3000/accounts -H 'Content-Type: application/json' \
  -d '{"ownerName":"Alice","document":"52998224725","initialBalance":500}'

curl -X POST localhost:3000/transfers -H 'Content-Type: application/json' -H 'Idempotency-Key: pedido-123' \
  -d '{"fromAccountId":"<id-alice>","toAccountId":"<id-bob>","amount":120.35}'
```

Documentação técnica completa em [RELATORIO_TECNICO.md](RELATORIO_TECNICO.md).
