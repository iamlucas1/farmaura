# Agendamentos de serviço não contam para segmentação "novo cliente"/"recorrente"

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-31

## Descrição

`CouponService._count_previous_purchases` (usado para `CouponCampaign.audience`
`new_customers`/`recurring`, e indiretamente para o conceito geral de "cliente novo" no
sistema) soma pedidos online (`Order`) e vendas de balcão (`PdvSale`), mas **não**
`HealthServiceAppointment`. Um cliente que só já agendou serviços de saúde (nunca comprou um
produto) continua sendo classificado como "novo" para fins de cupom de produto — e o inverso: um
booking de serviço não conta como "compra anterior" para elegibilidade de cupom de produto
`first_purchase_only`/`new_customers`.

## Contexto

Decisão consciente ao construir o eixo `scope_type="services"` em
[[../00_Decisoes/2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|2026-07-31]] — mudar
`_count_previous_purchases` afetaria a segmentação de **todo** cupom existente (não só os
de serviço), um escopo maior do que o pedido na sessão. Também não estava claro se um agendamento
de serviço deveria contar como "compra" para fins de produto — decisão de produto, não só técnica.
Se decidido que sim, o fix é simples: somar `HealthServiceAppointment` na mesma contagem,
mesmo padrão já usado por `_count_customer_coupon_uses` (que **já** conta bookings, ver ADR).
