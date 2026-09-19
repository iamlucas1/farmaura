---
cssclasses: ia-nota
---

# 2026-09-19 — "Ver CRM" no drawer de Pedidos Online abre modal em vez de redirecionar

## Contexto

O botão "Ver CRM" no drawer de Pedidos Online chamava `ctx.openCustomer(nome)`, que navegava para
a tela CRM inteira (`goTo('crm')`) e fechava o drawer do pedido (`setDrawerOrder(null)`) — o
operador perdia o contexto do pedido que estava atendendo só para checar informação do cliente.
Pedido do usuário: abrir uma modal com informação útil vinda da mesma fonte de dados do CRM, sem
sair da tela.

## Decisão

- Novo componente `CustomerInfoModal` em `orders-screen.jsx`, usando o mesmo array `ctx.customers`
  que a tela `CrmScreen` já consome (`customers.find((c) => c.name === o.customer)`) — nenhum dado
  novo, nenhuma chamada de API nova, só reaproveita o que já estava carregado.
- Conteúdo é um subconjunto condensado do que `CrmScreen` mostra: badges de tier/recorrência, 5
  stat cards (total gasto, pedidos, ticket médio, cashback, última compra), produtos mais
  comprados, pedidos deste cliente (reaproveitando `FulfillBadge` de `internal-shell.jsx` e o
  `OrderStatusBadge` já usado na tabela desta mesma tela), recorrências ativas e favoritos. Ficaram
  de fora o gráfico de pedidos/mês e o donut de mix de categoria — análise mais funda demais pra um
  modal de contexto rápido, continuam só na tela CRM completa.
- Botão "Ver perfil completo no CRM" no rodapé chama o `openCustomer` original — a navegação
  completa continua existindo, só deixou de ser o comportamento padrão.
- `tierTone` (função que decide a cor do badge de tier) importada direto de `crm-screen.jsx` em vez
  de duplicada — evita as duas telas divergirem na paleta de tier com o tempo.

## Consequências

- Testado via Playwright contra o Docker local: modal abre sobre o drawer sem conflito de
  z-index (mesmo padrão já usado pela `PickupCodeModal`), mostra dado real do cliente (Carolina
  Dias: Cliente Ouro, recorrente, R$ 118,00 total gasto, produtos mais comprados, pedido em
  aberto), sem erros de console.
- Nenhuma mudança de contrato com o backend — só reorganização de apresentação no frontend.

## Ver também

- [[2026-09-18-pedidos-online-redesenhado-conforme-artifact-mantendo-funcionalidade-real|Redesenho original desta tela]]
