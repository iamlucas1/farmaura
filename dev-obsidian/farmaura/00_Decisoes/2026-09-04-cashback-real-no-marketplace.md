# 2026-09-04 — Cashback real no canal marketplace (ganho pendente→liberado, resgate abate o pagamento real, teto configurável)

## Contexto

Pedido original da sessão era só re-estilizar a tela "Meus pedidos" do marketplace para bater com o
demo "Padrão farmácia" ([[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|roadmap de
composição visual]]). Ao decidir como tratar a faixa de cashback que o demo mostra no topo dessa
tela, o usuário pediu a construção do cashback real de ponta a ponta — até então, **cashback só
existia no canal PDV** ([[../02_Documentacao/Modulo_CRM|Modulo_CRM]]); pedido online nunca tocava a
carteira, e o tile "Em cashback" da conta era uma estimativa client-side (`faCashback`,
5% fixo sobre o histórico de pedidos).

## Alternativas consideradas

- **Reaproveitar `cashback_rules` (por loja/item) como fonte da % também no marketplace** —
  descartada: o usuário pediu explicitamente um campo direto no produto (mais simples de operar
  no console interno, sem precisar de uma tela de regras separada) + um default global. As duas
  fontes convivem: PDV continua lendo `cashback_rules`; marketplace lê
  `InventoryProduct.cashback_percent` (com fallback ao default do tenant).
- **Consolidar `PdvService` e o novo `CashbackService` num só motor de ganho/resgate agora** —
  descartada por escopo e risco: o PDV credita ganho como **disponível imediatamente** (sem etapa
  pendente), semântica diferente da decidida aqui para o marketplace (ganho **pendente** até
  entrega/retirada). Mudar o comportamento do PDV em produção não foi pedido nesta sessão; fica
  como possível unificação futura.
- **Ganho disponível na hora, igual ao PDV** — descartada por decisão explícita do usuário: ganho
  do marketplace nasce em `pending_balance` e só migra para `available_balance` quando o pedido é
  entregue/retirado (usa `pending_balance`/`release_after_delivery`, já existentes no schema
  desde sempre mas nunca usados até agora).
- **Resgate sem teto (limitado só pelo saldo disponível)** — descartada: usuário pediu um teto
  configurável pelo admin (% do total do pedido), default 25%, para não zerar a receita de um
  pedido só com cashback acumulado.

## Decisão

**Fonte da % de cashback**: `InventoryProduct.cashback_percent` (nullable — vazio usa o default do
tenant) + `PortalMarketplaceMetaResponse.cashback_default_percent` (novo, mesmo blob JSON
`marketplace_meta` que já guarda `installment_overrides`). Editável no formulário de produto e em
Precificação → Configurações gerais → "Cashback" (console interno).

**`CashbackService`** (novo, `app/services/cashback_service.py`) — concentra a lógica que o PDV já
tinha de forma privada (`PdvService._compute_cashback`/`_settle_cashback_ledger`), reaproveitando
`CashbackRepository` (estendido):
- `apply_on_order` — chamado dentro de `OrderService.create_marketplace_order`, **antes** de
  cobrar: resgate = `min(pedido do cliente, saldo disponível, total × cashback_redeem_max_percent)`
  (novo campo, default 25%, configurável no mesmo Precificação → Cashback); ganho = soma por linha
  de `line_total × (produto.cashback_percent ou default)`, gravado como `pending`.
  `charge_amount = total - cashback_aplicado` é o valor de fato enviado ao Asaas
  (`PaymentService.charge_pix`/`charge_card`) — nunca o bruto. Mesmo tratamento em
  `confirm_internal_pickup` para o fluxo de receita física (cobrança na retirada).
- `release_pending_for_order` — move o ganho daquele pedido de `pending_balance` para
  `available_balance`. Ganchos: `confirm_internal_pickup` (retirada concluída),
  `dispatch_shipping_order` (despacho — não há confirmação de entrega em sistema para
  transportadora), `delivery_service.mark_stop_delivered` (entrega própria concluída).
- `reverse_for_order` — reversão total no cancelamento: estorna o ganho pendente/disponível e
  devolve o resgatado à carteira. Único gancho de cancelamento hoje é
  `PrescriptionService._apply_decision_to_order` (receita rejeitada — ver
  [[../06_Pendencias/sem-cancelamento-generico-de-pedido|pendência de cancelamento genérico]], não
  afetada por esta mudança).

