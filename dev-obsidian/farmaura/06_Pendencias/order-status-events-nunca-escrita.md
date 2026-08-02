# `order_status_events` existe (com RLS) mas nunca é escrita

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-25

## Descrição

A tabela `order_status_events` (`app/models/order_status_event.py`) é um ledger append-only pensado para registrar transições de status de pedido (`actor_user_id`, `event_type`, `from_status`, `to_status`, `source_channel`, `notes`), com política RLS já configurada (`order_status_events_access_policy`). Nenhum código do backend (`order_service.py` ou qualquer outro) jamais instancia/grava uma linha nessa tabela — é infraestrutura pronta e não conectada. Hoje o histórico de status de um pedido só existe implicitamente via `updated_at` e os labels de texto pré-formatados no próprio `Order` (sem granularidade de "quem mudou o quê e quando").

## Contexto

Encontrado ao documentar [[../02_Documentacao/Modulo_Carrinho_Pedidos|Modulo_Carrinho_Pedidos]]. Se o time pretende usar essa tabela para timeline/auditoria de pedido no futuro, falta só conectar a escrita em `advance_internal_order`/`confirm_internal_pickup`/`dispatch_shipping_order`/cancelamento — o schema e a RLS já existem.
