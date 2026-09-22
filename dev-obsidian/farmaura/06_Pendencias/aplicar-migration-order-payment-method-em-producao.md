---
cssclasses: ia-nota
---

# Aplicar migration `20260922_01` (forma de pagamento do pedido) em produção

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-22

## Descrição

`farmaura-api/alembic/versions/20260922_01_order_payment_method_code.py`: adiciona `orders.payment_method` (`String(24)`, `NOT NULL`, backfill via `server_default=""` removido após o backfill) — o código bruto da forma de pagamento do checkout (`pix`/`credit_card`/`debit_card`/`pickup_cash`), ao lado do já existente `payment_method_label` (humanizado). `OrderService.create_marketplace_order` já grava essa coluna em todo pedido novo, e `FiscalService._snapshot_marketplace_order` já depende dela para mapear o `tpag` fiscal (ver [[../00_Decisoes/2026-09-22-nfce-real-para-pedidos-marketplace-pickup|ADR]]) — **sem a migration, a emissão fiscal de pedidos `pickup` falha** (coluna inexistente), embora o restante do checkout continue funcionando normalmente.

Testada isoladamente contra um Postgres descartável, não via `alembic upgrade head` desde a primeira migration: nenhum ambiente real (nem local, nem staging) jamais rodou a cadeia completa (ver [[alembic-version-ausente-no-postgres-local|pendência relacionada]]) e a cadeia histórica falha numa migration muito anterior e não relacionada (`chat_unblock_requests`, débito técnico pré-existente). Verificação usada: banco criado do zero via `create_all()` (já incluindo a coluna nova) + `alembic stamp head`, depois `alembic downgrade -1` (confirma a coluna sendo removida corretamente) e `alembic upgrade head` (confirma a coluna sendo recriada como `character varying(24) NOT NULL`). Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] antes do deploy real.

## Contexto

Registrada ao estender o módulo NFC-e existente para emitir nota fiscal real (direto à SEFAZ-DF) de pedidos de marketplace com retirada em loja, substituindo o caminho antigo de NFS-e simulada via Asaas. Ver o [[../00_Decisoes/2026-09-22-nfce-real-para-pedidos-marketplace-pickup|ADR]]. Aplicar em produção exige confirmação explícita do usuário.
