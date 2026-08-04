# 2026-08-02 — Marcas em destaque: sugestão de marca real (datalist), carrossel acima de 7 e layout ponta a ponta

## Contexto

Usuário testou [[2026-08-01-marcas-em-destaque-circulos-com-filtro-por-marca|a feature de marcas em
destaque]] em uso real e pediu três ajustes:

1. Marcas com linha específica (ex.: "Johnson & Johnson" x "Johnson & Johnson Baby") precisavam
   continuar diferenciáveis — o campo "Nome da marca" no console era texto livre, sem nenhuma
   sugestão do catálogo real, arriscando o admin digitar o nome genérico para as duas linhas por
   engano.
2. Limitar a exibição a 7 círculos por vez, com carrossel a partir do 8º em vez de quebrar linha.
3. Layout visual igual ao menu de atalhos/categorias (`QuickCategories`, "Mais buscados"/"Produtos
   salvos"/etc.) — ocupando de ponta a ponta o container, não centralizado — e círculos maiores (76px
   estava pequeno).

## Alternativas consideradas

- **Trocar o campo de marca por um `<select>` vinculado a `brand_id` (mesmo padrão do picker de
  orçamentos em `quotes-screen.jsx::ItemsEditor`).** Rejeitada — exigiria mudar o schema
  (`PortalHomeBrandCircle` só tem `brand_name: str`, sem `brand_id`) e uma migration de dado para os
  círculos já salvos. O filtro da vitrine (`ShopScreen mode="brand"`) já compara só a string
  (`product.brand === route.brand`), então o ganho de ter um `brand_id` de verdade seria zero — a
  string exata já é suficiente pra diferenciar "Johnson & Johnson" de "Johnson & Johnson Baby" desde
  que sejam marcas cadastradas separadamente em Catálogo → Marcas.
- **`<input list="...">` com `<datalist>` sourced de `ctx.brands`.** Adotada — mantém o campo como
  texto livre (zero mudança de schema/backend), mas some com o input de sugestões reais do catálogo
  (mesma fonte que já alimenta o picker de orçamentos: `ctx.brands`, carregado uma vez em
  `internal-app.jsx::refreshBrands`, filtrado por `active && !discarded`). Resolve o caso relatado sem
  inventar uma nova abstração — o `<datalist>` mostra as duas entradas distintas quando o admin digita
  "Johnson", e o texto de ajuda da tela passou a explicitar que a diferenciação só existe se as linhas
  estiverem cadastradas como marcas separadas no catálogo.
- **Reduzir o limite total configurável de círculos (hoje 16, `PortalHomeBrandsResponse.circles`) para
  7.** Rejeitada — o pedido foi sobre exibição ("no máximo 7... podendo ser possível criar um
  carrossel"), não sobre o total cadastrável. Limite de schema (16) mantido; o corte em 7 é só do lado
  do componente de exibição (`BrandCircles` em `home-screen.jsx`).
- **Carrossel novo do zero vs. reaproveitar o idioma já existente.** Reaproveitado o mesmo padrão de
  `CartRecommendations` (`cart-screen.jsx`): `trackRef` + `scrollBy` + setas absolutas + `fa-noscroll`
  + `scroll-snap-type: x proximity` — é o único precedente de rail horizontal já testado no
  marketplace, evita inventar uma segunda técnica de carrossel no mesmo frontend.

## Decisão

1. **`home-brands-screen.jsx`**: campo "Nome da marca" ganhou `list="fa-home-brand-names"` +
   `<datalist>` com os nomes distintos de `ctx.brands` (`active && !discarded`, ordenados
   `localeCompare('pt-BR')`). Texto de ajuda da tela atualizado explicando a diferenciação de linhas
   por marca. Nenhuma mudança de schema/backend.
2. **`home-screen.jsx::BrandCircles`**: `BRAND_CIRCLES_VISIBLE = 7`. Até 7 círculos, renderiza
   `.fa-brands-strip` estático (mesma técnica de `.fa-quickcats`). Acima de 7, renderiza
   `.fa-brand-carousel` — rail com scroll horizontal + snap + setas prev/next (`scrollBy` de 90% da
   largura visível do track por clique), reaproveitando o idioma de `CartRecommendations`.
3. **CSS (`marketplace.css`)**: `.fa-brands-strip` trocou `justify-content: center` por
   `justify-content: space-between` (ponta a ponta, igual `.fa-quickcats`; centraliza só em
   `max-width: 640px`, mesmo breakpoint do menu de atalhos). Círculo cresceu de 76px → 112px
   (desktop) e 62px → 84px (mobile, `max-width: 420px`); tile de 88px → 132px / 72px → 104px.
   Setas do carrossel: mesmo visual de `.fa-slider-arrow` (círculo branco, sombra), ocultas em
   `max-width: 640px` (mobile depende de swipe nativo, mesmo comportamento do rail de
   `CartRecommendations`).

## Consequências

- Sem migration, sem mudança de contrato de API — puramente frontend (schema/rota do backend
  intocados).
- Verificado ponta a ponta no stack de dev: criadas duas marcas de teste ("Johnson & Johnson" /
  "Johnson & Johnson Baby") e 9 círculos via API — confirmado via Playwright que o `<datalist>`
  carrega as 31 marcas ativas do tenant (incluindo as duas de teste como opções distintas), que o
  layout fica ponta a ponta com círculos maiores, e que as setas do carrossel de fato fazem
  `scrollLeft` mudar (0 → 136 → 0 num teste de next/prev). Marcas de teste marcadas como
  `is_discarded=true` depois (não há endpoint de exclusão real em `/brands`, só `PATCH .../discard`)
  e `home_brands` revertido para `mode="off"`/`circles: []` ao final — nenhum dado sintético ficou
  configurado no ambiente de dev.

## Ver também

- [[2026-08-01-marcas-em-destaque-circulos-com-filtro-por-marca|ADR original da feature]].
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]].
