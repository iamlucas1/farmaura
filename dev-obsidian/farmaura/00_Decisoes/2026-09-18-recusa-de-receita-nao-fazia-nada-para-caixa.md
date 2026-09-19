---
cssclasses: ia-nota
---

# 2026-09-18 — "Recusar receita" parecia não fazer nada quando testado como caixa

## Contexto

Usuário reportou: "Quando estou tentando recusar uma receita, ele não está recusando no PDV".

Testei o fluxo de recusa como farmacêutica (`paula.sena@farmaura.com.br`) e funcionou perfeitamente — clicar "Recusar" a primeira vez revela o campo de motivo (sem enviar nada ainda), preencher e clicar "Recusar" de novo registra a recusa, fecha a modal, e tanto o banner do topo quanto a linha do item passam a mostrar "Receita recusada". Não reproduzi nada errado nesse caminho.

## Causa raiz

`POST /pdv/prescriptions` (a rota que registra aprovação/recusa) só aceita `admin`, `manager` e `pharmacist` (`require_internal_subject`, [pdv.py:188](farmaura-api/app/api/v1/pdv.py#L188)) — **`cashier` nunca teve permissão para chamar essa rota**, é uma decisão correta (só farmacêutico deve julgar uma receita), mas a tela do caixa deixava o operador clicar na linha/banner de receita normalmente, abrindo a mesma modal com os mesmos botões "Aprovar"/"Recusar" de qualquer jeito.

Confirmado direto contra a API com uma conta `cashier` real (`alice.ferraz@farmaura.com.br`):

```
POST /pdv/prescriptions {..., decision: "rejected"} → 403 "Você não tem permissão para fazer isso."
```

Na tela, isso se resolvia num toast de erro que o operador podia não notar — a modal continuava aberta, e o status nunca virava "Receita recusada". Do ponto de vista de quem está testando, parece exatamente "não está recusando".

## Decisão

Em vez de dar essa permissão ao caixa (não deveria ter — validar receita é julgamento clínico do farmacêutico), a linha/banner de receita virou **somente informativa** na "Tela do caixa": renderiza como `<div>` sem `onClick`, com um texto deixando claro que só o farmacêutico pode validar, em vez de um botão que parece interativo mas sempre falha silenciosamente.

- `point-of-sale-screen.jsx`: tanto a linha do carrinho (`.pdv-rx-row`) quanto o item do banner do topo (`.pdv-rx-banner-item`) agora checam `operator === "pharm"` — só aí renderizam como `<button onClick={() => setPrescriptionTarget(l)}>`; em qualquer outra visão, renderizam como `<div>` (mesmo visual, sem clique), com o texto trocado de "· toque para validar" para "· só o farmacêutico pode validar" (linha do carrinho) / "· aguardando o farmacêutico" (banner).
- Nenhuma mudança de backend — a restrição de papel já estava correta; o problema era só a UI do caixa sugerir uma ação que não tem permissão para executar.

## Nota sobre alcance real do problema

Na prática, o caixa só deveria ver receitas já **aprovadas**: `_enforce_prescription_gate` já bloqueia o "Enviar para o caixa" inteiro se qualquer item controlado não estiver com receita aprovada — então um pedido com receita "sem receita"/"pendente"/"recusada" nunca chega a ser enfileirado, e o caixa nunca deveria topar com esse estado na prática. O texto informativo pros estados não-aprovados foi implementado mesmo assim, por defesa em profundidade (ex.: se uma receita for revogada depois de aprovada, por algum caminho futuro).

## Consequências

- Testado como farmacêutica: recusa continua funcionando normalmente (nada mudou nesse fluxo).
- Testado como caixa real (`alice.ferraz`), reivindicando um pedido com item controlado já aprovado: a linha de receita aparece como texto verde "Receita validada", sem interação — clicar não faz mais nada (nem abre modal, nem tenta a API).
- Build do frontend OK.

## Ver também

- [[2026-09-18-carrinho-caixa-cashback-modal-local-e-teto-de-receita|ADR da leva anterior]] — mesma investigação de "Tela do caixa com conta cashier real" que já tinha achado várias lacunas parecidas (RLS de estoque/local/receita, flag `controlled` hardcoded).
