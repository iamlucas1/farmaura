# 2026-07-30 — Remover desconto manual do Precificador; `PricingPromotion.kind` segrega campanha de desconto direto

**Status:** Aceita
**Data:** 2026-07-30

## Contexto

O usuário notou produtos com desconto na vitrine ("Economize") mesmo sem nenhuma `PricingPromotion`
cadastrada. Investigação achou a causa: `InventoryItem.promotional_discount_percent` era um segundo
mecanismo de desconto, totalmente independente do sistema de Promoções construído mais cedo nesta
mesma sessão — um campo manual, lido em `marketplace_projection.py::build_marketplace_catalog_groups`
para compor o preço do catálogo/checkout, sem nenhuma relação com `PricingPromotion`.

Achado colateral: a tela **Precificador** (`pricing-screen.jsx`) já não deixava o admin editar esse
campo — `PriceDrawer` sempre chamava `priceCalc({...it, promo: 0}, ...)` e sempre salvava `promo: 0`,
zerando silenciosamente qualquer valor existente a cada "Precificar". O campo só era populado via seed
direto no banco ou pela importação de nota fiscal (OCR sugere um desconto, confirmar a linha grava no
campo). A tela ainda lia o valor pra exibir badge "-X%" e a KPI "Em promoção" — um recurso morto pela
metade.

O usuário decidiu remover o campo por completo e mover toda autoridade de desconto para dentro de
Promoções, com uma segregação explícita: **campanha** (o que já existia — segmentação de público) vs.
**desconto direto de produto** (um desconto simples, nunca segmentado por definição). Perguntado sobre
o fluxo de importação de nota fiscal, decidiu que o desconto sugerido pelo OCR deveria virar uma
sugestão de criar/atualizar uma promoção do tipo "desconto de produto", em vez de reviver o campo.

## Alternativas consideradas

- **Deixar os dois mecanismos coexistindo, só arrumando o `PriceDrawer` quebrado.** Rejeitada
  explicitamente — o usuário quis consolidar tudo que envolve desconto numa única tela.
- **Nova tabela dedicada para "desconto direto de produto"**, separada de `pricing_promotions`.
  Rejeitada — duplicaria o motor de matching/aplicação de preço inteiro (`pricing_promotion_service.py`)
  para um caso que já é 100% coberto pelo `PricingPromotion` existente com `scope_type="products"` e
  zero filtros de audiência; um campo discriminador (`kind`) resolve a segregação pedida sem duplicar
  lógica.
- **Import de nota fiscal simplesmente parar de sugerir desconto.** Oferecida como alternativa mais
  simples; o usuário preferiu preservar o comportamento (uma linha de nota com desconto ainda resulta
  em o produto entrar em oferta automaticamente).

## Decisão

1. **`InventoryItem.promotional_discount_percent` removido** — coluna, constraints, schemas
   (`InventoryItemCreateRequest`/`UpdateRequest`/`Response`), toda leitura/escrita em
   `inventory_service.py`/`product_service.py`/`marketplace_projection.py`. Catálogo e checkout passam
   a computar preço sempre a partir de `sale_price` puro + o que `PricingPromotion` decidir.
2. **`PricingPromotion.kind`** (`campaign` default | `product_discount`) — validado em
   `portal_service.py`: `product_discount` exige `scope_type="products"` com pelo menos um produto, e
   **rejeita** (422) qualquer filtro de audiência setado (reaproveita
   `promotion_has_audience_restrictions`, já existente para a regra de `guest_visible`). `kind` é só uma
   trava de escrita — o motor de matching/aplicação de preço (`pricing_promotion_service.py`) trata
   qualquer `PricingPromotion` do mesmo jeito, independente do tipo. **`product_discount` sempre tem
   `guest_visible=True`, forçado no backend, sem alternativa** — como esse tipo nunca pode ter filtro de
   audiência, não existe motivo pra esconder um preço cortado de um visitante deslogado (é só o preço do
   produto, nada de personalizado). O toggle "visível deslogado" já existente continua funcionando como
   opt-in normal só para `kind="campaign"`. Ajuste feito ainda no dia 2026-07-30, depois de o usuário
   notar que os descontos de produto seedados não apareciam pra visitante deslogado.
3. **Importação de nota fiscal** (`inventory_invoice_service.py::_upsert_product_discount_promotion`):
   ao confirmar uma linha com desconto sugerido pelo OCR > 0, busca uma `product_discount` já existente
   para aquele produto (por nome) e atualiza o valor, ou cria uma nova — nunca mais toca
   `InventoryItem`.
4. **Precificador perde toda UI de desconto** (KPI "Em promoção", badge, filtro, e o `promo: 0` morto do
   `PriceDrawer`) — ganha em troca um atalho "Criar desconto" por linha, que abre o modal de Promoções
   já com `kind: 'product_discount'`, `scopeType: 'products'` e o produto pré-selecionado.
5. **`scripts/seed.py` atualizado**: os produtos que tinham `"promo" > 0` no spec agora seedam uma
   `PricingPromotion(kind="product_discount")` equivalente, em vez de gravar no campo removido —
   preserva a mesma vitrine de demonstração.

## Consequências

- Nova migration (`20260730_04_promotion_kind_drop_item_promo`): adiciona `pricing_promotions.kind`,
  remove `inventory_items.promotional_discount_percent` e seus 2 `CheckConstraint`s.
- `InventoryItemCreateRequest`/`UpdateRequest` mudam de contrato (campo removido) — qualquer chamada
  antiga enviando `promotional_discount_percent` passa a ser rejeitada como campo desconhecido
  (`StrictModel`), o que é o comportamento desejado (força a migração completa para o novo modelo).
- `marketplace_listings.promotional_discount_percent` — campo homônimo em outra tabela, já era morto
  antes desta mudança (nunca lido em nenhuma lógica de preço), **não foi tocado**: não era a causa do
  problema relatado e mexer nele é um risco desnecessário fora do escopo pedido. Fica registrado como
  observação em [[../02_Documentacao/Modulo_Catalogo|Módulo Catálogo]], não como pendência ativa.
- Faixas/limiares não mudam — este ADR não altera `compute_loyalty_tier` nem qualquer outro eixo de
  segmentação já existente, só adiciona o discriminador `kind` e remove o mecanismo paralelo de
  desconto.

## Ver também

- [[../02_Documentacao/Modulo_Catalogo|Módulo Catálogo]] — model `pricing_promotions` atualizado.
- [[2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR: promoção reaplicada no checkout]] —
  decisão irmã da mesma sessão, mesmo domínio.
