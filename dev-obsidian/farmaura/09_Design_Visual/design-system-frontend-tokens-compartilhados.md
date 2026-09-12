# Padrão histórico: design tokens via CSS custom properties, antes compartilhados entre marketplace e internal

**Tipo:** Padrão técnico (documentação de convenção real — **parcialmente superado, ver Atualizações 2026-09-11**)

## Descrição

> ⚠️ Desde a migração visual do console interno (2026-09-11, ver [[../00_Decisoes/2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|ADR]]), os pontos sobre `internal.css` reaproveitar tokens `--fa-*` e sobre o kit de UI compartilhado **não valem mais para o console interno** — ficaram registrados abaixo como histórico do que era verdade até essa data. Ver [[Sistema_de_Design]] para o estado atual de cada superfície.

As duas superfícies do frontend **compartilhavam a mesma linguagem visual de fato**, não só na intenção, até setembro de 2026:

- `internal-entry.js` importava `marketplace.css` **antes** de `internal.css` — `internal.css` reaproveitava as variáveis definidas em `marketplace.css` (`--fa-primary`, `--fa-bg`, `--fa-ink`, `--fa-success`, `--fa-error`, `--fa-r-card`, `--fa-r-btn`, `--fa-gap`, `--fa-font`), sem redefini-las. **Isso não é mais verdade**: `internal.css` hoje tem seu próprio conjunto de tokens semânticos, independente do marketplace.
- CSS puro com custom properties como token — sem Tailwind, CSS Modules ou styled-components. **Isso continua valendo nas duas superfícies.**
- Convenção de nomenclatura de classe: `ph-*` (console interno/farmacêutico), `fa-*` (tokens/utilitários compartilhados). **Ainda vale no marketplace; o console interno migrou para classes/tokens próprios (ver ADR).**
- O kit de componentes de UI reutilizável (`Modal`, `ModalShell`, `Toggle`, `QtyStepper`, `ProductCard`, `brl`) existia em `farmaura/react/marketplace/core/marketplace-components.jsx` e era usado por 17 arquivos do console interno. **O console interno não depende mais dele** — tem seu próprio kit em `farmaura/react/internal/core/internal-ui.jsx`. O marketplace continua usando `marketplace-components.jsx` normalmente.

## Motivo

Documentar o que funcionava (tokens visuais compartilhados) para não reinventar, e registrar a localização real do kit de UI para quem for procurar um componente pronto — mantido como histórico após a migração do console interno, já que explica por que o código antigo (e commits anteriores a 2026-09) referenciava `--fa-*` dentro de `react/internal/`.

## Exceções conhecidas

A localização do kit de UI do marketplace (`marketplace/core` em vez de `react/shared/`) continua um desalinhamento entre nome de pasta e papel real, **agora restrito ao próprio marketplace** — o console interno não tem mais esse acoplamento invisível, por ter kit próprio. Ver [[relocar-ui-kit-compartilhado]] (pendência ainda aberta, mas com escopo reduzido).

## Ver também

- [[reimplementacao-formatador-brl]] — outra pendência sobre o mesmo módulo (`marketplace-components.jsx`).
- [[padronizar-estados-loading-vazio-erro-acessibilidade]] — próxima camada de consistência de UI a padronizar.
- [[../00_Decisoes/2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|ADR da migração visual do console interno]].

## Atualizações

- 2026-09-11: migração visual do console interno para o design "Farmaura Operações" quebrou o compartilhamento de tokens/kit descrito nesta nota — `internal.css` e o kit de UI do console interno deixaram de depender do marketplace. Nota mantida como registro histórico do padrão pré-migração; ver [[Sistema_de_Design]] para o estado atual.
- 2026-08-22: nota movida de `03_Padroes_Politicas/` para `09_Design_Visual/` — o conteúdo é especificamente sobre o sistema de design (tokens compartilhados entre marketplace e internal), não uma política técnica genérica. Ver [[Sistema_de_Design]] para a documentação completa do sistema visual, gerada em `/impeccable document`.
- 2026-07-19: nota criada.
