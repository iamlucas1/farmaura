# 2026-08-23 — Correções da critique de design (2026-08-22) e dois bugs de especificidade/containing-block não documentados

## Contexto

Sequência direta do levantamento em [[../09_Design_Visual/Critique_2026-08-22|Critique de Design 2026-08-22]]: o usuário pediu para corrigir todos os pontos levantados no marketplace e no portal interno, com um commit de checkpoint antes (ver commit "Checkpoint before design-critique fixes"). Ao verificar empiricamente os fixes de tipografia/cor com `getComputedStyle` em vez de confiar só em leitura de código, dois bugs reais e não documentados apareceram — nenhum dos dois tinha sido pego pela dupla avaliação (LLM + scanner determinístico) da critique original, porque ambos exigem inspecionar comportamento em runtime, não o CSS/JSX fonte isoladamente.

## Decisão

Corrigidos todos os itens P0/P1/P2 da critique nas duas superfícies, mais a maioria dos P3, incluindo dois achados novos:

### 1. Bug de especificidade de fonte (`<body style="font-family: Montserrat">`)
Já coberto pela critique — `marketplace.html`/`internal.html` tinham um `style` inline no `<body>` que sempre vence a regra `body { font-family: var(--fa-font) }` do CSS externo, independente de a Nunito Sans carregar ou não. Removido o inline style e o carregamento das fontes Montserrat/Manrope (não usadas em nenhum CSS real).

### 2. NOVO — Paleta de cor real da produção não era a documentada em DESIGN.md
`marketplace-app.jsx` aplica um objeto `rootStyle` via `style={{...}}` diretamente no `#fa-root`, sobrescrevendo `--fa-primary`/`--fa-vital`/`--fa-rose`/`--fa-font`/`--fa-aura` por cima do `:root` do CSS. O valor vem de `TWEAK_DEFAULTS` (mecanismo de "Tweaks" ao vivo, pensado para prototipagem) — e o default gravado no arquivo era `paletteName: "Vermelho Vital"` (`#A11017`) e `font: "Montserrat"`, não `"Vinho Aura"` (`#7A0D16`) nem `"Nunito Sans"`. Como `useTweaks()` é só um `useState(defaults)` sem persistência real, **todo usuário real recebia essa paleta por padrão**, não a documentada. Confirmado via `getComputedStyle` antes e depois do fix (`rootComputedPrimary` mudou de `#A11017` para `#7A0D16`).

Hipótese mais provável: o marcador `/*EDITMODE-BEGIN*/.../*EDITMODE-END*/` ao redor de `TWEAK_DEFAULTS` indica que esse bloco é reescrito automaticamente pela própria ferramenta de edição ao vivo quando alguém salva um experimento — o preset "Vermelho Vital" provavelmente foi uma exploração que acabou virando o default de produção sem ninguém perceber. Corrigido `TWEAK_DEFAULTS` para `paletteName: "Vinho Aura"`, `font: "Nunito Sans"`, `aura: 50` (batendo com o `:root` do CSS), e sincronizado `DESIGN.md`/`.impeccable/design.json` com os valores reais.

**Risco para o futuro:** esse mecanismo de Tweaks continua existindo e continua podendo divergir de novo se alguém salvar um experimento sem reverter. Não há teste automatizado que pegue isso — só inspeção visual/`getComputedStyle` real pegaria.

### 3. NOVO — Menu mobile do marketplace vazava conteúdo da página por trás (bug de containing block, não só "opacidade")
A critique descreveu isso como "backdrop do drawer mobile não é totalmente opaco". Na prática o bug é mais sério: `MobileDrawer` (em `marketplace-chrome.jsx`) é renderizado **dentro** de `<header className="fa-header">`, e `.fa-header` tem `backdrop-filter: blur(14px) saturate(150%)`. Qualquer `backdrop-filter`/`filter`/`transform` num ancestral cria um novo *containing block* para descendentes `position: fixed` — então o `inset: 0` do drawer não resolvia contra o viewport, resolvia contra a caixa (curta) do próprio `<header>`. O painel do drawer ficava com altura real curta, mas o **conteúdo** (links de navegação) continuava overflowing visualmente para baixo dessa caixa curta, sem nenhum fundo opaco atrás — daí o conteúdo da home aparecer "por trás" do texto do menu.

Corrigido via `createPortal(node, document.body)` — o mesmo padrão que `ModalShell` já usa em `marketplace-components.jsx`, e pelo mesmo motivo. Precisou também subir o `z-index` do drawer de 100 para 500 (acima do 400 do `.fa-header`), já que ao portar para `<body>` o drawer passou a competir de verdade no mesmo stacking context do header sticky.

## Alternativas consideradas

- **Só re-aplicar opacidade no painel do drawer** — não resolveria nada, o painel já tinha `background: var(--fa-bg)` opaco; o bug era de posicionamento/containing-block, não de cor.
- **Mover o `<MobileDrawer>` para fora do `<header>` no JSX em vez de portal** — funcionaria, mas exigiria reestruturar onde o estado `drawer` vive e como ele é passado; o portal é a correção mínima, consistente com o padrão já estabelecido pelo `ModalShell`.

## Consequências

- `farmaura/DESIGN.md` e `.impeccable/design.json` atualizados para refletir os valores reais agora corrigidos (`--fa-ink-3`, `--fa-warn-ink` novo, paleta).
- Cobertura completa dos itens P0–P2 da critique nas duas superfícies (ver [[../09_Design_Visual/Critique_2026-08-22|nota da critique]] para a lista original); a maioria dos P3 também. Detalhe screen-a-screen não repetido aqui — a nota da critique já tem os P0-P3 com contexto de produto.
- **Pendência aberta, não resolvida aqui:** a migração completa dos ~33 grids inline ad-hoc do console interno para `var(--fa-gap)`/`var(--fa-card-pad)` não foi feita — só o mecanismo (`data-density` no `#ph-root`, controle no painel de Tweaks) foi religado. Screens individuais continuam com gaps hardcoded que não respondem ao dial de densidade. Registrar como possível item de `06_Pendencias/` se o time quiser priorizar depois.
- Nenhuma migration de banco ou mudança de contrato de API — mudanças restritas a `farmaura/react/`, `farmaura/*.html`, `farmaura/vite.config.js`, `farmaura/public/` (novo), `farmaura/DESIGN.md`, `farmaura/.impeccable/`.

## Ver também

- [[../09_Design_Visual/Critique_2026-08-22|Critique de Design 2026-08-22]] — lista completa original, priorizada.
- [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]] — atualizado para refletir os tokens corrigidos.
