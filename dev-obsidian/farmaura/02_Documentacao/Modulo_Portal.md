# Módulo Portal (configuração interna, bootstrap, dashboards)

## O que é

`PortalService` é o "catch-all" de configuração por tenant: bootstrap de ambos os portais (marketplace e interno), settings genéricas (`portal_settings`, chave-valor JSON), CRUD de cupons/promoções/reviews/favoritos/assinaturas/health, e os dados agregados simples que alimentam Dashboard/Analytics/Finanças. Não confundir com `operations_service.py` — um scaffold de health-check genérico (`status="ready"`) reaproveitado por vários domínios (PDV, entregas, estoque, prescrições), sem relação com Portal.

## O que é configurável por tenant (via `portal_settings`)

Tabela única `portal_settings` (`UniqueConstraint(tenant_id, portal_name, setting_key)`, JSON serializado, sem schema forte no banco — validação só em Pydantic). Chaves conhecidas: `marketplace_meta`, `home_banner`, `home_brands`, `launch_mode`, `financial_settings`, `construction_costs`, `delivery_pricing`, `delivery_areas`, `pdv_discount_settings`, `cnae_settings`.

## Endpoints (`api/v1/portal.py`)

- Bootstrap: `GET /portal/marketplace/public-bootstrap` (anônimo, rate-limited), `POST /portal/marketplace/first-access` (anônimo), `GET /portal/marketplace/bootstrap` (customer), `GET /portal/internal/bootstrap?store_id=` (só `ADMIN` pode passar `store_id` de outra loja — os demais ficam presos à própria loja, reforçado no service).
- Settings: `PUT /internal/marketplace-meta`; `PUT /internal/home-banner` (banner de destaque da home do marketplace — `mode` `off`/`image`, cada slide com `kind` `image`/`html`, ver ADRs 2026-07-31); `PUT /internal/home-brands` (tira de círculos "marcas em destaque" logo abaixo dos diferenciais — `mode` `off`/`on`, cada círculo com `image`/`alt_text`/`brand_name`, clica e leva pra vitrine filtrada por marca via URL `/brand/<nome>`, ver ADR 2026-08-01); `PUT /internal/launch-mode` (página de "em breve"/contador que substitui a vitrine inteira, sem bypass — ver ADR 2026-08-01); `GET/PUT /internal/delivery-pricing|delivery-areas|pdv-discount-settings|financial-settings`; `GET /internal/address-search`; `GET/PUT /internal/cnae-settings`, `/internal/construction-costs` e `/internal/launch-mode` — **estes três são ADMIN only**, o resto é `ADMIN|MANAGER|PHARMACIST`.
- Cupons: `GET/POST/PUT/DELETE /internal/coupons[/{id}]` (GET aceita `CASHIER` também). Analytics de cupom fica fora deste router, em `/coupon-analytics` — ver [[Modulo_CRM|Módulo CRM]].
- Promoções: `GET/POST/PUT/DELETE /internal/promotions[/{id}]` + `POST /internal/promotions/estimate-audience` (ver [[Modulo_Catalogo|Módulo Catálogo]]).
- Reviews: `GET /products/{ref}/reviews` (público), `POST /products/reviews` (autenticado).
- Favoritos/assinaturas/health: `GET/POST/DELETE /marketplace/favorites[/{ref}]`, `GET/POST/PUT/DELETE /marketplace/subscriptions[/{ref}]` (ver [[Modulo_CRM|Módulo CRM]]), `POST /health/appointments` (aplica promoção de serviço automaticamente + cupom opcional, ver ADR 2026-07-31).
- Serviços de saúde (admin): `GET/POST/PUT /internal/health-services[/{id}]` (`ADMIN`/`MANAGER`/`PHARMACIST`) — CRUD real desde 2026-07-31; antes só existiam 3 linhas semeadas por script.

## Regras de negócio não óbvias

