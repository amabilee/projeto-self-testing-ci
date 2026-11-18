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

---

## 4. Estratégia de testes

### 4.1 Pirâmide de testes

| Nível | Pasta | Qtde | O que cobre | Dependências |
|---|---|---|---|---|
| **Unitário** | `tests/unit` | 62 | Regras puras: conversão monetária, cálculo de transferência, validação de conta, filtros e totais do extrato, mapeamento de erros | Nenhuma (sem I/O) |
| **Integração** | `tests/integration` | 36 | Services + repositories reais sobre **SQLite `:memory:`**, idempotência, concorrência, adapter HTTP do anti-fraude | Mocks e Stubs para serviços externos |
| **E2E** | `tests/e2e` | 12 | Fluxo completo via **requisições HTTP reais** (Supertest): cadastro → transferência → extrato, mais respostas de erro | App completa, SQLite em memória, webhook HTTP local real |

A base da pirâmide é mais larga (testes rápidos e isolados) e o topo é mais estreito (testes mais lentos e de maior escopo).

### 4.2 TDD (Red-Green-Refactor)

As regras de domínio (`money.ts`, `transfer.ts`, `account.ts`, `transaction.ts`) foram desenvolvidas em ciclos TDD, registrados no histórico de commits:

1. **RED:** `test(domain): ...` com o teste escrito antes da implementação. O CI falha nesse commit.
2. **GREEN:** `feat(domain): ...` com a implementação mínima que faz o teste passar.
3. **REFACTOR:** `refactor(domain): ...` com melhorias sem mudar o comportamento. Os testes continuam verdes.

Evidências no histórico (cada link de CI abre a execução do GitHub Actions daquele commit):

