# 2026-07-31 — Banner da home do marketplace vira 100% configurável pelo admin (sem banner / imagens / HTML próprio)

## Contexto

O banner de destaque acima da vitrine (`BannerSlider` em `home-screen.jsx`) era um array `BANNER_SLIDES`
hardcoded no frontend — 3 slides fixos com fundo CSS, texto e CTAs que nunca mudavam sem um deploy.
O usuário pediu para tornar essa área configurável pelo sistema interno, com três modos possíveis:
sem banner nenhum, uma ou mais imagens (banner único ou carrossel), ou HTML/CSS próprio escrito pelo
admin.

## Alternativas consideradas

- **Imagem + texto/CTA sobreposto (como o banner antigo), configurável campo a campo.** Rejeitada como
  modo único — o pedido foi por "artes" (peças prontas, já com texto/desenho embutido), não por um
  formulário de título/subtítulo/botão. O modo `image` ficou deliberadamente "burro": só imagem, texto
  alternativo e um link opcional por slide. Quem quiser texto sobreposto usa o modo `html`.
- **Upload para armazenamento próprio (novo endpoint + `FileAsset`/S3).** Rejeitada — o projeto já tem
  um precedente estabelecido para imagem de vitrine: `marketplace_gallery_urls` em `products-screen.jsx`
  codifica o arquivo como data URL no cliente (`FileReader.readAsDataURL`) e guarda a string direto no
  banco. `home_banner.slides[].image` segue o mesmo padrão — sem endpoint novo, sem storage novo.
- **HTML renderizado sem sanitização, confiando no papel de admin.** Rejeitada. Mesmo sendo um ator
  semi-confiável (mesmo nível de confiança de quem já edita `marketplace_meta`), `dangerouslySetInnerHTML`
  sem filtro é um vetor de XSS persistente contra qualquer visitante do marketplace — e, pior, contra o
  próprio admin, que veria seu próprio HTML rodar com sessão autenticada ao pré-visualizar. Adotada a
  biblioteca `nh3` (bindings Rust do Ammonia) no backend, nova dependência do projeto — sanitização
  acontece **na escrita** (`PortalService._sanitize_home_banner_html`), não só na leitura, então qualquer
  consumidor futuro do setting (marketplace, preview interno, integrações) já recebe HTML seguro.
- **Sanitização com o allowlist puro do nh3 (sem `style`).** Testada primeiro e descartada — o allowlist
  padrão do Ammonia remove o atributo `style` inteiro, o que deixaria qualquer banner sem cor de fundo,
  padding ou border-radius (essencialmente inutilizável para o caso de uso). Ajustado para permitir
  `style`/`class`/`id` em todas as tags, com `filter_style_properties` restringindo a um allowlist fixo
  de propriedades cosméticas (`_HOME_BANNER_ALLOWED_STYLE_PROPERTIES`) — cor, fundo, borda, espaçamento,
  tipografia, flexbox, dimensões. Propriedades de posicionamento (`position`, `top/left/right/bottom`,
  `z-index`) ficam de fora deliberadamente, para um banner nunca poder se sobrepor a outro elemento da
  página (ex.: cobrir o botão de login com uma camada invisível).
- **Preview ao vivo do HTML dentro do console interno (`dangerouslySetInnerHTML` no admin, antes de
  salvar).** Rejeitada — renderizar o HTML *não sanitizado* que o admin acabou de digitar, na própria
  sessão autenticada do console interno, é self-XSS real (um admin colando HTML de terceiros "só para
  ver como fica" executaria JS arbitrário com privilégio de admin). `home-banner-screen.jsx` só oferece
  o textarea + salvar; conferir o resultado é ir ver o marketplace publicado, onde já roda a versão
  sanitizada pelo servidor.

## Decisão

1. **Novo setting `home_banner`** no padrão já existente de `PortalSetting` (`tenant_id + portal_name +
   setting_key`, JSON em `value_json`) — sem migration nova, mesma tabela genérica de sempre.
2. **Schema** (`PortalHomeBannerResponse`/`UpdateRequest` em `schemas/portal.py`): `mode` (`off` |
   `image` | `html`), `slides` (até 8, cada um com `image`, `alt_text`, `link_type` +
   `link_category`/`link_url` conforme o tipo) e `html`. O backend zera `slides` fora do modo `image` e
   `html` fora do modo `html` em `update_home_banner`, então o setting nunca fica com dado órfão do modo
   anterior.
3. **Exposto nos três bootstraps** (`public-bootstrap`, `marketplace/bootstrap` autenticado e
   `internal/bootstrap`) via `_resolve_home_banner`, mesmo padrão de `_resolve_marketplace_meta`.
4. **`PUT /portal/internal/home-banner`** (`ADMIN`/`MANAGER`/`PHARMACIST`, mesmo trio de papéis de
   `marketplace-meta`).
5. **Tela nova** `Catálogo → Banner da vitrine` (`home-banner-screen.jsx`) — sem preview ao vivo do HTML
   (ver acima), mas com preview de imagem real para o modo `image` (a mesma técnica de upload usada em
   Produtos).
6. **`home-screen.jsx`**: `BannerSlider` deixou de depender do array hardcoded — agora recebe
   `banner.slides` e vira carrossel automaticamente só quando há mais de 1 slide (1 slide = banner
   estático, sem setas/dots/autoplay). Modo `off` não renderiza nem a seção (`HomeBanner` retorna
   `null`), sem gap na página.

## Consequências

- Nova dependência de produção: `nh3==0.3.6` (adicionada via `uv add nh3`, sem transitivas pesadas).
- Sem migration — reaproveita a tabela `portal_settings` já existente.
- Banners existentes (os 3 slides hardcoded) somem até o admin configurar algo novo — `mode` default é
  `off`. Aceito conscientemente: este é um ambiente de desenvolvimento, sem tráfego de produção real
  dependendo do banner antigo.
- O modo `html` é a única superfície do marketplace onde HTML vindo de um setting de banco é injetado via
  `dangerouslySetInnerHTML` no lado do cliente — todo o resto do app usa JSX normal. Isso deixa
  `_sanitize_home_banner_html` como o único ponto de verdade contra XSS nesse fluxo; qualquer mudança
  futura no allowlist de tags/atributos/propriedades CSS precisa ser revisada com esse risco em mente.

## Ver também

- [[../02_Documentacao/Modulo_Portal|Módulo Portal]] — endpoint e setting documentados.
- [[2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|ADR dos atalhos reais da home]] — mesma
  sessão, mesma área da home, decisão irmã (categorias reais + atalhos com lógica de verdade).
