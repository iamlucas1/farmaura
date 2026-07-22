# Frontend sem code-splitting por tela (só split por portal)

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-19

## Descrição

Zero uso de `React.lazy`/`import()` dinâmico em todo `farmaura/react/`. O Vite já separa os dois portais em entrypoints distintos (`internal-entry.js`/`marketplace-entry.js`, config MPA em `vite.config.js`) — um visitante do marketplace nunca baixa código do console interno e vice-versa — mas **dentro** de cada portal, todas as 20 telas internas (ou as 13 do marketplace) vão num bundle só.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19. Baixa prioridade porque o split por portal já resolve a divisão mais importante (cliente nunca baixa código interno). Vale considerar lazy-loading por tela se o bundle de qualquer um dos dois portais crescer a ponto de afetar tempo de carregamento percebido — não é uma lacuna urgente hoje.

## Ver também

- [[design-system-frontend-tokens-compartilhados]] — outro aspecto do mesmo frontend (Vite MPA de dois portais).
