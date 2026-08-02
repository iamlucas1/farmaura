# Sem cancelamento genérico de pedido (nem cliente nem operador interno)

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-07-25

## Descrição

Não existe, em todo o backend, um endpoint de cancelamento de pedido acionável por cliente ou por farmacêutico/operador interno. O **único** caminho que leva `orders.status` a `cancelled` é a rejeição de receita médica (`PrescriptionService.decide`, quando `status="rejected"` e a prescrição tem `order_id`) — que cancela o pedido e credita o estoque de volta como efeito colateral de uma decisão de outro domínio.

Cenários não cobertos por nenhum fluxo hoje:
- Cliente que pagou por engano e quer cancelar antes da separação.
- Farmacêutico/operador que precisa cancelar por item quebrado, fraude, ou erro operacional, sem que exista uma receita associada para rejeitar.
- Reembolso via webhook Asaas (`PAYMENT_DELETED`/`REFUNDED`) atualiza só `order.payment_status`, **nunca** `order.status` — um pedido reembolsado continua "ativo" no board operacional.

## Contexto

Encontrado ao documentar [[../02_Documentacao/Modulo_Carrinho_Pedidos|Modulo_Carrinho_Pedidos]] — ficou pendente porque a tarefa em curso era de documentação, não de implementação; registrar aqui para não se perder, já que é uma lacuna operacional real (não uma escolha deliberada documentada em nenhuma decisão).
