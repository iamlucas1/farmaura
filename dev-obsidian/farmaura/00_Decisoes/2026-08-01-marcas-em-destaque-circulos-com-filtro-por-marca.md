# 2026-08-01 — Nova seção "Marcas em destaque" (círculos clicáveis) entre os diferenciais e a vitrine de ofertas

## Contexto

Pedido do usuário: uma nova seção configurável no console interno, no mesmo espírito do banner da
home (`home_banner`), posicionada entre a seção `Differentials` (Entrega/Cashback/Retirada/Receita/
Parcelamento) e "Produtos com até 95% de desconto". Só círculos com imagem de marca, cada um agindo
como um botão que leva para a vitrine já filtrada pela marca selecionada — o filtro precisava ser
"passado via url".

## Decisão

Clonar a arquitetura do `home_banner` (setting `PortalSetting` chave-valor, bootstrap-driven, tela
própria no console) só que bem mais simples — sem HTML mode, sem crop tool, sem `target_width/height`
configurável, sem `original_image` — porque o formato final é sempre um círculo (`border-radius: 50%`
+ `object-fit: cover` resolve qualquer enquadramento sem precisar de recorte manual).

### Backend

- Novo setting `home_brands` (`SETTING_KEY_HOME_BRANDS`), schemas em `app/schemas/portal.py`:
  - `PortalHomeBrandCircle`: `id`, `image` (data URI, valida `startswith('data:image/')` via
    `field_validator` — bloqueia `javascript:`/outros esquemas em `<img src>`), `alt_text`,
    `brand_name`.
  - `PortalHomeBrandsResponse`: `mode` (`off|on`), `circles` (máx. 16).
  - `PortalHomeBrandsUpdateRequest(PortalHomeBrandsResponse)`.
- `PortalService._resolve_home_brands`/`update_home_brands` — mesmo contrato "`mode=off` preserva
  `circles`" do banner (é um toggle de exibição, não um delete).
- `home_brands` adicionado às 3 bootstrap responses (`PortalInternalBootstrapResponse`,
  `PortalMarketplaceBootstrapResponse`, `PortalMarketplacePublicBootstrapResponse`) — sem gate de
  "console-only" porque não existe `original_image` aqui, todo o payload já é seguro para o público.
- `PUT /internal/home-brands` — mesma permissão do banner (`ADMIN`/`MANAGER`/`PHARMACIST`).

### Filtro por marca — reaproveitando o roteamento real por URL do marketplace

O marketplace já usa `react-router-dom` de verdade (`BrowserRouter`, não estado em memória) —
`parseMarketplaceRoute`/`buildMarketplacePath` em `marketplace-app.jsx` já tratavam `category` como
segmento de path (`/category/:cat`). Adicionado o mesmo tratamento para `brand`:
`MARKETPLACE_ROUTE_RESERVED_KEYS` ganhou `'brand'`, `buildMarketplacePath` empurra
`encodeURIComponent(route.brand)` como segmento quando `route.name === 'brand'`, e
`parseMarketplaceRoute` decodifica `segments[1]` para `route.brand` — resultando em URLs limpas tipo
`/brand/Asseio`, que funcionam também para quem chega direto de um link externo (não só navegação
interna via `onNav`).

**Não existe endpoint de filtro por marca no backend** — o catálogo já é buscado por inteiro no
bootstrap e filtrado 100% client-side (mesmo padrão de `category`). `ShopScreen` (`shop-screen.jsx`)
ganhou `mode === 'brand'`: `products.filter((p) => p.brand === route.brand)`, comparado contra
`CatalogItem.brand` (que já vem de `Brand`/`InventoryItem.brand_name` — o mesmo campo usado no picker
de marca dos orçamentos de compra, ver commits de brand-linking anteriores). **O nome da marca no
círculo precisa bater exatamente com o campo `brand` do produto** — é texto livre no admin, não um
seletor vinculado à tabela `Brand`; documentado como aviso na própria tela do console.

### Frontend

- Tela nova `home-brands-screen.jsx` (Catálogo → Marketplace → "Marcas em destaque" no menu interno,
  ícone `plusCircle`) — bem mais enxuta que `home-banner-screen.jsx`: cada círculo é upload de logo
  (autosave silencioso ao enviar, mesmo padrão do banner) + campo de texto "Nome da marca" + "Texto
  alternativo" opcional + remover. Sem modal de recorte.
- `BrandCircles` em `home-screen.jsx`, montado entre `<Differentials>` e `<div className="fa-feed">`
  — `mode !== 'on'` ou lista vazia não renderiza nada (mesmo padrão null-safe do `HomeBanner`).
- CSS `.fa-brands-strip`/`.fa-brand-circle*` em `marketplace.css`, logo após o bloco `.fa-diff-grid`
  — tira centralizada com `flex-wrap`, círculo com `box-shadow` de anel (troca de cinza pro
  `--fa-primary` no hover + leve `translateY`), rótulo com o nome da marca truncado por `ellipsis`.

## Consequências

- Nenhuma migration — mais um setting `PortalSetting` schemaless, mesmo trade-off já aceito para
  `home_banner` e as outras 6 chaves conhecidas.
- Rota `brand` nova no roteador do marketplace — qualquer link externo `/brand/<nome>` já funciona
  sem precisar passar pela home.
- Validação de `image` como `data:image/...` é mais estrita que o `home_banner` (que aceita URL
  externa também) — decisão deliberada: círculos de marca são sempre logo enviado pelo admin, nunca
  um link direto pra imagem externa, então não havia motivo pra abrir essa superfície.
- Ver [[Modulo_Portal|Módulo Portal]] (Atualizações) para o resumo curto e [[2026-07-31-banner-da-home-configuravel-com-html-sanitizado|ADR do banner]] para o precedente arquitetural completo que esta feature clona.
