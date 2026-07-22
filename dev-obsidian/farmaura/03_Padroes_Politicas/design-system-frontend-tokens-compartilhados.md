# Padrão confirmado: design tokens via CSS custom properties, compartilhados entre marketplace e internal

**Tipo:** Padrão técnico (documentação de convenção real)

## Descrição

As duas superfícies do frontend **compartilham a mesma linguagem visual de fato**, não só na intenção:

- `internal-entry.js` importa `marketplace.css` **antes** de `internal.css` — `internal.css` reaproveita as variáveis definidas em `marketplace.css` (`--fa-primary`, `--fa-bg`, `--fa-ink`, `--fa-success`, `--fa-error`, `--fa-r-card`, `--fa-r-btn`, `--fa-gap`, `--fa-font`), sem redefini-las.
- CSS puro com custom properties como token — sem Tailwind, CSS Modules ou styled-components.
- Convenção de nomenclatura de classe: `ph-*` (console interno/farmacêutico), `fa-*` (tokens/utilitários compartilhados).
- O kit de componentes de UI reutilizável de fato (`Modal`, `ModalShell`, `Toggle`, `QtyStepper`, `ProductCard`, `brl`) existe e é usado por 17 arquivos do console interno — mas vive em `farmaura/react/marketplace/core/marketplace-components.jsx`, **não** em `farmaura/react/shared/` (que só tem infra: api-client, access-control, observability, cache).

## Motivo

Documentar o que já funciona (tokens visuais realmente compartilhados) para não reinventar, e registrar a localização real do kit de UI para quem for procurar um componente pronto.

## Exceções conhecidas

A localização do kit de UI (`marketplace/core` em vez de `react/shared/`) é um desalinhamento entre nome de pasta e papel real — cria acoplamento invisível (o console interno quebra se o arquivo do marketplace mudar de forma). Ver [[relocar-ui-kit-compartilhado]].

## Ver também

- [[reimplementacao-formatador-brl]] — outra pendência sobre o mesmo módulo (`marketplace-components.jsx`).
- [[padronizar-estados-loading-vazio-erro-acessibilidade]] — próxima camada de consistência de UI a padronizar.

## Atualizações

- 2026-07-19: nota criada.
