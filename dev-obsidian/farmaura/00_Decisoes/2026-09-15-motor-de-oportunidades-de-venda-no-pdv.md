---
cssclasses: ia-nota
---

# 2026-09-15 — "O cliente costuma comprar" vira "Oportunidades de venda", com recomendação real de cross-sell

## Contexto

O painel de sugestões do PDV (`PdvUpsell`) mostrava, com o cliente identificado, "O cliente costuma comprar" — só o histórico de compras do PRÓPRIO cliente, sem olhar pro que está no carrinho agora nem pro comportamento de compra de outros clientes. Pedido: o "Oferecer" deve refletir o que de fato vale a pena oferecer para maximizar a venda/ticket médio, cruzando (1) recorrência do cliente, (2) o que ele costuma comprar junto com o que já está no carrinho, (3) o que mais sai junto com os produtos do carrinho entre TODOS os clientes, e (4) o estilo de compra geral do cliente — e trocar o título para algo que comunique "oferecer", não "ele já compra isso".

## Decisão

### Novo motor de recomendação, 100% em dado real (sem heurística local nem fabricação)

`PurchaseHistoryService.get_cart_upsell_suggestions` (novo método, `app/services/purchase_history_service.py`) combina quatro sinais, cada um só ativa com dado de compra real (nenhum produto "aleatório" é sugerido):

1. **Co-compra global** — o que mais é comprado junto com os produtos do carrinho, olhando o histórico de TODOS os clientes (pedidos do marketplace + vendas do balcão). Implementado como duas novas consultas de repositório (`OrderRepository.list_items_for_orders_matching_products`, `PdvRepository.list_sale_items_for_sales_matching_products`): acham todos os pedidos/vendas que contêm pelo menos um produto do carrinho, trazem TODAS as linhas desses pedidos/vendas, e contam por produto quantos pedidos/vendas distintos o contêm (nunca quantidade somada — um pedido enorme não pode sozinho dominar o ranking).
2. **Co-compra pessoal** — a mesma conta, mas restrita só aos pedidos/vendas DESSE cliente — pega o padrão de "o que ele mesmo costuma comprar junto com X".
3. **Top produtos do cliente** (estilo geral de compra) e **candidatos de recorrência** (already existentes via `get_customer_purchase_summary`), que ainda não estão no carrinho.

Pesos (`WEIGHT_GLOBAL_CO_PURCHASE=1.0`, `WEIGHT_PERSONAL_CO_PURCHASE=3.0`, `WEIGHT_PERSONAL_TOP_PRODUCT=1.5`, `WEIGHT_PERSONAL_RECURRENCE=2.0`) fazem o padrão pessoal do cliente pesar mais que o sinal genérico entre todos os clientes — testado e confirmado: com Mariana Souza (recorrência real em Vitamina D3) e Losartana 100mg no carrinho, a sugestão nº 1 foi exatamente a Vitamina D3 (a mesma que aparece no card de recorrência dela), à frente dos itens só de co-compra global.

Candidatos são então resolvidos contra o estoque real da loja atual (nome exato, quantidade > 0) — uma sugestão que ninguém consegue atender agora é pior que nenhuma sugestão.

### Novo endpoint

`POST /pdv/upsell-suggestions` (`app/api/v1/pdv.py`, schemas em `app/schemas/pdv.py`): recebe os itens do carrinho atual (nome + marca) e o `customer_id` (opcional), devolve até 4 produtos já resolvidos (id de estoque real, nome, marca, categoria, preço) — o front não precisa mais adivinhar/casar nome de produto sozinho.

### Frontend: `PdvUpsell` some client-side, título muda

`point-of-sale-screen.jsx`: com carrinho vazio, mantém o cold-start local (`pdvSuggestions`, mais vendidos gerais — não há carrinho pra cruzar). A partir do primeiro item, um efeito com debounce de 400ms chama o novo endpoint a cada mudança de carrinho/cliente. Título trocado de "O cliente costuma comprar" / "Para oferecer" para um único **"Oportunidades de venda"**, e o texto de cada item deixou de mostrar "comprou Nx"/"mais vendido" — agora mostra só preço e categoria, coerente com a mudança irmã já feita no card do cliente (ver ADR relacionado).

## Consequências

- Nenhuma migração — as duas queries novas de repositório reaproveitam tabelas já existentes (`order_items`/`orders`, `pdv_sale_items`/`pdv_sales`).
- Testado ponta a ponta via Chrome headless: (1) carrinho anônimo com Dipirona → sugeriu Amoxicilina e Simeticona (co-compra global, mesma categoria); ao ofertar Amoxicilina, a lista se atualizou sozinha trocando a sugestão; (2) carrinho da Mariana Souza com Losartana 100mg → sugeriu Vitamina D3 em primeiro lugar (recorrência pessoal real dela), seguida de itens de co-compra.
- Escopo consciente: a assinatura do endpoint casa produto por nome+marca exato (mesmo critério já usado em `_product_key`/`slug_marketplace_value` no resto do serviço) — não há matching fuzzy nem IA por trás, é contagem real de coocorrência em pedidos/vendas.

## Ver também

- [[2026-09-15-costuma-comprar-por-categoria-em-vez-de-frequencia-bruta]] — mudança irmã no card de dados do cliente (categoria em vez de contagem), mesmo princípio de "não é só frequência bruta" aplicado ao card informativo em vez do painel de oferta.
- `app/services/purchase_history_service.py` — `get_customer_purchase_summary` (já existente) é reaproveitado como uma das quatro entradas do novo motor.