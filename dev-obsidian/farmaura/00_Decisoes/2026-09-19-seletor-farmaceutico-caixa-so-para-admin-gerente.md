---
cssclasses: ia-nota
---

# 2026-09-19 — Seletor "Tela do farmacêutico / Tela do caixa" só para admin/gerente

## Contexto

Pedido: só admin e gerente deveriam poder escolher a visão do PDV (farmacêutico ou caixa); para os demais usuários, o seletor deveria sumir — cada um preso na visão que corresponde ao seu papel de verdade.

Faz sentido dado o que a leva anterior já achou ([[2026-09-18-recusa-de-receita-nao-fazia-nada-para-caixa|ADR de ontem]]): a visão "farmacêutico/caixa" no PDV sempre foi só um toggle de UI, independente do papel real de quem está logado — um farmacêutico podia clicar em "Tela do caixa" e ver uma interface pensada pra outra função (com ações que sua conta nem tem permissão de executar no servidor).

## Decisão

`PdvScreen` (`point-of-sale-screen.jsx`) passou a olhar `ctx.user.role`:

- `canSwitchOperator = user.role === "admin" || user.role === "manager"` — só esses dois continuam vendo o `PillNav` no cabeçalho (`actions={canSwitchOperator ? <PillNav .../> : null}`).
- O estado inicial de `operator` já nasce certo pro papel: `cashier` → `"caixa"`, qualquer outro (inclusive `pharmacist`) → `"pharm"`.
- Um `useEffect` corrige `operator` se `user` ainda não tinha carregado na primeira renderização (comum, já que a sessão carrega de forma assíncrona) — sem isso, um farmacêutico poderia nascer na visão errada por uma fração de segundo e ficar preso lá, já que sem o seletor não haveria como se corrigir manualmente.

Só o papel do usuário decide — dono de loja usando uma conta `manager` ou `admin` continua podendo alternar livremente pra supervisionar/testar as duas visões, como já fazia.

## Consequências

- Testado com as três contas reais: `paula.sena` (pharmacist) abre direto em "Visão do farmacêutico", sem nenhum seletor no cabeçalho; `alice.ferraz` (cashier) abre direto em "Visão do caixa" (já mostrando a fila de pedidos do farmacêutico), também sem seletor; `adriana.lima` (admin) mantém o `PillNav` normalmente.
- Nenhuma mudança de backend — só esconde/trava uma escolha de UI que já não deveria ter sido livre pra esses papéis, dado que as ações de cada visão já são de fato restritas por papel no servidor.

## Ver também

- [[2026-09-18-recusa-de-receita-nao-fazia-nada-para-caixa]] e [[2026-09-18-carrinho-caixa-cashback-modal-local-e-teto-de-receita]] — a mesma investigação (testar o PDV com contas de papel real, não só admin) que motivou este ajuste.
