---
cssclasses: ia-nota
---

# Avaliação de entrega/retirada não tem model nem endpoint

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-26

## Descrição

Ao implementar avaliação de produto real em Meus pedidos (`POST /portal/products/reviews`, já existente), ficou de fora avaliar a **experiência de entrega/retirada** em si (pontualidade, estado da embalagem, atendimento do entregador, etc.) — algo distinto de avaliar o produto comprado. Não existe hoje nenhum model, tabela ou endpoint para isso; seria um domínio novo (tabela própria, RLS, migration, endpoint, e a UI correspondente em `OrderCard`/`OrderSupportDrawer`).

## Contexto

Veio de um demo de UI prototipado antes desta etapa, que tinha "Avaliar produto" e "Avaliar entrega" como duas ações separadas. Só "Avaliar produto" tinha suporte real no backend, então só ele foi implementado agora — ver [[../00_Decisoes/2026-08-26-nota-fiscal-acesso-do-cliente-por-pedido|ADR irmão]] (mesma leva de trabalho) e [[../02_Documentacao/Modulo_Carrinho_Pedidos|Modulo_Carrinho_Pedidos]] para o desenho de pedidos/fulfillment que essa avaliação se penduraria.