- **`home_banner` é HTML sanitizado no servidor, não na leitura.** `PortalService._sanitize_home_banner_html` roda em `update_home_banner`, antes de persistir — usa `nh3` com: `clean_content_tags={'script','style'}` (remove tag e conteúdo); allowlist de `style` restrito a propriedades cosméticas, **sem nenhuma propriedade `url()`-capable** (`background`/`background-image`/etc. ficam de fora — `filter_style_properties` do nh3 só filtra por nome de propriedade, não inspeciona o valor, então uma `background-image` permitida deixaria `url(javascript:...)` passar sem filtro) e sem `position`/`z-index` (banner nunca cobre outro elemento); `url_schemes` restrito a `http`/`https`/`mailto`/`tel` em todo `href`/`src`. Cada slide de kind `html` é sanitizado individualmente. O carrossel de slides é o único lugar do marketplace onde conteúdo vindo de um setting é injetado via `dangerouslySetInnerHTML`; ver ADRs 2026-07-31.
- **Tenant público resolvido via função SQL `SECURITY DEFINER`** (`resolve_public_marketplace_tenant_id`) — usado pelo bootstrap anônimo; retorna apenas o id, nunca dados de linha. Segunda função no mesmo espírito desde 2026-07-31: `app_private.public_monthly_product_sales(tenant_id, since)` — bypassa RLS só para devolver `product_id`/`month`/`quantity`/`revenue` agregados (nunca `customer_id`/`order_id`), usada por `catalog_service.py::list_most_searched_products` (`GET /catalog/most-searched`, público) para não exigir que um visitante anônimo tenha visibilidade de pedidos de outros clientes.
- **CNAE principal recalculado no backend**, nunca confia no payload: se nenhum vier marcado, a primeira entrada vira principal; só a primeira ocorrência marcada é aceita.
- **Categoria do marketplace = slug estável por tenant** — o mesmo id é usado tanto no menu quanto no campo `cat` de cada produto, para o menu sempre bater com os produtos.
- **Pharmacist exposto ao público é anonimizado** no bootstrap anônimo (e-mail removido), defesa em profundidade adicional ao que o RLS já bloquearia.
- **ROI de construção recalculado a cada leitura** sobre vendas reais desde `opened_at` (nunca armazenado) — mesmo padrão do módulo [[Modulo_Estoque|Estoque]] (Custos de Construção).
- **`first-access` sempre responde genérico**, mesmo se o e-mail não existir, para não vazar quem está cadastrado.
- **Dashboards/Analytics são majoritariamente client-side**: o Portal só fornece `chart_seed` (contagem de pedidos por hora/dia) e `financial_settings`; top produtos, top clientes, regiões, formas de pagamento, validade e ROI mensal são todos calculados no frontend a partir de arrays de *outros* domínios (`orders`, `pdv sales`, `customers`, `inventory`) buscados em paralelo no bootstrap.

## Frontend

- **`settings-screen.jsx`** consome `cnaeSettings`/`saveCnaeSettings`; a alíquota efetiva do Simples Nacional é calculada só no frontend (o backend apenas persiste o regime tributário).
- **`dashboard-screen.jsx`** — 100% `ctx`, sem chamada de rede própria.
- **`analytics-screen.jsx`** — consome `chartSeed`/`financialSettings` do Portal e deriva o resto (produtos, clientes, regiões, pagamentos) de `orders`/`pdvSales`/`customers`/`inventory`.
- **`finance-screen.jsx`** — exporta `FinanceSection`, montada dentro de `analytics-screen.jsx`; nunca lê de `localStorage`, sempre de `/portal/internal/financial-settings`.

## Decisões de arquitetura dignas de nota

- **Padrão "ctx" único**: `internal-app.jsx` (~4000 linhas) faz todo o fetch em paralelo num único `useEffect` e repassa um objeto `ctx` gigante a todas as telas — nenhuma screen busca dados por conta própria (exceção: funções de mutação, definidas no próprio `ctx`).
- **`PortalSetting` como tabela chave-valor genérica** para todas as 7 configurações conhecidas — trade-off deliberado de flexibilidade vs. schema forte no banco.
- **Seleção de loja restrita a `ADMIN`** tanto no frontend quanto reforçada no backend.

## Ver também

- [[Modulo_Catalogo|Módulo Catálogo]] — CRUD de promoções (fica fisicamente aqui, em `portal_service.py`).
- [[Modulo_CRM|Módulo CRM]] — CRUD de cupons e assinaturas (idem).
- [[Modulo_Auth|Módulo Auth]] — `register_marketplace_account`/`request_marketplace_first_access` vivem em `portal_service.py` mas são expostos via rotas de auth.
- [[Visao_Geral|Visão Geral]].

## Atualizações

- 2026-08-02: deploy em produção (migrations `20260729_01`–`20260731_01`, containers
  `farmaura-api`/`farmaura` rebuildados) do lote cupom/promoção server-side + banner/marcas
  configuráveis + `launch_mode` — ver [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]].
  `launch_mode` chegou desativado por padrão (nunca configurado antes); ativação em produção fica a
  cargo do admin real via `/miaura`, a IA não tem a senha de produção.
- 2026-08-01: novo setting `launch_mode` (`PUT /internal/launch-mode`, ADMIN only) e tela
  `launch-mode-screen.jsx` (Marketplace → Modo de lançamento) — quando ativado e a data configurada
  ainda não chegou, `marketplace-app.jsx` substitui a vitrine inteira (sem Header/Footer/carrinho) por
  uma página de contador, para todo visitante, sem bypass para logado/equipe. Console interno nunca é
  afetado. Sem migration — reaproveita `portal_settings`. Ver ADR 2026-08-01-modo-de-lancamento-contador-sem-bypass.
