# Kit de UI compartilhado vive em `marketplace/core`, não em `react/shared/`

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-19

## Descrição

`marketplace/core/marketplace-components.jsx` (`Modal`, `ModalShell`, `Toggle`, `QtyStepper`, `ProductCard`, `brl`) é o kit de UI de fato reutilizado por 17 arquivos do console interno, mas fica dentro da pasta do marketplace, não em `react/shared/` — que hoje só tem módulos de infraestrutura, nenhum componente visual.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19 — ver [[design-system-frontend-tokens-compartilhados]]. O nome da pasta `shared` sugere ser o lugar certo para isso, e não é — cria acoplamento invisível (mudança de forma no arquivo do marketplace pode quebrar o console interno sem nenhum aviso na estrutura de pastas). Mover para `react/shared/` seria um refactor mecânico (atualizar imports nos 17 arquivos consumidores), mas não trivial o suficiente pra fazer sem confirmar com o time — só registrando o achado.

## Ver também

- [[reimplementacao-formatador-brl]] — outra pendência sobre o mesmo módulo (`marketplace-components.jsx`).
