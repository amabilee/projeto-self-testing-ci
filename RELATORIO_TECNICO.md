# Relatório Técnico — Wallet API

- **Projeto:** API de Microsserviço Financeiro com Automação CI, Suíte de Self-Testing Multinível e Estratégia de Branching
- **Equipe:** Amábile Zucchetti - 2310438
- **Repositório:** https://github.com/amabilee/projeto-self-testing-ci

---

## 1. Visão geral

A Wallet API é um microsserviço REST de carteira digital e conciliação bancária. Ela permite abrir contas com saldo inicial, transferir valores entre contas de forma segura (concorrência, saldo insuficiente, idempotência), consultar extrato filtrado e notificar um serviço externo anti-fraude via webhook a cada transferência concluída.

| Item | Escolha | Justificativa |
|---|---|---|
| Linguagem | TypeScript (Node.js 22) | Tipagem estática reduz erros em regras financeiras |
| Framework HTTP | Express 5 | Simples, maduro, trata erros de handlers `async` nativamente |
| Banco de dados | SQLite (`better-sqlite3`) | Transações síncronas e atômicas; modo `:memory:` para testes |
| Testes | Jest + ts-jest + Supertest | Framework aceito no enunciado; Supertest para HTTP real |
| Cobertura | Istanbul (via `jest --coverage`) | Gate automático por `coverageThreshold` |
| Lint | ESLint + typescript-eslint + `tsc --noEmit` | Análise estática no CI |
| Carga | K6 | Script versionado, métricas e thresholds nativos |
| CI | GitHub Actions | Exigido pelo enunciado |

---

## 2. Especificação de Requisitos (SRS)

### 2.1 Requisitos Funcionais

| ID | Requisito | Critério de aceitação | Evidência (testes) |
|---|---|---|---|
| **RF01** | Criar conta digital com titular, documento (CPF/CNPJ) e saldo inicial ≥ 0 | `POST /accounts` → 201 com `id` e `balance`; dados inválidos → 400 | `unit/account.test.ts`, `integration/accountService…`, E2E |
| **RF02** | Validar cadastro do cliente em serviço externo antes da abertura | Cadastro reprovado → 422 `CUSTOMER_VALIDATION_FAILED` | `integration/accountService…` (Stub) |
| **RF03** | Impedir duas contas com o mesmo documento | Segunda abertura → 400 | `integration/accountService…` |
| **RF04** | Consultar conta e saldo | `GET /accounts/:id` → 200; inexistente → 404 | E2E |
| **RF05** | Transferir saldo entre contas | Débito na origem, crédito no destino, 2 lançamentos no extrato → 201 | `unit/transfer.test.ts`, `integration/transferService…`, E2E |
| **RF06** | Rejeitar transferência com saldo insuficiente | 422 `INSUFFICIENT_FUNDS`, nenhum saldo alterado | unit, integração, E2E |
| **RF07** | Rejeitar transferência para a mesma conta, valor ≤ 0 ou com mais de 2 casas decimais | 400 | `unit/money.test.ts`, `unit/transfer.test.ts` |
| **RF08** | Garantir idempotência via header `Idempotency-Key` | Mesma chave + mesmo payload → 200 com a transferência original (`Idempotent-Replayed: true`), sem novo débito; mesma chave + payload diferente → 409 | integração, E2E |
| **RF09** | Consultar extrato com filtros por período (`from`, `to`) e tipo (`debit`/`credit`) | Lançamentos em ordem cronológica + totais de créditos e débitos | `unit/statement.test.ts`, `integration/statementService…`, E2E |
| **RF10** | Notificar o serviço anti-fraude (webhook) a cada transferência concluída | 1 POST por transferência efetivada; nenhuma notificação em falha ou repetição idempotente | `integration/transferService…` (Mock), `integration/httpAntiFraudGateway…`, E2E |

### 2.2 Requisitos Não Funcionais

| ID | Categoria | Requisito | Como é atendido / verificado |
|---|---|---|---|
| **RNF01** | Consistência | Saldo nunca pode ficar negativo nem haver criação/perda de dinheiro sob concorrência | Transação `BEGIN IMMEDIATE`, `CHECK (balance_cents >= 0)`, testes com 50 transferências simultâneas, verificação no `teardown` do K6 |
| **RNF02** | Precisão | Valores monetários sem erro de ponto flutuante | Armazenamento em centavos inteiros (`toCents`) |
| **RNF03** | Desempenho | p95 < 500 ms e taxa de erro < 1% com 50 requisições simultâneas em `/transfers` | Thresholds do K6 (seção 6) |
| **RNF04** | Resiliência | Falha/timeout do anti-fraude não pode desfazer nem travar a transferência | Notificação *best effort* pós-commit com timeout (`ANTIFRAUD_TIMEOUT_MS`) + log de erro |
| **RNF05** | Qualidade | Cobertura ≥ 80% de branches e ≥ 85% de linhas/statements | `coverageThreshold` do Jest, verificado no CI |
| **RNF06** | Manutenibilidade | Arquitetura em camadas com dependências injetáveis | Ver seção 3 |
| **RNF07** | Segurança | Erros internos não expõem stack trace; payload limitado a 100 kb; header `x-powered-by` desabilitado | `errorHandler.ts`, E2E "500 sem vazar detalhes" |
| **RNF08** | Configurabilidade | Configuração via variáveis de ambiente | `.env.example`, `src/config.ts` |
| **RNF09** | Observabilidade | Logs estruturados em JSON | `consoleLogger` em `src/container.ts` |

