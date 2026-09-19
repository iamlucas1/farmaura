---
cssclasses: ia-nota
---

# Cashback só existe no canal PDV — tile do marketplace é estimativa, não saldo real

**Status:** Resolvido em 2026-09-04
**Prioridade:** Baixa
**Registrado em:** 2026-08-26

## Descrição

Confirmado ao investigar o backend para a leva de trabalho de Meus pedidos: cashback (`customer_cashback_wallets`, `cashback_transactions`) só é ganho/resgatado no PDV — não existe nenhum endpoint de leitura de saldo de cashback no roteador self-service do cliente (`customers.py`) nem em `portal.py`. Pedidos online nunca tocam a wallet real.

O tile "Em cashback" que já existe em `AccountSummary` (`account-screen.jsx`, `faCashback(orders, products).available`) é uma **estimativa calculada no client** a partir do histórico de pedidos — não é o saldo real de `customer_cashback_wallets`. Um cliente que também compra no balcão físico teria um saldo real divergente do que esse tile mostra.

## Contexto

Registrado para que ninguém trate esse tile como dado real por engano, e como ponto de partida caso o negócio decida estender cashback para o canal online — ver [[../02_Documentacao/Modulo_CRM|Modulo_CRM]] (seção "Mecânica de cashback") para o desenho atual (PDV-only, sem expiração implementada, `pending_balance`/`release_after_delivery` no schema mas não usados).

## Resolução

Cashback real implementado no marketplace em 2026-09-04 — ver
[[../00_Decisoes/2026-09-04-cashback-real-no-marketplace|ADR completo]]. `GET /customers/me/cashback`
agora existe; `AccountSummary`/`CashbackScreen` usam o saldo real da wallet, não mais a estimativa
`faCashback`. Ganho por pedido online fica `pending` até a entrega/retirada, resgate abate o valor
cobrado de verdade no Asaas, teto de resgate configurável pelo admin (default 25% do pedido).
Pré-requisito de segurança (RLS ausente nas tabelas de cashback + achado crítico de vazamento
cross-tenant via PDV) corrigido na mesma leva — ver
[[../04_Seguranca_Riscos/rls-ausente-em-tabelas-de-varios-dominios|nota]] e
[[../04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv|nota]].