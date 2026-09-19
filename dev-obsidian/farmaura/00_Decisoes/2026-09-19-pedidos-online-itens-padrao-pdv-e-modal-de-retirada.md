---
cssclasses: ia-nota
---

# 2026-09-19 — Pedidos Online: itens da separação no padrão visual do PDV, validação de retirada em modal

## Contexto

Continuação da mesma sessão ([[2026-09-19-pedidos-online-pagamento-traduzido-prazo-e-priorizacao-automatica]]). O usuário reportou (com print) que a lista de itens da seção "Separação" do drawer estava visualmente quebrada: nome do produto e o `<select>` de local de estoque disputavam a mesma linha (`display:flex` horizontal), e como o `<select>` tem `width:auto` (se ajusta ao texto da opção selecionada, tipo "C4-09 · Storage C4-09"), o nome do produto ficava espremido numa coluna estreitíssima e quebrava palavra por palavra. Pediu para reformular igual ao PDV (criando separações visuais entre nome, quantidade e local) e mover a validação de código de retirada — que vivia como um card inline dentro do drawer — para uma modal à parte, com um botão de acesso direto também na tabela de listagem.

## Decisão

- **Item da separação**: trocado o `<div style={{display:"flex", ...}}>` de uma linha só pela classe `.pdv-cart-line` (`display:flex; flex-direction:column`) já existente em `internal.css`, usada pelo carrinho do PDV (`point-of-sale-screen.jsx`) — mesmo padrão de empilhamento: linha 1 (checkbox de conferência + nome do produto, agora com largura plena), linha 2 (Qtd, texto indentado sob o nome), linha 3 (`.pdv-cart-line-location`: ícone de pin + select de local, ocupando a linha inteira). Nenhuma classe CSS nova — só reaproveitei o que o PDV já tinha.
- **Modal de validação de retirada**: novo componente `PickupCodeModal` em `orders-screen.jsx`, usando o `Modal` genérico de `internal-ui.jsx` (título "Validar retirada", subtítulo com pedido+cliente, campo de código, rodapé Cancelar/Validar). Substitui o card inline "Validar retirada sem exibir o código" que ficava dentro do corpo do drawer.
- **Dois pontos de entrada** para a mesma modal, cada um com seu próprio estado local (`OrdersScreen` e `OrderDrawer` não compartilham estado entre si nesta tela):
  - Botão dedicado (ícone de cadeado) na coluna de ações da tabela, ao lado do "Ver detalhes" — só aparece quando `status==="ready" && fulfillment==="pickup"` — permite validar retirada sem precisar abrir o drawer inteiro.
  - Botão "Validar retirada" dentro do drawer (no lugar do card antigo) — ao confirmar com sucesso, fecha também o drawer (`closeDrawer()`), igual ao comportamento antigo.
- Nenhuma mudança de contrato com o backend — os dois caminhos chamam o mesmo `ctx.confirmPickupCode(orderId, code)` que já existia.

## Consequências

- Testado via Playwright headless: nome de produto longo ("Whey Protein Concentrado 900g", "Colageno Hidrolisado 300g") agora renderiza em linha própria, sem quebra palavra-a-palavra; modal abre corretamente pelos dois pontos de entrada, sobrepondo o drawer sem conflito de z-index (ambos usam overlay `z-index:100`, a modal é montada depois no DOM e pinta por cima); sem erros de console em nenhum dos dois fluxos.

## Ver também

- [[2026-09-19-pedidos-online-pagamento-traduzido-prazo-e-priorizacao-automatica]] — mudanças anteriores na mesma tela, mesma sessão.
- [[2026-09-18-pedidos-online-redesenhado-conforme-artifact-mantendo-funcionalidade-real]] — redesenho original que introduziu o card inline agora substituído pela modal.
