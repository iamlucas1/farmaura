---
cssclasses: ia-nota
---

# 2026-09-18 — Pedidos Online redesenhado conforme o artifact (b75209e1), mantendo funcionalidade real

## Contexto

A tela "Pedidos online" do console interno (`orders-screen.jsx`) havia divergido visualmente do design prototipado no artifact "Farmaura Operações" (`b75209e1-8678-49c8-8346-79d151eddf05`): a tela real era um Kanban de 5 colunas por status (Novo/Em separação/Pronto/Despachado-entrega/Despachado-retirada), enquanto o artifact usa filtro por pills (Todos/Entrega/Retirada), 3 stat cards, tabs (Todos/Pendentes/Prontos-a caminho/Finalizados), tabela de pedidos e um drawer com stepper de andamento (`OrderProgress`).

Pedido do usuário: fazer as telas ficarem iguais. Como o artifact é mais antigo/simplificado que a tela real, ele não cobre três pedaços de funcionalidade que a tela real já tem: conferência de item por item na separação (com seleção de endereço de estoque por item), geração de etiqueta e despacho para pedidos com `fulfillment: "shipping"` (envio por transportadora — tipo que nem existe no artifact) e validação de código de retirada sem exibi-lo ao operador. Perguntado ao usuário como resolver o conflito; resposta: adotar o layout do artifact, mas reencaixar as três funcionalidades reais dentro dele (opção recomendada), não copiar o artifact ao pé da letra.

## Decisão

- `OrdersScreen` trocou o Kanban por: `PageHead` + `PillNav` (Todos/Entrega/Retirada/Envio — o artifact só tinha Todos/Entrega/Retirada, "Envio" foi adicionado porque `fulfillment: "shipping"` é um tipo real que precisa de filtro) → 3 `StatCard` (Pendentes/Prontos-a caminho/Aguardando receita) → `Tabs` (mesmos 4 buckets do artifact, mapeados para os 4 status reais: `new`+`separating`=Pendentes, `ready`=Prontos, `dispatched`+`cancelled`=Finalizados) → `DataTable` com `renderActions`+`RowIconBtn` "eye" abrindo o drawer (convenção já usada em todas as outras telas do console — o artifact usava a mesma tabela+ícone, só que a tela antiga de Pedidos Online era a única do console que não seguia esse padrão).
- `StatCard` ganhou o tom `serious` (só faltava o mapeamento — as variáveis `--serious`/`--serious-soft` já existiam no CSS, herdadas do artifact) para o card "Aguardando receita".
- `OrderDrawer` ganhou um `OrderStepper` novo (classes `.order-stepper`/`.order-step*` já existiam no CSS, herdadas do artifact, mas nunca tinham sido usadas por nenhuma tela) — os passos são construídos dinamicamente a partir de `OC_FLOW` (`new`→`separating`→`ready`→`dispatched`), com um passo pseudo "Aguardando validação de receita" inserido quando `o.rx` é verdadeiro, análogo ao `OrderProgress` do artifact.
- As três funcionalidades reais sem equivalente no artifact foram mantidas, reencaixadas visualmente: checklist de separação (com seleção de local de estoque por item) continua sempre visível como seção própria "Separação"; validação de código de retirada continua condicionada a `fulfillment==="pickup" && status==="ready"`; despacho por transportadora (`dispatchShippingOrder`) continua condicionado a `fulfillment==="shipping" && status==="ready"`.
- O botão "Fechar" redundante no rodapé do drawer foi removido — nenhuma outra tela do console (`pricing-screen.jsx`) duplica esse botão, o `Drawer` já tem o X no cabeçalho, e o artifact também não tem esse botão.
- Não foi adicionado bloqueio de avanço por "pagamento pendente" (existe no artifact via `OrderProgress`) porque o campo real `order.payment` guarda o método de pagamento (`pix`/`debit_card`/...), não um status pago/pendente confiável em todos os registros — inventar essa regra sem certeza sobre o dado real ficaria incorreto.

## Consequências

- Testado via Playwright headless contra o build Docker real (`docker compose build farmaura && docker compose up -d farmaura`, login `adriana.lima@farmaura.com.br`): tela de listagem e drawer (estado "Novo" e estado "Pronto para retirada" com o painel de validação de código) renderizam sem erros de console.
- Cor de destaque (`--accent`) permanece vermelha no console interno, não a cor teal do artifact — decisão já registrada em [[2026-09-14-accent-do-console-interno-volta-a-ser-vermelho]], válida também para os novos componentes desta tela (stepper, botões primários), já que usam o token `var(--accent)` em vez de cor fixa.
- Nenhuma mudança de contrato com o backend — os mesmos campos (`recordId`, `items[].loc`, `pickupCode`, `trackingCode`/`carrierName`) e as mesmas funções de `ctx` (`advanceOrder`, `toggleOrderItemPicked`, `updateOrderItemLocation`, `confirmPickupCode`, `dispatchShippingOrder`) continuam sendo usados sem alteração de assinatura.

## Ver também

- [[2026-09-14-accent-do-console-interno-volta-a-ser-vermelho]] — por que os componentes herdados do artifact usam token de cor, não a cor teal original.
- `farmaura/06_Pendencias/sem-code-splitting-frontend.md` — o aviso de chunk grande no build (`internal-DTMbCpgR.js`, 834 kB) é preexistente, não introduzido por esta mudança.
