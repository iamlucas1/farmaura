# Aba "Mensagens" sem restyle completo para o layout `.msgs-shell` do demo

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-04

## Descrição

Ao portar as 8 telas de conta do demo "Padrão farmácia" (`data-cat="profile"/"settings"/
"subscriptions"/"cashback"/"payments"/"saved"/"messages"`, ver
[[../00_Decisoes/2026-09-04-shell-de-conta-unificado-conforme-demo|ADR]]), a aba "Mensagens"
(`ConversationsInbox`, `account-health-screen.jsx`) só teve o cabeçalho ajustado ao padrão visual
novo. O componente que renderiza as conversas de verdade —
`PharmacistChatInbox`/`PharmacistChatPanel` (`core/marketplace-care-actions.jsx`) — continua com o
estilo próprio já existente (`.fa-chat*`), não o layout de duas colunas do demo (`.msgs-shell` /
`.msgs-list` / `.msgs-thread` / bolhas `.msg-in`/`.msg-out`).

## Contexto

Decisão consciente de escopo, não esquecimento: `PharmacistChatInbox`/`PharmacistChatPanel` tem
lógica real não trivial (polling de mensagens, upload de anexo de receita, fallback para
WhatsApp quando deslogado, pedido de desbloqueio após spam-guard, troca entre múltiplas threads) e
é **compartilhado** entre esta aba e o modal de chat flutuante (`PharmacistChatModal`/`ChatWidget`)
usado em vários pontos do marketplace (carrinho, checkout, PDP). Reescrever a fundo esse
componente para bater pixel-a-pixel com `.msgs-shell` do demo arrisca regressão numa superfície
real usada em produção, e é um trabalho de escopo comparável ao resto da leva sozinho — não coube
no tempo desta sessão.

## Próximo passo sugerido

Se/quando for retomado: mapear `.msgs-list-item`/`.msgs-thread-head`/`.msg-in`/`.msg-out` do
artifact (`data-cat="messages"`, mesmo Artifact `7f0765ed-…`) para o estado real de
`PharmacistChatInbox`, preservando os pontos de integração existentes (`onSelectThread`,
`onSendMessage`, `onSendAttachment`, `onRequestUnblock`, `onOpenAccountConversations`) — e testar
manualmente os fluxos de anexo/desbloqueio/WhatsApp depois, já que não há suíte de teste
automatizado cobrindo esse componente.
