# Sistema de Design: Farmaura

Documentação viva do sistema visual real (não planejado) que já está implementado em `farmaura/react/marketplace/` e `farmaura/react/internal/`, extraída diretamente do CSS de produção. A especificação machine-readable canônica (frontmatter YAML + tokens) vive em `farmaura/DESIGN.md`, com o sidecar `farmaura/.impeccable/design.json` (ramps tonais, componentes HTML/CSS prontos, narrativa) — gerados via `/impeccable document`. Esta nota é a versão de leitura humana, em português, cruzada com o resto do cofre.

## Escopo: uma linguagem visual, duas superfícies

`marketplace` (cliente final) e `internal` (farmacêutico/operações) **não são dois sistemas de design** — são duas aplicações de um só. `internal.css` importa depois de `marketplace.css` e reaproveita suas custom properties (`--fa-*`) sem redefini-las; isso já estava confirmado em [[design-system-frontend-tokens-compartilhados]] (nota movida para esta pasta, ver abaixo). Qualquer mudança na camada de tokens compartilhada precisa funcionar nas duas superfícies.

## North Star: "Warm Apothecary"

O próprio código já nomeia as cores em português (`Vinho Aura`, `Vermelho Vital`, `Rosé Cuidado`, `Off-white Clínico`, `Bege Atalho`, `Grafite Quente`) e tem um token literal de intensidade decorativa, `--fa-aura`. A escolha de identidade confirmada com o usuário: uma farmácia calorosa — vinho de confiança + branco clínico quente + glow rosé de cuidado — deliberadamente **não** o azul/verde estéril genérico de software de farmácia. Ver a regra nomeada abaixo.

## Cores

Paleta quente vinho + rosé sobre fundo off-white clínico.

| Nome | Hex | Papel |
|---|---|---|
| Vinho Aura | `#7A0D16` | Primária — botões, nav ativo, sidebar inteira do console interno |
| Vinho Aura, ink | `#5C0910` | Texto sobre fundo rosé |
| Vermelho Vital | `#C81D28` | Urgência/promoção — superpromoção, badge de carrinho, contadores |
| Rosé Cuidado | `#FFD6D9` / `#FFEDEE` | Hover/foco "de cuidado" — glow de input/busca, favoritos |
| Bege Atalho | `#F6F1E8` | Tiles de atalho/categoria rápida |
| Off-white Clínico | `#FAF7F5` | Fundo de página |
| Grafite Quente | `#2B1A1A` / `#6B5757` / `#9A8A8A` | Texto (principal / muted / faint) |
| Cinza Névoa | `#E8E1DF` / `#F1EBE9` | Bordas, divisores, fundo neutro |
| Success / Warn / Error / Info | `#2E7D5B` / `#F2A03D` / `#B3261E` / `#3A6EA5` | Estados semânticos |

**Regra "Sem paleta estéril":** nunca introduzir o azul/verde genérico de farmácia como cor primária ou de destaque — Vinho Aura e Vermelho Vital são as únicas duas cores de marca. Confirmado como escolha intencional de identidade, não limitação de paleta.

**Regra "Dois vermelhos":** Vinho Aura (confiança, padrão) e Vermelho Vital (urgência, promoção) nunca são intercambiáveis.

## Tipografia

Fonte única para tudo: **Nunito Sans** (`--fa-font`), do display ao label — sem uma segunda fonte de display. **Spline Sans Mono** é reservado para preços, códigos de pedido/retirada e tracking (sinal de precisão). Montserrat e Manrope são carregadas no `<head>` do HTML como fallback pré-montagem do React, mas **não são referenciadas em nenhum CSS** — tratar como não usadas, não como opção de design disponível.

Hierarquia: Display (800, `clamp(28px,4vw,46px)`) → Headline (800, `clamp(22px,2.4vw,30px)`) → Title (700, 18px) → Body (400, 14.5px) → Label/eyebrow (700, 12px, uppercase, cor Vermelho Vital) → Mono (600, 13px).

