# RLS (Row-Level Security) ausente em tabelas de vários domínios

**Tipo:** Risco identificado
**Severidade:** Média
**Status:** Aberto
**Data de identificação:** 2026-07-25

## Descrição

Levantamento cruzado ao documentar os módulos de negócio (`02_Documentacao/Modulo_*.md`) encontrou um padrão recorrente: várias tabelas com `tenant_id` **não** aparecem em `app/core/row_level_security.py` — nem na lista genérica `tenant_tables` nem com política dedicada. O isolamento entre tenants nessas tabelas depende inteiramente do filtro `tenant_id` aplicado manualmente em cada query do repository/service correspondente, sem a segunda camada de defesa (RLS no Postgres) que protege a maioria do resto do sistema.

Tabelas identificadas sem RLS, por domínio:
- **Catálogo**: `brands`, `categories`, `therapeutic_classes`, `brand_suppliers`, `product_reviews` — ver [[../02_Documentacao/Modulo_Catalogo|Modulo_Catalogo]].
- **CRM**: `coupon_campaigns` — ver [[../02_Documentacao/Modulo_CRM|Modulo_CRM]]. ~~`cashback_transaction_lines`, `customer_cashback_wallets`~~ — **RLS adicionada em 2026-09-04** (ver atualização abaixo), removidas desta lista.
- **Estoque**: `inventory_invoice_records` — ver [[../02_Documentacao/Modulo_Estoque|Modulo_Estoque]].
- **Entrega/Portal**: `portal_settings` (config de `delivery_pricing`/`delivery_areas` e as demais 5 chaves de settings) — ver [[../02_Documentacao/Modulo_Entrega|Modulo_Entrega]] e [[../02_Documentacao/Modulo_Portal|Modulo_Portal]].
- **Pedidos**: `order_status_events` tem RLS configurada mas nunca é escrita por nenhum código — caso à parte, não é gap de segurança em si (ver pendência [[../06_Pendencias/order-status-events-nunca-escrita|order-status-events-nunca-escrita]]).

## Impacto

Um bug de aplicação (query sem filtro `tenant_id`, endpoint novo esquecendo o filtro, join mal escrito) nessas tabelas específicas não teria a rede de segurança que o Postgres oferece ao resto do sistema — vazamento cross-tenant só seria pego em revisão de código, não bloqueado estruturalmente. Não há evidência de exploração — é um gap de defesa em profundidade, não uma vulnerabilidade confirmada.

## Mitigação / Tratamento

Nenhuma ainda. Próximo passo natural: confirmar com o time se a ausência é intencional (dados considerados "menos sensíveis" ou já públicos, como cupons expostos no bootstrap anônimo) ou lacuna a fechar — e, se for lacuna, estender `app/core/row_level_security.py` seguindo o mesmo padrão já usado para as tabelas irmãs de cada domínio (ex.: `pricing_promotions` já tem RLS genérica; `coupon_campaigns` do mesmo domínio não tem nenhuma).

## Referências

Baseline de RLS: `farmaura-api/app/core/row_level_security.py` (aplicado via bootstrap idempotente, não migration — ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|adoção de Alembic em produção]] para o racional de fase de desenvolvimento). Ver também [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]].

## Atualizações

- 2026-09-04: `customer_cashback_wallets` e `cashback_transaction_lines` ganharam `tenant_id`
  (migration `20260903_01_marketplace_cashback`, com backfill a partir de `customers`) e entraram
  na malha genérica de RLS (`row_level_security.py::tenant_tables`), como pré-requisito de
  segurança para estender cashback ao marketplace — ver
  [[../00_Decisoes/2026-09-04-cashback-real-no-marketplace|ADR]] e
  [[cashback-wallet-vazamento-cross-tenant-via-pdv|achado crítico relacionado, também corrigido]].
  As demais tabelas desta lista (`brands`, `categories`, `therapeutic_classes`,
  `brand_suppliers`, `product_reviews`, `coupon_campaigns`, `inventory_invoice_records`,
  `portal_settings`) continuam sem RLS — gap real, não tratado nesta leva.
- 2026-08-26: novo endpoint público `GET /brands/public/{brand_name}` (Fase 4 do [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|roadmap de composição visual]], página de marca do marketplace) toca `brands` sem RLS pela primeira vez a partir de uma rota **anônima**. Mitigado no nível da aplicação, não da tabela: `BrandService.get_public_brand` resolve o tenant via a mesma função `SECURITY DEFINER` (`resolve_public_marketplace_tenant_id`) já usada pelo bootstrap público, e filtra por `tenant_id` explicitamente na query — não depende de RLS nem de contexto de sessão (que nem existe pra um visitante anônimo). O gap de RLS em `brands` em si **continua aberto** — isso só evita que essa rota nova especificamente dependa dele.
- 2026-07-30: confirmado via `pg_class.relrowsecurity` que `coupon_campaigns` **continua sem RLS**
  (`f`/`f`) — o CRUD do cupom (`portal_service.py`) ganhou nesta data a reaplicação de
  `apply_tenant_context` após `commit()` (mesmo padrão já usado por `pricing_promotions`), mas isso é
  só consistência de código para o dia em que uma política for adicionada; sem policy na tabela, essa
  reaplicação não tem efeito algum hoje. Risco continua aberto e sem tratamento.
- 2026-07-25: nota criada, a partir do levantamento feito para documentar os módulos de negócio.
