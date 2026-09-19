---
cssclasses: ia-nota
---

# Migration `20260830_01` (chat spam-guard) pendente em produção

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-08-30

## Descrição

A migration `farmaura-api/alembic/versions/20260830_01_chat_spam_guard_and_order_freeze.py` — colunas novas em `customers` (`chat_flagged_spam`, `chat_violation_count`, `chat_blocked_until`, `chat_permanently_blocked`), `chat_threads.closed_reason` e a tabela nova `chat_unblock_requests` — foi escrita, testada e verificada **só em dev local**, nunca aplicada em produção. Localmente o schema veio via reset completo (`docker compose down -v` + `bootstrap_database.py`/`create_all()`), não via `alembic upgrade` de verdade — ver [[../07_POPs_Processos/resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] (dev roda sem Alembic por política, [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|ADR da adoção do Alembic em produção]]).

Em produção, `bootstrap_database.py` só faz `create_all()` (tabelas novas), **nunca `ALTER TABLE`** em tabela já existente — então mesmo sem rodar a migration manualmente, um deploy do código novo criaria `chat_unblock_requests` (tabela nova) mas **não** adicionaria as colunas novas em `customers`/`chat_threads`, quebrando a guarda de spam em runtime (erro de coluna inexistente) até a migration ser aplicada.

## Contexto

Fluxo normal pós-lançamento é `alembic upgrade head` manual em produção, nunca automático — ver [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]. Esta migration ainda não passou por esse processo porque o trabalho (guarda anti-spam, vínculo de chat a pedido, congelamento automático — ver [[../00_Decisoes/2026-08-30-chat-farmaceutico-anti-spam-vinculo-pedido-e-congelamento|ADR]]) foi construído e validado inteiramente em ambiente local nesta sessão; a aplicação em produção depende de deploy explícito, que a IA não executa por iniciativa própria.