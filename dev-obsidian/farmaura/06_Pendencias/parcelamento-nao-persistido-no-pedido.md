# Parcelamento não é capturado nem exibido no pedido

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-26

## Descrição

Nenhum model/schema do domínio de pedidos guarda quantidade de parcelas (`CheckoutPaymentRequest` só tem `method`/`payment_method_id`; `CustomerPaymentMethod` só guarda metadados do cartão tokenizado). O "3x sem juros" que aparece no carrinho/produto é só uma estimativa de marketing calculada no client (`resolvePaymentBreakdown`) a partir de regras de pagamento configuradas no Portal — nunca é o parcelamento realmente escolhido/cobrado no Asaas. Ou seja, mesmo que o cliente pague parcelado de fato, `GET /orders` nunca mostra quantas parcelas foram usadas.

## Contexto

Encontrado ao mapear os campos de `MarketplaceOrderResponse` para decidir o que exibir em Meus pedidos. Asaas suporta parcelamento — a integração atual (`AsaasClient.charge_card`) simplesmente não pede/persiste esse dado. Corrigir isso é trabalho de checkout + schema (`payment` precisaria de um campo `installments`) + migration, fora do escopo da leva atual (avaliação de produto + nota fiscal do cliente).
