# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] - Release inicial
### Adicionado
- Criação e consulta de contas digitais com saldo inicial e validação cadastral.
- Transferências com controle de concorrência, saldo insuficiente e idempotência (`Idempotency-Key`).
- Extrato com filtros por período e tipo (débito/crédito).
- Notificação ao serviço anti-fraude via webhook.
- Suíte de testes unitários, de integração e E2E; pipeline de CI com coverage gate; teste de carga K6.
