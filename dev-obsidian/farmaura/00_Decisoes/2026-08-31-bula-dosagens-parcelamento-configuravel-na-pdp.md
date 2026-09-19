---
cssclasses: ia-nota
---

# 2026-08-31 — PDP: bula em Markdown, dosagens/tamanhos e parcelamento configurável

## Contexto

Segunda rodada de melhorias na página de produto (ver
[[2026-08-31-pagina-de-produto-redesenhada-conforme-demo|ADR da primeira rodada, mesmo dia]]).
Pedido do usuário incluía três recursos reais novos — nenhum existia no modelo de dados antes
desta sessão: descrição de produto era uma string fixa hardcoded
(`marketplace_projection.py`, `"Disponivel no marketplace Farmaura"`), não havia conceito de
variação/dosagem em lugar nenhum do schema, e parcelamento era uma única configuração global por
tenant. Foi necessário migration + schemas + serviços novos no backend, não só CSS/JSX — plano
completo revisado e aprovado antes de implementar (modo de planejamento).

## Decisão

**Bula em Markdown + descrição em tópicos** — `InventoryProduct` ganhou `bula_markdown` (texto
livre) e `marketing_highlights` (lista curta de tópicos, até 8 itens/140 chars cada). Editável no
formulário de produto do console interno (`products-screen.jsx`). Renderizado na PDP via
`markdown-to-jsx` (nova dependência, `^9.10.2`) — escolhida por compilar Markdown para elementos
React reais, nunca `dangerouslySetInnerHTML`, então não abre uma segunda superfície de XSS a
sanitizar (diferente do banner HTML do marketplace, que precisa de `nh3`).

**Dosagens/tamanhos** — `InventoryProduct` ganhou `variant_group_id` (indexado) + `variant_label`.
Vínculo é uma relação entre dois produtos, não um campo isolado — por isso dois endpoints
dedicados (`POST`/`DELETE /products/{id}/variant-group`), não o `PUT` genérico de produto. A PDP
mostra chips de dosagem quando `product.variants.length > 1`; clicar navega para a página real do
outro produto (preço/estoque/avaliações próprios — nunca um estado compartilhado fake). A
projeção do catálogo (`marketplace_projection.py::_attach_variant_siblings`) monta essa lista
depois de agrupar todos os produtos, auto-inclusiva (o próprio produto aparece na lista, o
frontend só marca `entry.id === product.id` como ativo).

**Parcelamento por produto ou valor mínimo** — sem tabela nova: `installment_overrides` (lista de
regras `product`/`min_value`, cada uma com seu próprio `max_installments`/
`interest_free_installments`) foi só mais um campo dentro do objeto `PortalMarketplaceMetaResponse`
já existente, guardado no mesmo blob JSON (`portal_settings`/`SETTING_KEY_MARKETPLACE_META`) —
nenhum resolver novo foi necessário, o merge genérico já existente (`_resolve_marketplace_meta`)
já cobre o campo novo. Resolvido inteiramente client-side em `resolvePaymentBreakdown`
(`payment-pricing.js`), a mesma função já compartilhada entre o preview do admin e a vitrine real
— precedência: regra por produto (casa por **nome**, case-insensitive, mesma convenção já usada
por `PricingPromotion.target_products`) vence; senão a regra de valor mínimo mais alta cujo
threshold é atingido; senão os valores globais de sempre. UI nova em `pricing-screen.jsx`
(`InstallmentOverridesSettings`), reaproveitando `CouponTargetPicker`/`buildCouponProductOptions`
(já existentes, usados por cupons/promoções) em vez de um segundo picker de produto.

**Layout 3 colunas** — `.pd-layout` virou `380px 1fr 340px` (galeria | nome+descrição+dosagem |
preço+ações), colapsando para 1 coluna abaixo de 1080px. Removidos: contagem de estoque em texto
("X em estoque" — mantida só a mensagem de "sem estoque" quando aplicável), bloco de subtotal ao
lado do stepper de quantidade, e o card "Dúvidas sobre este produto?" (`PharmacistCard`, removida
do arquivo — `grep` confirmou que nada mais a importava).

**Fontes inconsistentes** — achado concreto: `.pd-rating-big`/`.pd-review-avatar` usavam
`var(--fa-mono)` fora do escopo documentado no `DESIGN.md` (mono é só para preço/código/tracking);
corrigido para a fonte padrão. `.pd-price` pedia peso 800 numa fonte que só tinha 400/500
carregados no Google Fonts, causando negrito falso do navegador — corrigido adicionando os pesos
600/700 ao `<link>` de Spline Sans Mono (em `marketplace.html` **e** `internal.html`, mesmo link
usado nos dois portais).

## Consequências

- Nova migration `20260831_01_product_bula_variants_installments` (4 colunas + 1 índice em
  `inventory_products`). Aplicada em dev local; **nunca em produção sem pedido explícito** (regra
  já registrada em `07_POPs_Processos/aplicar-migration-alembic-producao.md`).
- **Achado durante a aplicação, não causado por esta mudança**: o Postgres local de dev não tinha
  `alembic_version` (tabela nem existia) — o schema só existia via `Base.metadata.create_all` do
  `bootstrap_database.py`, nunca de fato migrado. Contornado com `alembic stamp 20260830_01`
  (confirmado por amostragem que o schema local já batia com esse head) antes de aplicar a
  migration nova. Gap real, registrado como pendência.
- `scripts/seed.py`: Losartana 50mg/100mg agora existem como par de variação real (mesmo
  `variant_group_id`, labels "50mg"/"100mg"); Losartana, Amoxicilina e Vitamina C ganharam
  `bula_markdown`/`marketing_highlights` reais — pedido explícito do usuário, para que o recurso
  já apareça populado num reset local (`docker compose down -v && up --build`), sem precisar
  editar produto por produto na mão. Não populado: `installment_overrides` (a tela de admin já
  funciona sozinha, sem precisar de dado pré-semeado para testar).
- Verificado via build de produção real + Playwright, incluindo um **reset completo do zero**
  (`docker compose down -v && up`) para confirmar que o seed novo funciona sem intervenção manual:
  PDP com chips de dosagem navegando para o produto real, bula renderizada (headings/lista/negrito
  via Markdown real), tópicos como bullets, e o fluxo real de vincular/desvincular variação e
  configurar regra de parcelamento testados clicando de ponta a ponta no console interno (não só
  lidos no código). Nenhum erro de console/JS em nenhuma tela testada.

## Ver também

- [[2026-08-31-pagina-de-produto-redesenhada-conforme-demo|ADR da primeira rodada da PDP, mesmo dia]]
- [[../06_Pendencias/alembic-version-ausente-no-postgres-local|Postgres local sem rastreamento Alembic]] — achado desta sessão.