## Layout & Densidade

Marketplace: wrap central de até `1240px`. Internal: sidebar fixa `256px` (colapsa para `76px`) + área principal até `1320px`. Densidade é um token de primeira classe e ajustável em runtime: `data-density="compact|regular|comfy"` no root reajusta gap, padding de card e largura mínima de grid juntos (12/20/28px e 180/220/268px).

## Elevação

Flat por padrão; sombra só em elevação real (hover, dropdown, modal), sempre tingida de Grafite Quente (nunca preto puro) — `sm`/`md`/`lg` documentadas em `farmaura/DESIGN.md`.

## Formas

Raios generosos e nunca cantos vivos: `10px` input, `12px` botão, `16px` card, `20px` ícone, `999px` (pill) para chip/badge/segmentado. Todos escalam juntos por um único multiplicador (`--fa-radius-scale`).

## Componentes principais

Botões (primary/vital/ghost/soft), chips e badges (com o badge de "superpromoção" como única animação pulsante deliberada — `faSuperPulse`, respeita `prefers-reduced-motion`), cards de produto (3 variantes: padrão, image-led, lista horizontal), inputs com glow rosé no foco, navegação (header do marketplace vs. sidebar sólida vinho do console interno). Especificação completa com HTML/CSS prontos para reutilização está no sidecar `farmaura/.impeccable/design.json`.

Kit de UI reutilizável de fato (`Modal`, `ModalShell`, `Toggle`, `QtyStepper`, `ProductCard`, `brl`) vive em `farmaura/react/marketplace/core/marketplace-components.jsx` e é consumido por 17 arquivos do console interno — não em `react/shared/`, apesar do nome. Ver [[relocar-ui-kit-compartilhado]].

## O que já existia documentado antes desta pasta

Auditoria neste levantamento encontrou:

- [[design-system-frontend-tokens-compartilhados]] — nota de padrão técnico já existente confirmando o compartilhamento real de tokens entre as duas superfícies; **movida** de `03_Padroes_Politicas/` para cá, por ser especificamente sobre o sistema de design, não uma política genérica.
- [[padronizar-estados-loading-vazio-erro-acessibilidade]] (`06_Pendencias/`) — loading/vazio/erro seguem convenção informal (classe `ph-empty`, sufixo `xError`), sem componente `<Spinner>`/`<EmptyState>`/`<ErrorState>` compartilhado forçando consistência; permanece em Pendências por ser débito técnico, não um fato do sistema visual atual.
- [[relocar-ui-kit-compartilhado]] (`06_Pendencias/`) — kit de UI mal localizado (ver acima); permanece em Pendências pelo mesmo motivo.
- [[reimplementacao-formatador-brl]] (`06_Pendencias/`) — pendência sobre o mesmo módulo do kit de UI.

Nenhuma outra documentação de sistema visual foi encontrada no cofre para Farmaura antes deste levantamento.

## Ver também

- `farmaura/DESIGN.md` — especificação machine-readable canônica (frontmatter + 8 seções).
- `farmaura/.impeccable/design.json` — sidecar com ramps tonais, narrativa e componentes HTML/CSS prontos.
- [[Critique_2026-08-22|Critique de design 2026-08-22]] — auditoria de UX/hierarquia/CTAs/SEO que encontrou onde a implementação diverge deste documento (ex.: bug de especificidade de fonte, regra dos "dois vermelhos" violada no checkout).
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]] — configuração de banner/marcas/ofertas que consome estes tokens.
- [[../Hub|Hub do projeto Farmaura]]

## Atualizações

- 2026-08-22: nota criada a partir de `/impeccable document` — extração dos tokens reais de `marketplace.css`/`internal.css`, confirmação de linguagem descritiva com o usuário (North Star "Warm Apothecary", regra de anti-referência de paleta, sensação "confiante e acolhedor"), e consolidação da documentação de design pré-existente nesta pasta.
