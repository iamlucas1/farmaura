---
cssclasses: ia-nota
---

# 2026-09-19 — "Failed to fetch" na tela do caixa: era a maquininha, não a receita

## Contexto

Usuário reportou: "na tela do caixa aparece com o erro 'Failed to fetch' quando tem um medicamento que precisa de receita e não está validado".

## Causa raiz — não era a receita

Reproduzido: o método de pagamento no caixa começa em `"pix"` por padrão (`useState("pix")`). Clicar em "Cobrar na maquininha" chama `pdvBridgeCharge`, que faz `fetch` direto pro agente local (`farmaura-pdv-bridge`, ver [[2026-09-17-integracao-maquininha-itau-via-agente-usb-local|ADR da integração]]) em `127.0.0.1:8734`. Sem esse agente rodando no computador — o que é o caso a menos que alguém tenha instalado e deixado ligado —, o `fetch()` do navegador falha no nível de rede (não chega nem a ter resposta HTTP) e lança `TypeError: Failed to fetch`, cujo texto cru em inglês subia direto pro operador via `error.message`.

A correlação com "medicamento que precisa de receita" era só circunstancial — a pessoa estava testando esse fluxo de receita naquele momento (ver [[2026-09-18-recusa-de-receita-nao-fazia-nada-para-caixa|ADR de ontem]]) e o método de pagamento, por ser sempre "Pix" de largada, sempre tenta a maquininha primeiro.

## Decisão

Duas correções, uma pro sintoma literal e outra por segurança (mesmo não sendo a causa de fato):

1. **Erro de rede da maquininha traduzido**: `friendlyBridgeError(error)` (novo helper em `point-of-sale-screen.jsx`) reconhece o texto cru que os navegadores usam pra falha de rede ("Failed to fetch", "NetworkError", "Load failed" — cada motor de renderização usa um) e troca por "Não foi possível conectar com a maquininha — confira se o agente local (farmaura-pdv-bridge) está rodando neste computador." Aplicado nos dois pontos que mostravam `error.message` cru: `startTerminalCharge` (falha ao iniciar a cobrança) e o polling de status da cobrança.
2. **Reforço proativo pra receita pendente** (defensivo, não a causa confirmada aqui): o botão "Gerar nota fiscal"/"Cobrar na maquininha" do caixa passou a checar `pendingRxLines` antes de agir — se algum item controlado ainda não está aprovado, mostra um aviso em português ("Ainda falta validar a receita de X. Peça para o farmacêutico validar antes de finalizar.") em vez de tentar prosseguir. Antes disso não existia nenhum bloqueio nem no cliente nem no servidor nessa etapa especificamente (`complete_sale` não valida receita — só `create_queue_order`, ao enviar da tela do farmacêutico, então normalmente um pedido já chega ao caixa com tudo aprovado; isso é só uma segunda camada, não a explicação do bug relatado).

## Consequências

- Testado de ponta a ponta: farmacêutica envia pedido normal (sem item controlado) à fila, caixa assume, clica "Cobrar na maquininha" com o agente local desligado — a modal agora mostra a mensagem em português, sem nenhum "Failed to fetch" na tela.
- Build do frontend OK.

## Ver também

- [[2026-09-17-integracao-maquininha-itau-via-agente-usb-local]] — onde o agente local e o cliente HTTP da maquininha foram criados.
- [[2026-09-18-recusa-de-receita-nao-fazia-nada-para-caixa]] — a investigação anterior que motivou testar esse fluxo de receita no caixa.
