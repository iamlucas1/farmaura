---
cssclasses: ia-nota
---

# 2026-09-05 — Cupons de aniversário (nascimento e cliente), configuráveis pelo admin

## Contexto

Depois de destacar visualmente "Cliente Farmaura desde [data]" em "Meu perfil", o usuário pediu um
desconto configurável para o aniversário de nascimento do cliente **ou** o aniversário de ser
cliente (tempo de cadastro). Perguntado sobre o desenho (ver perguntas feitas na hora), o usuário
escolheu: os dois eixos, configuráveis separadamente; entregue como **cupom que o cliente precisa
resgatar** (não aplicado automático no checkout); válido durante **o mês inteiro** da data.

## Decisão

**Sem mecanismo de desconto paralelo** — o resgate gera um `CouponCampaign` de verdade
(`coupon_campaigns`), pessoal e de uso único, reaproveitando por completo o motor de cupom já
existente (`CouponService.resolve_coupon`, aplicado no checkout como qualquer outro cupom digitado
pelo cliente). Duas colunas novas viabilizam isso sem um esquema paralelo:

- `target_customer_id` — trava o cupom a um cliente específico (`resolve_coupon` agora rejeita
  como "cupom inválido" — mesma mensagem genérica de sempre — se `target_customer_id` não bater
  com quem está tentando usar, sem vazar que o código existe).
- `anniversary_kind` + `anniversary_year` — com um índice único
  `(tenant_id, target_customer_id, anniversary_kind, anniversary_year)`, garante que o cliente não
  resgate duas vezes o mesmo tipo no mesmo ano. Campanhas normais do admin deixam as três colunas
  em NULL/"" e nunca colidem (Postgres trata cada NULL como distinto para fins de unicidade).

**Duas datas reais, não fabricadas**: aniversário de nascimento usa `Customer.birth_date` (já
existente); aniversário de cliente usa `Customer.created_at` (timestamp real de criação da conta,
**não** `member_since_label`, que é só um texto de exibição tipo "desde março de 2024" sem
granularidade de dia/mês confiável para calcular aniversário).

**Configuração do admin** (`PortalMarketplaceMetaResponse`/`UpdateRequest`, mesmo blob JSON de
sempre — `SETTING_KEY_MARKETPLACE_META`, sem resolver novo, mesmo padrão do cashback): por eixo,
liga/desliga + percentual. Tela em `Configurações gerais de preço` → novo card "Cupons de
aniversário", ao lado do card de Cashback.

**Endpoints novos** (`app/api/v1/customers.py`):
- `GET /customers/me/anniversary-offers` — lista só os eixos que o admin tem ligado, e só o
  aniversário de nascimento quando o cliente tem `birth_date` cadastrada; cada item informa se o
  mês atual é o do aniversário (`eligible`) e se já foi resgatado este ano (`already_claimed`,
  com o código).
- `POST /customers/me/anniversary-offers/claim` — revalida elegibilidade no servidor (nunca confia
  no `eligible` que o próprio cliente recebeu antes) e cria o cupom, ou devolve o já existente se
  o cliente resgatar de novo no mesmo ano (idempotente).

**Frontend**: bloco "Benefícios de aniversário" em "Meu perfil" (`AnniversaryOffers`,
`account-profile-screen.jsx`), logo abaixo da identidade — mostra cada eixo habilitado com o
status (resgatável agora / código já resgatado com botão de copiar / disponível em tal mês). Sem
nada no checkout: o cupom resgatado se aplica pelo mesmo campo de cupom que já existe lá, como
qualquer outro código.

## Consequências

- Migrations `20260905_02_coupon_anniversary_personal` (colunas + índice único em
  `coupon_campaigns`) aplicada só localmente; entra na mesma leva pendente de deploy que
  `20260903_01`/`20260905_01` — ver
  [[../06_Pendencias/aplicar-migration-cashback-em-producao|pendência de aplicar em produção]]
  (nome do arquivo ficou datado do cashback, mas já cobre as três).
- Reincidência do gap de `alembic_version` ausente no Postgres de dev local durante esta leva —
  documentada em
  [[../06_Pendencias/alembic-version-ausente-no-postgres-local|alembic-version-ausente-no-postgres-local]].
- `pytest` (suíte `app/tests/unit`) rodada após a mudança: 24 passaram, as mesmas 2 falhas
  pré-existentes de antes desta sessão (`test_create_brand_links_requested_suppliers`,
  `test_create_product_generates_sku_when_blank` — staleness de mock não relacionada). Sem suíte
  de teste nova escrita para o fluxo de resgate em si (fora do escopo de tempo desta leva) — vale
  cobrir `get_anniversary_offers`/`claim_anniversary_offer` numa próxima passada.
- Build de `farmaura-api` e `farmaura` (frontend, inclui o bundle do admin interno) limpos,
  containers redeployados localmente (`healthy`); sem verificação visual via navegador.

## Ver também

- [[2026-09-04-cashback-real-no-marketplace|Cashback real no marketplace]] — mesmo padrão de
  settings configuráveis no blob de marketplace meta.