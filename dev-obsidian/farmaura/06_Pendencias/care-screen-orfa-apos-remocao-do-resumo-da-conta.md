# `CareScreen` órfã após remoção do "Resumo da conta"

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-04

## Descrição

A rota `care` (`farmaura/react/marketplace/screens/care-screen.jsx`, registrada em
`case 'care': return <CareScreen ctx={ctx} />;` dentro de `marketplace-app.jsx`) não tem mais
nenhum link real que leve até ela no app. O único ponto de entrada era o card "Cuidado Farmaura →
Conhecer todos" dentro da função `AccountSummary`, removida em 2026-09-04
([[../00_Decisoes/2026-09-04-shell-de-conta-unificado-conforme-demo|ADR]]) a pedido do usuário
("remova o resumo da conta"). Confirmado via grep antes da remoção: `care-screen.jsx` (própria
definição), `account-screen.jsx` (o link, já removido) e `marketplace-app.jsx` (a rota) eram os
únicos 3 arquivos com qualquer referência a `'care'`/`CareScreen`.

Hoje a tela ainda existe e funciona (chat farmacêutico, receita digital, compras recorrentes,
programa de cuidado — mesmo conteúdo que estava resumido nos 4 cards de `AccountSummary`), só não
é mais alcançável por nenhuma navegação visível.

## Contexto

Não decidido por conta própria durante a remoção do Resumo da conta — o usuário pediu
especificamente para remover aquela tela ("vamos por parte"), não para decidir o destino de uma
rota relacionada. Duas resoluções razoáveis, a depender do que o usuário quiser:

1. Adicionar um novo ponto de entrada para `care` em algum lugar do menu (ex: dropdown do header,
   ou um novo item em `ACCOUNT_NAV_LINKS`).
2. Remover `case 'care'` e `care-screen.jsx` também, já que o conteúdo é redundante com o que os
   nav links reais já cobrem individualmente (chat via `openChat()`, receita via
   `openPrescription()`, recorrência via a rota `subscriptions`, saúde via a aba `health`).

## Próximo passo sugerido

Perguntar ao usuário na próxima rodada de "vamos por parte" o que fazer com essa rota, em vez de
decidir sozinho.
