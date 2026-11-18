# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.3] - Documentação
### Documentação
- Relatório técnico com evidências de TDD (commits RED/GREEN/REFACTOR e execuções do CI), proteção de branch e links dos hotfixes.

## [1.0.2] - Hotfix
### Corrigido
- `Idempotency-Key` vazia ou com mais de 128 caracteres era aceita silenciosamente; agora retorna **400 `VALIDATION_ERROR`**.

## [1.0.1] - Hotfix
### Corrigido
- Requisições com corpo JSON malformado retornavam **500 Internal Server Error**; agora retornam **400 `INVALID_JSON`**.

## [1.0.0] - Release inicial
### Adicionado
- Criação e consulta de contas digitais com saldo inicial e validação cadastral.
- Transferências com controle de concorrência, saldo insuficiente e idempotência (`Idempotency-Key`).
- Extrato com filtros por período e tipo (débito/crédito).
- Notificação ao serviço anti-fraude via webhook.
- Suíte de testes unitários, de integração e E2E; pipeline de CI com coverage gate; teste de carga K6.
