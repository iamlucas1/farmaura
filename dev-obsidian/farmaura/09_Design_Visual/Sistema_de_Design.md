---
cssclasses: ia-nota
---

# Sistema de Design: Farmaura

Documentação viva do sistema visual real (não planejado) que já está implementado em `farmaura/react/marketplace/` e `farmaura/react/internal/`, extraída diretamente do CSS de produção. A especificação machine-readable canônica (frontmatter YAML + tokens) vive em `farmaura/DESIGN.md`, com o sidecar `farmaura/.impeccable/design.json` (ramps tonais, componentes HTML/CSS prontos, narrativa) — gerados via `/impeccable document`. Esta nota é a versão de leitura humana, em português, cruzada com o resto do cofre.

## Escopo: uma linguagem visual, duas superfícies (com dois sistemas de token desde 2026-09)

`marketplace` (cliente final) e `internal` (farmacêutico/operações) eram, até setembro de 2026, **uma linguagem visual só**: `internal.css` importava depois de `marketplace.css` e reaproveitava suas custom properties (`--fa-*`) sem redefini-las (ver histórico em [[design-system-frontend-tokens-compartilhados]]).

Isso mudou com a migração visual completa do console interno para o design "Farmaura Operações" (protótipo Claude Artifact do usuário), fasada em lotes A→H + Fase Z de limpeza — ver [[../00_Decisoes/2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|ADR da migração]]. Hoje **cada superfície tem seu próprio conjunto de tokens**:

- `marketplace.css` continua com a paleta "Warm Apothecary" original e os tokens `--fa-*` descritos abaixo — inalterado.
- `internal.css` passou a ter tokens semânticos próprios (`--bg`, `--surface`, `--surface-2`, `--text-primary/secondary/muted`, `--border/-strong`, `--brand/-ink`, `--accent(+variantes)`, `--good/-warning/-critical/-info/-serious(+soft)`, `--radius-sm/md/lg/pill`, `--shadow-sm/md/lg`), com suporte nativo a tema claro/escuro de 3 estados (`:root`, `@media(prefers-color-scheme:dark)`, `:root[data-theme="dark"]`) e densidade ajustável em runtime (`data-density="compact|regular|comfy"`). A ponte de compatibilidade `--fa-*` que existiu durante a migração (mapeando os tokens legados para os novos) e o arquivo `internal-legacy.css` foram removidos por completo na Fase Z — não existe mais nenhuma referência a `--fa-*` dentro de `react/internal/`.
- O kit de componentes reutilizável do console interno também mudou de lugar: em vez de consumir `marketplace-components.jsx`, o console interno agora tem seu próprio kit em `farmaura/react/internal/core/internal-ui.jsx` (`Icon`, `Badge`, `StatCard`, `KpiChip`, `PillNav`, `Modal`, `Drawer`, `Field`, `FormGrid`, `EmptyState`, `SearchInput`, `SwitchToggle`, `RecoverModal`, `confirmAction`, `showToast`). Isso resolve a pendência [[../06_Pendencias/relocar-ui-kit-compartilhado|relocar-ui-kit-compartilhado]] **para o console interno especificamente** — o marketplace ainda usa `marketplace-components.jsx` normalmente, então a pendência permanece aberta para essa superfície.

Qualquer mudança na paleta do marketplace não afeta mais o console interno, e vice-versa — as duas camadas de token são independentes a partir desta migração.

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

Kit de UI reutilizável do marketplace (`Modal`, `ModalShell`, `Toggle`, `QtyStepper`, `ProductCard`, `brl`) vive em `farmaura/react/marketplace/core/marketplace-components.jsx` — não em `react/shared/`, apesar do nome. Ver [[relocar-ui-kit-compartilhado]] (pendência ainda válida para o marketplace). O console interno **não consome mais este kit**: desde a migração de 2026-09, tem o próprio kit em `farmaura/react/internal/core/internal-ui.jsx` (ver seção acima).

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

- 2026-09-20: o tema (claro/escuro/automático) do console interno passou a ser escolhido por usuário e gravado na conta (`users.ui_theme`), aplicado via `data-theme` na raiz — sem atributo segue `prefers-color-scheme`. Corrigidas as faixas de fidelidade (`.tier-*`), que aplicavam as cores escuras no modo automático mesmo com sistema claro. O marketplace continua só claro. Ver [[../00_Decisoes/2026-09-20-tema-claro-escuro-preferencia-por-usuario|ADR]].
- 2026-09-14: `--accent` do console interno deixou de ser teal (`#0f6b60`) e passou a ser o mesmo vermelho do `--brand`/marketplace (`#a11017`, "Vinho Aura") — pedido explícito do usuário para as duas superfícies lerem como o mesmo produto. Os arquivos de token continuam tecnicamente independentes (nenhuma importação cruzada foi reintroduzida), só o *valor* da cor de ação primária passou a coincidir. Tema escuro ganhou um vermelho próprio (`#e2636d`), deliberadamente distinto do `--critical` escuro para preservar a regra "dois vermelhos". Ver [[../00_Decisoes/2026-09-14-accent-do-console-interno-volta-a-ser-vermelho|ADR]].
- 2026-09-11: migração visual completa do console interno para o design "Farmaura Operações" concluída (lotes A→H + Fase Z) — `internal.css` deixou de compartilhar tokens `--fa-*` com o marketplace e ganhou seu próprio conjunto semântico (com tema escuro e densidade nativos); ponte de compatibilidade e `internal-legacy.css` removidas; kit de UI do console interno migrou para `internal-ui.jsx` próprio, deixando de depender de `marketplace-components.jsx`. Ver [[../00_Decisoes/2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|ADR]].
- 2026-08-22: nota criada a partir de `/impeccable document` — extração dos tokens reais de `marketplace.css`/`internal.css`, confirmação de linguagem descritiva com o usuário (North Star "Warm Apothecary", regra de anti-referência de paleta, sensação "confiante e acolhedor"), e consolidação da documentação de design pré-existente nesta pasta.