### 2.3 Regras de negócio

- **RN01:** valores trafegam na API em reais (ex: `120.35`) e são persistidos em centavos inteiros.
- **RN02:** limite por operação: R$ 1.000.000.000,00.
- **RN03:** cada transferência gera exatamente dois lançamentos: `DEBIT` na origem e `CREDIT` no destino, ambos com o saldo resultante (`balanceAfter`).
- **RN04:** datas de filtro sem horário (`YYYY-MM-DD`) cobrem o dia inteiro (00:00:00.000 a 23:59:59.999 UTC).

---

## 3. Arquitetura

### 3.1 Camadas

```
HTTP (Express)                src/http/app.ts, errorHandler.ts
   │
Controllers                   src/controllers/*  ← converte HTTP ⇄ casos de uso, formata resposta
   │
Services (casos de uso)       src/services/*     ← orquestra transação, idempotência, notificação
   │            │
Domain          Gateways      src/domain/*       ← regras PURAS (sem I/O): toCents, calculateTransfer, filtros
(puro)          (portas)      src/gateways/*     ← interfaces + adapters externos (anti-fraude, validação cadastral)
   │
Repositories                  src/repositories/* ← SQL (SQLite)
```

A composição das dependências fica em `src/container.ts` (`buildContainer`), que aceita *overrides*. É por esse ponto de injeção que os testes trocam banco, relógio, gerador de IDs e serviços externos por Test Doubles, sem alterar código de produção.

### 3.2 Fluxo de uma transferência

1. O controller extrai o corpo e o header `Idempotency-Key`.
2. O service valida o payload e converte o valor para centavos.
3. Abre uma **transação `BEGIN IMMEDIATE`** (lock de escrita) e, dentro dela:
   1. Se houver chave de idempotência já usada: retorna a transferência original (ou 409 se o payload mudou).
   2. Carrega as contas e aplica `calculateTransfer` (regra pura).
   3. Insere a transferência, atualiza os saldos e insere os 2 lançamentos.
4. Executa o **commit**.
5. Notifica o anti-fraude fora da transação. Uma falha nesse passo só gera log.

### 3.3 Tratamento de concorrência

- O `better-sqlite3` executa transações de forma **síncrona**. No event loop do Node, nenhuma outra requisição consegue se intercalar entre a leitura do saldo e a escrita.
- `BEGIN IMMEDIATE` adquire o lock de escrita no início, o que protege também contra múltiplos processos acessando o mesmo arquivo.
- Há defesa em profundidade no banco: `CHECK (balance_cents >= 0)` e `UNIQUE (idempotency_key)`.
- A chamada de rede ao anti-fraude fica **fora** da transação, para não manter lock durante I/O lento.

### 3.4 Modelo de dados

| Tabela | Campos principais |
|---|---|
| `accounts` | `id`, `owner_name`, `document` (UNIQUE), `balance_cents` (CHECK ≥ 0), `created_at` |
| `transfers` | `id`, `from_account_id`, `to_account_id`, `amount_cents`, `idempotency_key` (UNIQUE), `request_hash`, `created_at` |
| `transactions` | `id`, `account_id`, `transfer_id`, `type` (DEBIT/CREDIT), `amount_cents`, `balance_after_cents`, `counterparty_account_id`, `created_at` |

### 3.5 Códigos HTTP

| Situação | Status | `error.code` |
|---|---|---|
| Criado | 201 | — |
| Repetição idempotente | 200 | — (`Idempotent-Replayed: true`) |
| Validação / JSON inválido / mesma conta | 400 | `VALIDATION_ERROR`, `INVALID_JSON`, `SAME_ACCOUNT_TRANSFER` |
| Conta inexistente | 404 | `ACCOUNT_NOT_FOUND` |
| Idempotency-Key com payload diferente | 409 | `IDEMPOTENCY_CONFLICT` |
| Saldo insuficiente / cadastro reprovado | 422 | `INSUFFICIENT_FUNDS`, `CUSTOMER_VALIDATION_FAILED` |
| Erro inesperado | 500 | `INTERNAL_ERROR` |