**Novo endpoint self-service**: `GET /customers/me/cashback` (saldo disponível/pendente, lifetime,
resgatado, teto de resgate, ledger) — `customers.py` não tinha nenhum endpoint de cashback antes.
`CheckoutOrderRequest` ganhou `cashback_redeem_amount` (cliente sugere, servidor sempre recalcula o
teto real — mesmo princípio já usado para cupom, ver
[[../04_Seguranca_Riscos/backend-e-fonte-unica-de-verdade-nunca-confiar-no-client|backend é fonte
única de verdade]]). `MarketplaceOrderResponse`/`Order` já tinham `cashback_applied_amount`/
`cashback_earned_amount` (colunas existentes desde antes, sempre zeradas) — passam a ser
preenchidas de verdade.

**Frontend**: bootstrap do marketplace busca `GET /customers/me/cashback` (`ctx.cashbackWallet`);
checkout ganha um bloco "Usar meu cashback" (toggle, aparece só quando há teto real a abater) na
etapa Pagamento; `OrderSummary` (compartilhado carrinho/checkout) ganhou uma linha de desconto
"Cashback"; tela de confirmação mostra o valor ganho ("liberado após a entrega/retirada");
`extra-screen.jsx::CashbackScreen` e o tile "Em cashback" do Resumo da conta trocaram a estimativa
`faCashback` pelos dados reais da wallet.

**Segurança — pré-requisito tratado na mesma leva**: `customer_cashback_wallets` e
`cashback_transaction_lines` não tinham `tenant_id`/RLS
([[../04_Seguranca_Riscos/rls-ausente-em-tabelas-de-varios-dominios|risco documentado]]), e havia um
achado **crítico** confirmado de vazamento cross-tenant de cashback via PDV
([[../04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv|nota]]). Ambas ganharam
`tenant_id` (migration com backfill) e entraram na malha genérica de RLS
(`row_level_security.py::tenant_tables`); `CashbackRepository.get_or_create_wallet` passou a exigir
`tenant_id` e o `PdvService` passou a validar `customer_id` contra o tenant do subject
(`get_customer_by_id`) antes de ler/escrever a wallet, fechando os dois vetores descritos no achado
(oráculo de saldo via `discount-limit`, dreno via `orders`/`complete`). Ver as duas notas de
segurança atualizadas para o detalhe completo e o que **ainda** fica em aberto.

## Consequências

- Migration `20260903_01_marketplace_cashback.py` gerada, testada e **aplicada em dev local**
  (stamp + upgrade, com o mesmo contorno de sempre — ver
  [[../06_Pendencias/alembic-version-ausente-no-postgres-local|pendência de Alembic local]]).
  **Nunca aplicada em produção** — ver pendência nova
  [[../06_Pendencias/aplicar-migration-cashback-em-producao|aplicar-migration-cashback-em-producao]].
- Sem expiração de cashback nesta leva — `validity_days`/`expired_total` continuam no schema sem
  uso (mesmo estado de antes, agora também no marketplace).
- Testes novos (`app/tests/unit/test_cashback_service.py`, 6 casos): ganho por % do produto vs.
  default, teto de resgate nunca confia no valor pedido pelo cliente, liberação pending→available,
  reversão total (e idempotência da reversão). Suite completa rodada no Docker
  ([[../07_POPs_Processos/executar-testes-python-no-docker|POP]]) — 40 passaram, 4 falhas
  pré-existentes e não relacionadas a esta mudança (rotas/mocks desatualizados em
  `test_auth_required.py`/`test_brand_service.py`/`test_product_service.py`, não tocados aqui).
- **Verificação visual (Playwright/screenshot) não foi feita nesta sessão** — o ambiente de
  execução usado não tinha ferramenta de navegador/captura disponível. O build de produção real
  (`docker compose build farmaura`) passou limpo e os dois containers (`farmaura`, `farmaura-api`)
  subiram saudáveis na porta 3000/8080, mas a verificação ponta a ponta pelo navegador (fluxo de
  checkout com cashback, tela Meus pedidos redesenhada) fica pendente de uma sessão com esse
  tooling.
- `PdvService` não foi migrado para `CashbackService` — continua com sua própria lógica de ganho
  imediato. Consolidar os dois motores fica como possível trabalho futuro, fora do pedido desta
  sessão.

## Ver também

- [[../04_Seguranca_Riscos/rls-ausente-em-tabelas-de-varios-dominios|RLS ausente em tabelas de vários domínios]] — atualizada, 2 das tabelas resolvidas aqui.
- [[../04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv|Wallet de cashback sem isolamento por tenant]] — atualizada, achado crítico corrigido.
- [[../06_Pendencias/cashback-real-para-marketplace|Pendência original]] — resolvida por esta decisão.
- [[../02_Documentacao/Modulo_CRM|Modulo_CRM]] — mecânica de cashback, agora nos dois canais.