| Ciclo | PR | RED (teste falhando) | GREEN (implementação) | REFACTOR |
|---|---|---|---|---|
| Conversão monetária (`money.ts`) | [#2](https://github.com/amabilee/projeto-self-testing-ci/pull/2) | [`5977566`](https://github.com/amabilee/projeto-self-testing-ci/commit/5977566) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44207254044) | [`b050639`](https://github.com/amabilee/projeto-self-testing-ci/commit/b050639) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44207858992) | [`51568fe`](https://github.com/amabilee/projeto-self-testing-ci/commit/51568fe) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44208083887) |
| Validação de conta (`account.ts`) | [#3](https://github.com/amabilee/projeto-self-testing-ci/pull/3) | [`5d6e3c3`](https://github.com/amabilee/projeto-self-testing-ci/commit/5d6e3c3) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44208448962) | [`f0d8128`](https://github.com/amabilee/projeto-self-testing-ci/commit/f0d8128) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44208678474) | — |
| Cálculo de transferência (`transfer.ts`) | [#4](https://github.com/amabilee/projeto-self-testing-ci/pull/4) | [`bedb325`](https://github.com/amabilee/projeto-self-testing-ci/commit/bedb325) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44209059379) | [`7b7f22c`](https://github.com/amabilee/projeto-self-testing-ci/commit/7b7f22c) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44209289147) | [`fe27b0e`](https://github.com/amabilee/projeto-self-testing-ci/commit/fe27b0e) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44209490536) |
| Filtros do extrato (`transaction.ts`) | [#5](https://github.com/amabilee/projeto-self-testing-ci/pull/5) | [`87869db`](https://github.com/amabilee/projeto-self-testing-ci/commit/87869db) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44209737404) | [`2868bdc`](https://github.com/amabilee/projeto-self-testing-ci/commit/2868bdc) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44209936367) | [`8b6f1c0`](https://github.com/amabilee/projeto-self-testing-ci/commit/8b6f1c0) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44210165071) |
| Serviços + integração (Mocks/Stubs/SQLite) | [#6](https://github.com/amabilee/projeto-self-testing-ci/pull/6) | [`a0747ed`](https://github.com/amabilee/projeto-self-testing-ci/commit/a0747ed) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44210395980) | [`18ab5e0`](https://github.com/amabilee/projeto-self-testing-ci/commit/18ab5e0) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44210603987) | — |
| API HTTP + E2E | [#7](https://github.com/amabilee/projeto-self-testing-ci/pull/7) | [`db84f43`](https://github.com/amabilee/projeto-self-testing-ci/commit/db84f43) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44210939834) | [`07e2775`](https://github.com/amabilee/projeto-self-testing-ci/commit/07e2775) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44211144051) | — |
| Hotfix 1.0.1 (JSON malformado) | [#12](https://github.com/amabilee/projeto-self-testing-ci/pull/12) | [`8443174`](https://github.com/amabilee/projeto-self-testing-ci/commit/8443174) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44213066903) | [`52526db`](https://github.com/amabilee/projeto-self-testing-ci/commit/52526db) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44213313991) | — |
| Hotfix 1.0.2 (Idempotency-Key) | [#14](https://github.com/amabilee/projeto-self-testing-ci/pull/14) | [`cd39d1a`](https://github.com/amabilee/projeto-self-testing-ci/commit/cd39d1a) · [CI 🔴](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44213816972) | [`177c834`](https://github.com/amabilee/projeto-self-testing-ci/commit/177c834) · [CI 🟢](https://github.com/amabilee/projeto-self-testing-ci/actions/runs/44213940937) | — |

Todas as execuções com falha correspondem exatamente aos commits RED: [execuções com falha](https://github.com/amabilee/projeto-self-testing-ci/actions?query=is%3Afailure).

### 4.3 Test Doubles: Mock × Stub

Os doubles ficam em `tests/doubles/index.ts`.

| | **Mock** | **Stub** |
|---|---|---|
| Finalidade | Verificar **interações de saída** (o sistema chamou o colaborador corretamente?) | Fornecer **dados de entrada** controlados (respostas fixas) |
| Asserções | Feitas **sobre o double** (`toHaveBeenCalledTimes`, `toHaveBeenCalledWith`) | Feitas sobre o **resultado do sistema**, nunca sobre o stub |
| Uso no projeto | `createAntiFraudMock()` (`jest.fn`) para o gateway anti-fraude; `fetch` mockado no `HttpAntiFraudGateway` | `CustomerValidationStub` (validação cadastral aprovada/reprovada), `fixedClock()` (data/hora fixa), `sequentialIds()` (IDs determinísticos) |

Exemplos de verificação com o Mock (`tests/integration/transferService.integration.test.ts`):

- notifica **exatamente 1 vez** com `{ transferId, fromAccountId, toAccountId, amountCents, occurredAt }`;
- **não** notifica quando há saldo insuficiente;
- **não** notifica novamente em repetições idempotentes (3 chamadas resultam em 1 notificação);
- 50 transferências concorrentes, das quais 40 são bem-sucedidas, resultam em exatamente **40 notificações**;
- se o gateway falhar, a transferência é mantida e o erro é logado com o `transferId`.

Exemplos com o Stub (`tests/integration/accountService.integration.test.ts`): o mesmo código de produção é exercitado com o stub configurado para **aprovar** e para **reprovar** o cadastro, e o teste valida a reação do serviço em cada caso.

### 4.4 Cobertura de código

Medida com Istanbul (`jest --coverage`). O arquivo `src/server.ts`, que é apenas o bootstrap do processo, fica excluído.

| Métrica | Mínimo exigido | Obtido |
|---|---|---|
| Linhas | 85% | **99,29%** |
| Statements | 85% | **99,35%** |
| Branches | 80% | **97,74%** |
| Funções | 85% (definido pela equipe) | **96,77%** |

---

## 5. Pipeline de Integração Contínua

Arquivo: `.github/workflows/ci.yml`

| Job | Etapas | Bloqueia o merge? |
|---|---|---|
| `lint` | `npm ci` → ESLint → `tsc --noEmit` | Sim |
| `test` (em paralelo ao `lint`) | Testes unitários → integração → E2E → **coverage gate** → resumo de cobertura no job → upload dos artefatos `coverage-report` (HTML/lcov/cobertura) e `test-logs` (logs + JUnit XML) | Sim |
| `load-test` (depende de `lint` e `test`) | Build → sobe o anti-fraude fictício e a API → K6 com 50 VUs → upload do artefato `load-test-report`. Roda em `main`, `release/*`, `hotfix/*`, PRs para `main` ou manualmente (`workflow_dispatch`) | Sim, nos PRs para `main` (thresholds do K6) |

- **Gatilhos:** `push` em `main`, `develop`, `feature/**`, `release/**`, `hotfix/**`, `pull_request` para `main`/`develop` e execução manual (`workflow_dispatch`).
- **Merges via PR:** usar *Create a merge commit* (não *squash*), para preservar os commits RED → GREEN → REFACTOR no histórico.
- **Coverage gate:** o `coverageThreshold` do `jest.config.js` faz o Jest terminar com código ≠ 0 abaixo dos limites, o que falha o job.
- **Bloqueio de merge (branch protection),** configurado no GitHub em *Settings → Branches → Add rule* para `main` e `develop`:
  - ☑ Require a pull request before merging (0 aprovações obrigatórias, por ser um projeto individual)
  - ☑ Require status checks to pass: `Lint & análise estática`, `Testes + coverage gate`
  - ☑ Do not allow bypassing the above settings (vale também para administradores; impede commits diretos)

Todas as alterações em `main` e `develop` entraram por Pull Request com o CI verde: [lista de PRs](https://github.com/amabilee/projeto-self-testing-ci/pulls?q=is%3Apr+is%3Amerged). O teste de carga roda nos PRs para `main`, por exemplo nos checks do [PR #10 (release 1.0.0)](https://github.com/amabilee/projeto-self-testing-ci/pull/10/checks).

---

## 6. Teste de desempenho / carga

- **Ferramenta:** K6, script em `load-tests/transfer-load.js`.
- **Cenário:** `constant-vus` com **50 usuários virtuais simultâneos** por 20 s, todos transferindo R$ 1,00 **entre o mesmo par de contas**. É o pior caso de disputa pelo mesmo saldo.
- **Thresholds:** erro inesperado < 1%, `http_req_failed` < 1% e p95 < 500 ms.
- **Verificação de consistência:** no `teardown`, a soma dos saldos tem que ser exatamente igual ao saldo inicial total.

### Resultados (execução local, MacBook, Node 24, SQLite em arquivo com WAL)

| Métrica | Resultado |
|---|---|
| Usuários simultâneos (VUs) | 50 |
| Total de requisições | 65.500 |
| Vazão | ~3.270 req/s |
| **Taxa de erro** | **0%** |
| **Latência média** | **15,24 ms** |
| Latência p95 | 23,38 ms |
| Latência máxima | 229,92 ms |
| Consistência de saldo | ✅ origem 934.504 + destino 65.496 = 1.000.000 |
| Travamentos / deadlocks | Nenhum |

**Análise:** a serialização das escritas via transação `IMMEDIATE` garantiu consistência total sob concorrência, sem travamentos. A latência média baixa mostra que o custo do lock é pequeno para esta carga. O principal limite de escalabilidade é o modelo de escritor único do SQLite. Em produção, o caminho natural seria PostgreSQL com `SELECT … FOR UPDATE` (ou locks otimistas por versão) e uma fila para a notificação anti-fraude (outbox pattern).

O relatório JSON fica em `reports/load-test-summary.json` e no artefato `load-test-report` do CI.

---

## 7. Estratégia de branching e controle de versão

**Modelo adotado: Git Flow**

| Branch | Função |
|---|---|
| `main` | Código em produção. Recebe apenas merges de `release/*` e `hotfix/*`, cada um com tag `vX.Y.Z` |
| `develop` | Integração contínua das features |
| `feature/*` | Uma por funcionalidade. Sai de `develop` e volta via PR revisado |
| `release/*` | Estabilização de versão. Sai de `develop` e é mesclada em `main` e `develop` |
| `hotfix/*` | Correção emergencial. Sai de `main` e é mesclada em `main` e `develop` |

**Histórico de versões:** `CHANGELOG.md`, com tags `v1.0.0`, `v1.0.1`, `v1.0.2` e `v1.0.3`.

**Convenção de commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `test`, `refactor`, `ci`, `docs`, `chore`, com escopo opcional, ex: `feat(transfer): ...`).

### Correções emergenciais documentadas

| Hotfix | Problema | Correção | PR / Tag |
|---|---|---|---|
| `hotfix/1.0.1-json-malformado` | Corpo JSON malformado retornava **500** em vez de 400 | Tratamento de `SyntaxError` no `errorHandler` + teste E2E | [#12](https://github.com/amabilee/projeto-self-testing-ci/pull/12) (main) e [#13](https://github.com/amabilee/projeto-self-testing-ci/pull/13) (develop) / [`v1.0.1`](https://github.com/amabilee/projeto-self-testing-ci/tree/v1.0.1) |
| `hotfix/1.0.2-idempotency-key` | `Idempotency-Key` vazia ou muito longa era aceita | Validação de 1 a 128 caracteres + testes de integração | [#14](https://github.com/amabilee/projeto-self-testing-ci/pull/14) (main) e [#15](https://github.com/amabilee/projeto-self-testing-ci/pull/15) (develop) / [`v1.0.2`](https://github.com/amabilee/projeto-self-testing-ci/tree/v1.0.2) |

### Fluxo de Pull Requests

| PRs | Origem → destino |
|---|---|
| [#1](https://github.com/amabilee/projeto-self-testing-ci/pull/1) a [#9](https://github.com/amabilee/projeto-self-testing-ci/pull/9) | `feature/*` → `develop` |
| [#10](https://github.com/amabilee/projeto-self-testing-ci/pull/10) e [#11](https://github.com/amabilee/projeto-self-testing-ci/pull/11) | `release/1.0.0` → `main` e `develop` (tag [`v1.0.0`](https://github.com/amabilee/projeto-self-testing-ci/tree/v1.0.0)) |
| [#12](https://github.com/amabilee/projeto-self-testing-ci/pull/12) a [#15](https://github.com/amabilee/projeto-self-testing-ci/pull/15) | `hotfix/*` → `main` e `develop` |

Grafo de branches: [aba Network](https://github.com/amabilee/projeto-self-testing-ci/network). Após cada merge, as branches de feature, release e hotfix foram removidas, restando apenas `main` e `develop`.

---

## 8. Como executar

```bash
npm ci
npm run lint && npm run typecheck
npm run test:coverage                 # todas as suítes + coverage gate
npm run antifraud:mock &              # gateway fictício (porta 4000)
npm run build && npm start &          # API (porta 3000)
npm run load:test                     # K6 com 50 VUs
```
