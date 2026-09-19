---
cssclasses: ia-nota
---

# Duas fontes de verdade divergentes para "item exige receita"

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-02

## Descrição

Existem hoje duas colunas diferentes, em tabelas diferentes, que deveriam responder à mesma
pergunta — "este item precisa de receita?" — e não estão sincronizadas:

- `marketplace_listings.requires_prescription_upload` (booleano manual por listagem).
- `inventory_products.controlled_category` (categoria, usada por
  `is_marketplace_image_restricted` em `marketplace_projection.py` para derivar o campo
  `requires_prescription`/`product.rx` que o **catálogo real** expõe ao frontend, e também usada
  por `order_service.py` para `order_item.requires_prescription_upload` no momento do pedido).

Na prática, `requires_prescription_upload` (marketplace_listings) parece **não alimentar** o `rx`
que carrinho/checkout/catálogo realmente usam — só `controlled_category` importa hoje. Exemplo
real encontrado nos dados semeados: "Amoxicilina 500mg 21 capsulas" tem
`requires_prescription_upload = true` mas `controlled_category = 'none'` — no marketplace, o
produto não mostra nenhum alerta de receita nem bloqueia pagamento, apesar da coluna dizer que
deveria. "Clonazepam 2mg 30 comprimidos" tem as duas colunas coerentes
(`controlled_category = 'black_stripe'`).

## Contexto

Encontrado ao testar o bloqueio de pagamento por receita (ver
[[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR]]) — o teste
inicialmente tentou usar Amoxicilina como item de receita e falhou silenciosamente (nenhum alerta
apareceu), até trocar para Clonazepam. Não corrigido nesta sessão: mexer em qual coluna é a fonte
de verdade (ou sincronizar as duas) muda comportamento de catálogo/pedido já em produção, exige
confirmação explícita do usuário antes de qualquer mudança de dado/regra de negócio real.