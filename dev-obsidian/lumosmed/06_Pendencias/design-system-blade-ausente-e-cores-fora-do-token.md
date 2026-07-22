# Sem biblioteca de componentes Blade; CSS do blog diverge dos design tokens

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-19

## Descrição

Não existe `resources/views/components/` (ou equivalente) — reuso acontece só via `@extends`/`@include` do layout mestre. Cards/tiles repetidos (`prontuario-lista.blade.php`, `financeiro.blade.php`, `agenda.blade.php`) são "Tailwind utility soup" copiado, não um componente Blade compartilhado.

`tailwind.config.js` define a paleta canônica (`primary #091235`, `secondary #2b4257`, `terciary #092288`, `accent #0081D6`, `light #f0f8ff`), usada por `site/base.css`. Mas `resources/css/blog/blog.css` hardcoda **cores próprias, ligeiramente diferentes**, com comentários que admitem ser aproximação: `color: #0b2c31; /* primary-ish */`, `color: #077187; /* accent-ish */` — evidência direta de que o CSS do blog foi escrito sem consumir o token compartilhado. A área do portal mistura utilitário Tailwind com CSS próprio por página (17 arquivos em `resources/css/portal/*.css`).

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19. Baixa prioridade — não quebra nada, é inconsistência visual sutil (aproximação de cor "-ish"). Vale corrigir se o blog for retrabalhado, trocando as cores hardcoded pelas variáveis do `tailwind.config.js`.

## Ver também

- [[design-system-frontend-tokens-compartilhados]] — mesmo tema (design tokens) no produto irmão Farmaura, lá os tokens são de fato reutilizados de forma consistente.
- [[acessibilidade-portal-sem-alt-e-aria-inconsistente]] — outro gap de consistência nas mesmas páginas do portal.
