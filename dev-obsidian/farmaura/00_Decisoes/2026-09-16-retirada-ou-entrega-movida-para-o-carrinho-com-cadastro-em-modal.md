---
cssclasses: ia-nota
---

# 2026-09-16 — "Retirada ou entrega" movida para o card do carrinho, cadastro de endereço em modal

## Contexto

O card "Retirada ou entrega" (`PdvFulfillmentPicker`) vivia como um card independente na coluna principal do PDV, entre "Oportunidades de recorrência" e a busca de produtos. Pedido: mover essa funcionalidade para dentro do card lateral do carrinho, logo abaixo do valor "Total", e manter responsivo. Em seguida, pedido complementar: o cadastro de um endereço novo (CEP, endereço, número, bairro, nome de quem recebe) deveria abrir dentro de uma modal, em vez de expandir inline.

## Decisão

- `PdvFulfillmentPicker` deixou de ser renderizado como card próprio (`farmaura/react/internal/screens/point-of-sale-screen.jsx`) e passou a ser chamado dentro do painel lateral do carrinho, logo após o `KV` de "Total" — no lugar do resumo estático somente-leitura que havia ali antes (que virou redundante).
- O componente perdeu o wrapper `.card.card-pad` (evitar "card dentro de card" visualmente pesado dentro do painel já encaixotado) e passou a usar só espaçamento (`margin`), consistente com as demais seções desse painel (desconto, cupom, cashback).
- Os botões de alternância "Retirar na loja"/"Entregar em casa" ganharam `flexWrap` e `flex: "1 1 120px"` para não estourar em larguras estreitas.
- O estado interno `mode` ("pick"/"new") foi **removido** e substituído por um booleano `addressModalOpen`: a lista de endereços salvos (quando existem) sempre aparece inline, e "Adicionar novo endereço" agora abre uma `Modal` com os mesmos campos, em vez de expandir a lista inline.
- Um endereço avulso (digitado mas não salvo no perfil do cliente) agora aparece como um `ChoiceCard` selecionado logo abaixo dos salvos, com o botão da modal virando "Editar endereço" — reabrir a modal preserva os dados já digitados em vez de limpar o formulário (só limpa de verdade quando o ponto de partida era um endereço salvo diferente, sinalizando início de um endereço genuinamente novo).
- Dentro da modal, o rodapé virou dinâmico: se "Salvar este endereço para o cliente" estiver marcado, o botão persiste no perfil (`onSaveAddress`) e fecha a modal; se desmarcado, um botão "Usar este endereço" só fecha a modal, mantendo os dados no estado local `delivery` da venda (nunca foi obrigatório salvar no perfil para poder entregar).

## Consequências

- Testado via Chrome headless: card aparece corretamente logo abaixo do "Total" (visão do farmacêutico, cliente identificado); modal abre e fecha corretamente; endereço avulso preservado ao reabrir para edição; comportamento idêntico e sem overflow em 400px de largura (célular) e no breakpoint de coluna única abaixo de 1100px já existente (`pdv-shell`).
- Nenhuma mudança de contrato com o backend — `delivery` continua sendo o mesmo objeto de estado consumido por `pdvSendToCashier`/`emit`; a mudança é inteiramente de organização visual no frontend.

## Ver também

- [[2026-09-15-motor-de-oportunidades-de-venda-no-pdv]] e [[2026-09-15-recorrencia-por-padrao-real-de-compra-e-assinatura-asaas]] — outros cards do mesmo painel do PDV, reorganizados nesta mesma leva de sessões.