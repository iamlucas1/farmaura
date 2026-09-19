---
cssclasses: ia-nota
---

# 2026-09-16 — "Oportunidades de venda" passa a contar visualizações, favoritos e "avise-me quando chegar"

## Contexto

Pedido: o motor de recomendação do card "Oportunidades de venda" do PDV deveria também levar em conta quantas vezes o cliente visitou/pesquisou um produto no marketplace (mesmo sem comprar), além de produtos favoritados e "desejados" (itens sem estoque que o cliente pediu para ser avisado quando chegar).

## Decisão

### Visualizações de produto — infraestrutura nova

Não existia nenhum rastreamento de visualização de produto no sistema. Criado do zero:
- `ProductViewEvent` (tabela `product_view_events`, migração `20260916_02`) — liga `customer_id` + `inventory_product_id` (o mesmo `InventoryProduct` que a alias `"prod-<id>"` do marketplace já carrega em cada produto — sem precisar casar por nome/marca).
- `POST /portal/marketplace/products/{inventory_product_id}/view` — autenticado, silencioso (204), só loga para cliente identificado (sem cliente, não há a quem atribuir o sinal).
- Frontend: `product-screen.jsx` dispara essa chamada (best-effort, nunca bloqueia a navegação) toda vez que a página do produto é aberta por um cliente logado, reaproveitando o mesmo alias `prod-<id>` já usado pelo rail "outros clientes também compraram".
- RLS própria (`product_view_events_access_policy`), mesmo padrão de `product_availability_alerts`.

### Favoritos e "desejados" — sinais que já existiam, agora usados

`SavedProduct` (favoritos) e `ProductAvailabilityAlert` (avise-me quando chegar) já existiam no sistema, mas nunca alimentavam o motor de recomendação. Passam a contar via `PurchaseHistoryService.get_cart_upsell_suggestions`.

### Pesos — sinais de navegação são reais, mas mais fracos que compra

```
WEIGHT_PERSONAL_DESIRED = 1.2    # avise-me quando chegar — intenção ativa, só falta estoque
WEIGHT_PERSONAL_FAVORITE = 1.0   # favorito — sinal deliberado, mas passivo
WEIGHT_PERSONAL_VIEW = 0.3       # por visualização — fraco isoladamente, acumula com repetição
PRODUCT_VIEW_COUNT_CAP = 10      # trava para um produto visto obsessivamente não dominar o ranking
```
Todos ficam abaixo dos pesos já existentes baseados em compra real (`WEIGHT_PERSONAL_CO_PURCHASE=3.0`, `WEIGHT_PERSONAL_RECURRENCE=2.0`, `WEIGHT_PERSONAL_TOP_PRODUCT=1.5`) — navegar sem comprar é um sinal real, mas nunca deveria superar uma compra de verdade.

## Bugs de raiz encontrados e corrigidos no caminho (pré-existentes, não introduzidos por esta mudança)

Ao integrar favoritos, dois problemas graves e **pré-existentes** vieram à tona — sem corrigi-los, a funcionalidade pedida não teria dado nenhum sinal real:

### 1. Favoritar um produto de verdade sempre falhava (erro 503)

`SavedProduct.product_name_snapshot` guardava o **ref cru** (`"mkt-losartana-..."`), não o nome real do produto — porque `_split_product_ref` tratava qualquer ref não prefixado (`inv-`/`listing-`) como se fosse literalmente um UUID de `inventory_item_id`, escrevendo essa string direto numa coluna `uuid`. Isso já era um problema **conhecido e documentado** em [[../06_Pendencias/product-ref-nao-normalizado-quebra-favoritos-assinaturas|pendência de 2026-08-26]] — nunca tinha sido confirmado com um teste real. Confirmei agora: `POST /portal/marketplace/favorites` com um `product_ref` real (`mkt-paracetamol-750mg-20-comprimidos-medley`) sempre respondia "banco de dados indisponível".

**Corrigido**: novo `PortalService._resolve_grouped_product_ref` recompõe `build_marketplace_product_id` contra o catálogo atual em Python (mesmo raciocínio já usado em `_resolve_review_purchase_match`, que citava esse bug como pendente) e resolve o `inventory_item_id`/nome reais antes de gravar. `_split_product_ref` corrigido para devolver `(None, None)` quando o ref não é prefixado, em vez do catch-all que causava o bug — **isso também destravou `_resolve_review_purchase_match`**, cujo próprio ramo de fallback (recomputar em Python) nunca era alcançado por causa do mesmo catch-all, então avaliar um produto por um ref real provavelmente também falhava até agora.

Mesma correção aplicada em `create_subscription`/`update_subscription`/`delete_subscription` (o botão "Assinar" do marketplace tinha o mesmo bug) e em `delete_favorite` (não achava o favorito para remover, comparando contra o formato errado).

### 2. `save_favorite`/`delete_favorite`: mesma classe de bug RLS pós-commit já documentada

Depois de corrigir o crash acima, favoritar continuava devolvendo lista vazia (sem erro) — o mesmo bug de [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|RLS pós-commit]] já corrigido hoje em `CrmService.create_address` e nas assinaturas, só que em dois métodos que a auditoria original nunca cobriu. Corrigido com `apply_tenant_context` logo após o commit, mesmo padrão.

## Consequências

- Testado ponta a ponta: favoritar (cria e resolve nome/marca reais), remover favorito, pedir "avise-me quando chegar", logar 3 visualizações de um produto — os quatro sinais aparecem corretamente combinados em "Oportunidades de venda" (verificado via API e visualmente no PDV, cliente `Lucas Matheus`).
- **Achado, não corrigido agora**: ao auditar `portal_service.py` por essa mesma classe de bug (RLS pós-commit), encontrei ~9 métodos de configuração administrativa (banner, marcas, tendências, modo de lançamento, preço de entrega, desconto do PDV, CNAE, áreas de entrega, custos de construção, custos financeiros) com o mesmo padrão `commit()` seguido de releitura sem reaplicar contexto — não testados nem corrigidos aqui por serem uma superfície totalmente diferente (configuração interna, não o que foi pedido); registrado na nota de risco para uma varredura dedicada futura.

## Ver também

- [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|nota de risco atualizada]] — inclui os dois novos métodos corrigidos e a lista de suspeitos de configuração ainda não auditados.
- [[../06_Pendencias/product-ref-nao-normalizado-quebra-favoritos-assinaturas|pendência atualizada]] — confirmada e corrigida a parte de escrita que ela já suspeitava.
- [[2026-09-15-motor-de-oportunidades-de-venda-no-pdv|ADR original do motor de oportunidades de venda]].