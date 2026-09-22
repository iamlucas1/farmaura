---
cssclasses: ia-nota
---

# Cor bruta (rgba) no dropdown de pedido do ConversationsInbox

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-22

## Descrição

`farmaura/react/marketplace/screens/account-health-screen.jsx:342`, dentro do componente `ConversationsInbox`, usa uma sombra com cor bruta não-tokenizada:

```jsx
boxShadow: '0 12px 32px rgba(0,0,0,.14)'
```

`farmaura/DESIGN.md` documenta um sistema de tokens de cor (ex: `--fa-rose-soft` para o glow de foco/hover "Rosé Cuidado") e um "craft floor" que evita cor bruta não documentada em componentes novos. Este valor é de um dropdown de seleção de pedido dentro da caixa de mensagens/conversas, não relacionado à reformulação de "Meus pedidos" feita em 2026-09-22 (ver [[../00_Decisoes/2026-09-22-reformulacao-meus-pedidos-e-fix-rotulos-pagamento|ADR da reformulação]]).

## Contexto

Encontrado incidentalmente por um hook de verificação de design ao editar o mesmo arquivo para a reformulação da tela de pedidos. Fora do escopo do pedido original (que era sobre rótulo de pagamento, seção de avaliação e card de pedido/andamento), por isso não foi corrigido junto — só registrado para tratamento futuro, provavelmente junto de um `/impeccable polish` mais amplo no arquivo.
