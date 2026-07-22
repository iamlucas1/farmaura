# Formatador de moeda (`brl`) reimplementado em 3 telas em vez de reutilizado

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-19

## Descrição

`marketplace/core/marketplace-components.jsx` exporta um formatador `brl(n)` canônico, já importado corretamente por 8+ telas do console interno. Mas 3 arquivos reimplementam a mesma lógica localmente em vez de importar:

- `internal/screens/pricing-screen.jsx:16`
- `internal/screens/coupons-screen.jsx:100`
- `internal/screens/delivery-zones-screen.jsx:34` e `:435` (duas vezes no mesmo arquivo)

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19. Correção mecânica e de baixo risco: trocar a função local pelo import de `brl` do módulo compartilhado nesses 3 arquivos.

## Ver também

- [[relocar-ui-kit-compartilhado]] — mesmo módulo (`marketplace-components.jsx`), pendência sobre sua localização de pasta.
- [[design-system-frontend-tokens-compartilhados]] — padrão de design tokens/kit de UI compartilhado do qual `brl` faz parte.