- 2026-08-01: novo setting `home_brands` (`PUT /internal/home-brands`) e tela `home-brands-screen.jsx` (Catálogo → Marcas em destaque) — tira de círculos clicáveis entre os diferenciais e a vitrine de ofertas, cada um levando pra vitrine filtrada por marca via nova rota real `/brand/<nome>` (`ShopScreen mode="brand"`, filtro client-side contra `CatalogItem.brand`, sem endpoint novo de filtro). Clona a arquitetura do `home_banner` só que simplificada (sem HTML mode/crop/tamanho configurável — `border-radius:50%` + `object-fit:cover` resolve o enquadramento). Ver ADR 2026-08-01-marcas-em-destaque-circulos-com-filtro-por-marca.
- 2026-07-31: cada slide de imagem passou a guardar `original_image` (upload cru, console-only — `_resolve_home_banner(include_original=...)` gate mantém isso fora de qualquer bootstrap público) ao lado de `image` (o recorte exibido). "Recortar novamente" e o reencaixe automático de tamanho agora partem sempre da original, evitando degradar a qualidade a cada recorte sucessivo.
- 2026-07-31: banner ganhou autosave (toda importação/ajuste de imagem salva na hora, sem precisar de "Salvar banner"); `mode="off"` não apaga mais `slides` (é só um toggle — botão "Reativar com estes slides" volta pro estado anterior); trocar o tamanho padrão reencaixa automaticamente as imagens já salvas via `fitImageToSize` (mesmo "cover" do cropper, sem modal). Ver ADR 2026-07-31-banner-corte-de-imagem-para-tamanho-padrao (Atualização 2).
- 2026-07-31: tamanho padrão do banner ganhou um seletor visual (`banner-size-modal.jsx`) — presets com preview real da mesma arte de exemplo cortada em cada proporção, mais opção "Personalizado". Substitui os inputs numéricos diretos.
- 2026-07-31: `home_banner` ganhou `target_width`/`target_height` (px, default 1600×480) e um cropper próprio (`image-crop-modal.jsx`, sem lib externa) — todo upload de imagem de slide (individual, em lote, ou "Ajustar" num slide existente) passa por um recorte com proporção fixa antes de virar `image`. Ver ADR 2026-07-31-banner-corte-de-imagem-para-tamanho-padrao.
- 2026-07-31: hardening do sanitizador do `home_banner` HTML — removidas todas as propriedades CSS `url()`-capable do allowlist de `style` (fechava um bypass onde `background-image:url(javascript:...)` passava sem filtro, já que `filter_style_properties` do nh3 só olha o nome da propriedade), `url_schemes` restrito a `http`/`https`/`mailto`/`tel`, `clean_content_tags` explícito para `script`/`style`. Testado ponta a ponta via API real com payloads de XSS (script, onerror, `javascript:` href, iframe, svg onload, CSS url) e um payload estilo SQL injection (confirmado inofensivo — o campo nunca é usado em SQL não parametrizado).
- 2026-07-31: removido o modo `mode="html"` de página inteira (e o campo `html` de nível banner) — redundante com um slide único `kind="html"`. `mode` agora é só `off`/`image`; tela `home-banner-screen.jsx` virou uma barra de 3 botões (Importar imagens / Adicionar bloco HTML / Sem banner) em vez de 3 cartões de modo. Ver ADR 2026-07-31-banner-remove-modo-html-inteiro-simplifica-para-so-slides.
- 2026-07-31: `home_banner.slides[]` ganhou `kind` (`image`/`html`) — dá para importar várias imagens de uma vez e misturar slides de imagem com blocos de HTML próprio no mesmo carrossel. Ver ADR 2026-07-31-banner-import-em-lote-e-slides-mistos-imagem-html e a pendência de hidratação de settings registrada junto.
- 2026-07-31: novo setting `home_banner` (`PUT /internal/home-banner`) e tela `home-banner-screen.jsx` (Catálogo → Banner da vitrine) tornam o banner de destaque da home 100% configurável (sem banner / imagens / HTML sanitizado com `nh3`) — ver ADR 2026-07-31-banner-da-home-configuravel-com-html-sanitizado.
- 2026-07-31: `HealthService` ganhou CRUD administrativo real (`/internal/health-services`) e nova tela `health-services-screen.jsx` em Catálogo; `create_health_appointment` passou a aplicar promoção/cupom de verdade — ver [[../00_Decisoes/2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|ADR]]. Nova função `SECURITY DEFINER` `public_monthly_product_sales`.
- 2026-07-30: novo endpoint `/coupon-analytics` (fora deste router — ver [[Modulo_CRM|Módulo CRM]]).
- 2026-07-25: nota criada — documentação do estado atual do módulo.
