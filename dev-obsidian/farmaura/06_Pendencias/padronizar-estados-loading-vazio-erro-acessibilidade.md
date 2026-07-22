# Estados de loading/vazio/erro por convenção informal, não por componente compartilhado

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-07-19

## Descrição

Existe vocabulário compartilhado (classe CSS `ph-empty`, convenção "estado de erro = ícone + texto vermelho + retry" via sufixo `xError`), mas nenhum componente `<Spinner>`/`<EmptyState>`/`<ErrorState>` que force essa consistência — cada tela decide por conta própria:

- `ph-empty` usada em só 9 de ~20 telas internas que têm estado vazio.
- Loading state inconsistente: `finance-screen.jsx` mostra texto explícito de carregamento; `orders-screen.jsx` (no trecho amostrado) não mostra indicador nenhum.
- Acessibilidade: `aria-*` presente mas esparso (27 ocorrências em telas internas, 21 no marketplace, para ~33 arquivos de tela); tags semânticas (`<main>`, `<nav>`, `<header>`) só em 8 arquivos no total — a maior parte do layout é `<div>`-based.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19 (amostragem de 6 de 20 telas internas, não exaustivo). Consistência depende de cada autor de tela seguir a convenção por imitação, não de a API do componente tornar difícil fugir dela — candidato natural para extrair `<EmptyState>`/`<Spinner>`/`<ErrorState>` compartilhados a partir dos padrões já observados.

## Ver também

- [[design-system-frontend-tokens-compartilhados]] — mesma base de tokens/kit de UI onde esses componentes deveriam viver.
- [[relocar-ui-kit-compartilhado]] — pendência sobre a localização do kit de UI reutilizável.
- [[acessibilidade-portal-sem-alt-e-aria-inconsistente]] — gap de acessibilidade equivalente no portal LumosMed.
