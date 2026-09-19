---
cssclasses: ia-nota
---

# 2026-08-29 — Correção: gradiente e arcos decorativos do hero SÃO possíveis, via classes seguras

## Contexto

O ADR [[2026-08-29-seed-banner-home-hero-e-limite-do-sanitizador|anterior, do mesmo dia]] concluiu
que o gradiente 135° e os três círculos decorativos (`.hero-arc`) do `.hero` do demo não eram
reproduzíveis pelo recurso real de banner-HTML, porque `PortalService._sanitize_home_banner_html`
deliberadamente não libera `position`/`background-image`/gradiente no atributo `style` — e o seed
foi escrito com uma cor de fundo plana, sem os arcos, como a aproximação possível.

O usuário revisou o resultado e apontou, corretamente, que margens internas (topo/base), o
degradê e os círculos ainda estavam diferentes do demo — ou seja, a aproximação não bastava.

## O que a investigação anterior errou

A conclusão de "não é possível" estava certa só para o caminho de **`style` inline livre**. Ela
não considerou o caminho do atributo `class`: o sanitizador libera `class` em qualquer tag sem
restringir os nomes (`attributes['*'] = ... | {'style','class','id'}`) — e como as classes CSS
que o app realmente aplica vêm do **nosso próprio stylesheet** (`marketplace.css`, nunca
controlado por input de admin), dar a uma classe como `fa-hero-decorative` um gradiente e arcos
reais não reabre nenhuma das duas brechas que motivaram o allowlist restrito:
- não há `position`/`background-image` livre no `style` do admin — continuam bloqueados;
- o valor real do gradiente/arcos é fixo no CSS do nosso repositório, não em texto que o admin
  digitou, então não há `url()` nem posicionamento arbitrário controlável por quem edita o banner.

Também foi encontrada, na mesma verificação, uma causa raiz para a diferença de margens: o slide
HTML estava dentro do mesmo contêiner `.fa-slide-item` usado pelos slides de imagem
(`min-height: clamp(220px,26vw,340px)`, pensado pra manter a proporção de um carrossel de
imagens) — isso espremia/esticava o padding do hero pra caber nessa faixa de altura fixa, em vez
de deixar o próprio padding do hero (`clamp(34px,5vw,56px)`, igual ao demo) definir a altura da
caixa, como acontece no demo.

## Decisão

- `marketplace.css`: nova classe `.fa-hero-decorative` (+ `.fa-hero-arc`/`.fa-hero-kicker`/
  `.fa-hero-title`/`.fa-hero-sub`/`.fa-hero-actions`/`.fa-hero-btn`) reproduzindo o `.hero` do
  demo 1:1 — gradiente `linear-gradient(135deg, var(--fa-primary), var(--fa-primary-ink))`, três
  arcos posicionados exatamente como no demo, e os dois botões de ação com `border-radius:
  var(--fa-r-btn)` (o token real do app, não pill — o demo também não usa pill aqui, só um botão
  moderadamente arredondado; a preferência do usuário por mais arredondamento, dita numa rodada
  anterior, foi sobre avatar/ícone do carrinho, não sobre este componente).
- `.fa-slide-item.fa-slide-item--html` (nova modificadora, aplicada em `BannerSlider`,
  `home-screen.jsx`) zera o `min-height` herdado do slot genérico de carrossel, deixando o
  próprio conteúdo HTML (e o `min-height:280px` de `.fa-hero-decorative`) decidir a altura —
  corrige as margens internas.
- Espaço entre o header e o hero (`home-screen.jsx`, wrapper do `HomeBanner`) ajustado de 28px pra
  20px, igual ao `margin-top` real do `.hero` no demo.
- `scripts/seed.py`: `_HOME_BANNER_HTML` reescrito para usar essas classes (`class=`) em vez de
  `style=` inline — nenhum estilo inline sobra no HTML seedado.

Verificado via screenshot (desktop 1440px e mobile 390px, `localhost:3000` pós-rebuild): gradiente
visível, três arcos clipados dentro do card, padding interno consistente com o demo em ambos os
tamanhos.

## Consequências

- O gap de fidelidade visual registrado no ADR anterior está fechado — sem abrir mão da defesa
  contra `url()`/`position` em `style` livre, que continua intacta.
- Qualquer admin que queira esse exato visual "hero" pode reusar `class="fa-hero-decorative"` (e
  as classes filhas) no editor de banner do console — documentado aqui como o padrão esperado
  pra esse tipo de slide, não como uma classe de uso interno apenas.
- Nenhuma migration necessária.

## Ver também

- [[2026-08-29-seed-banner-home-hero-e-limite-do-sanitizador|ADR original]] — mantido como registro histórico da primeira tentativa; esta nota é a correção, não uma edição daquele.