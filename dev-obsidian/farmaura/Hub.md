# Hub Central: Farmaura

Chave de projeto neste cofre: `farmaura` — cobre o produto Farmaura como um todo (frontend `farmaura/`, backend `farmaura-api/`, infra própria `docker/`), hospedado no repositório git `dev`. A biblioteca de skills do repositório vive em `_Compartilhado/Skills/` (não é uma chave de projeto) — ver [[../_Compartilhado/Skills/Hub|Skills/Hub]]. O outro produto deste repositório, LumosMed, tem chave própria — ver [[../lumosmed/Hub|lumosmed/Hub]].

Produto principal: marketplace farmacêutico — frontend em React (Vite) para clientes e para o console interno de farmácia/operações, com backend próprio em FastAPI.

## Repositório

`~/Documentos/desenvolvimento/dev` (git) — o repositório se chama `dev`, mas hospeda mais de um produto; a chave deste projeto no cofre é `farmaura`, não `dev`. Guias de padrão estático e segurança: `claude.md` e `agent.md` na raiz do repo — sempre consultar antes de assumir uma convenção; este cofre não duplica esse conteúdo.

## Estrutura do Produto

- `farmaura/react/marketplace/` — front do cliente (marketplace de compra).
- `farmaura/react/internal/` — console do farmacêutico/operações.
- `farmaura/react/shared/` — código comum entre as duas superfícies (API client, controle de acesso, cache de portal, observabilidade, loaders de mapa). As duas superfícies são estritamente segregadas em permissões — ver regra "Marketplace/Internal Access Segregation" no `claude.md`.
- `farmaura-api/` — backend: FastAPI + Pydantic v2 + SQLAlchemy async + PostgreSQL + Valkey. Dono de todo o domínio de negócio: catálogo, carrinho, pedidos, prescrições, estoque, PDV, CRM, entrega, documentos fiscais, IA de estoque, chat. Frontend sem code-splitting por tela ainda — ver [[06_Pendencias/sem-code-splitting-frontend|sem-code-splitting-frontend]].

## Domínios de Negócio (backend)

Cada domínio tem seu módulo de rota em `app/api/v1/`, serviço em `app/services/` e repositório em `app/repositories/` quando aplicável:

- **Catálogo** — `catalog.py` / `catalog_service.py`
- **Carrinho** — `cart.py` (lógica majoritariamente em `order_service.py`/`marketplace_projection.py`)
- **Pedidos** — `orders.py` / `order_service.py`
- **Prescrições** — `prescriptions.py` / `prescription_service.py`
- **Estoque** — `inventory.py`, `inventory_lots.py` / `inventory_service.py`, `inventory_lot_service.py`, `inventory_stock_sync.py`, `inventory_invoice_service.py`, `inventory_ai_service.py`
- **PDV (balcão)** — `pdv.py` / `pdv_service.py` (ver [[06_Pendencias/queries-em-loop-checkout-pdv|queries-em-loop-checkout-pdv]])
- **CRM** (cashback, cupons, assinaturas) — `crm.py`, `customers.py` / `crm_service.py`, `customer_service.py`, `purchase_history_service.py`
- **Entrega** — `deliveries.py` / `delivery_pricing_service.py` (ver [[03_Padroes_Politicas/excecao-delivery-pricing-cross-service|excecao-delivery-pricing-cross-service]])
- **Documentos fiscais** — `fiscal.py` / `fiscal_service.py`, `fiscal_scheduler.py`
- **Chat** — `chat.py` / `chat_service.py`
- **Portal/config interna** — `portal.py` / `portal_service.py`
- **Auth** — `auth.py` / `auth_service.py` (e-mail transacional de primeiro acesso via [[05_Integracoes_Infra/SMTP|SMTP]])
- **Lojas, fornecedores, equipe** — `stores.py`, `suppliers.py`, `team.py`
- **Orçamentos** (cotações de compra, comparativo de fornecedores, painel ABC/XYZ) — `purchase_quotes.py`, `purchase_analytics.py` / `purchase_quote_service.py`, `purchase_quote_ai_service.py`, `purchase_analytics_service.py` — ver [[02_Documentacao/Modulo_Orcamentos|Modulo_Orcamentos]]

## Dependências de Infraestrutura Compartilhada

- `lumos-gateway`: gateway Nginx compartilhado (TLS, GeoIP, Fail2ban) que também serve o ecossistema Lumos. Farmaura entra como upstream, nunca exposto direto. Documentação própria desse stack fica no cofre `lumos-obsidian` (`~/Documentos/desenvolvimento-lumos/lumos-obsidian`), não aqui.
- Farmaura está em produção desde 2026-07-22 (`drogariafarmaura.com.br`, servidor `lumos-prd`) — mudanças de schema agora exigem migrations Alembic (`alembic revision --autogenerate` + revisão + `alembic upgrade head`), não mais direto no ORM + bootstrap. `farmaura-api/scripts/bootstrap_database.py` segue cuidando só de RLS idempotente e seed inicial. Ver `claude.md` para o racional completo e [[00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|a decisão registrada]] para o histórico Alembic concreto (baseline + primeira migration real).

## Navegação

- Visão geral / arquitetura: [[02_Documentacao/Visao_Geral|Visão Geral]]
- Decisões (ADRs): `00_Decisoes/` — cadeia de decisões de pagamento: [[00_Decisoes/2026-07-12-restringir-checkout-pix-cartao|restringir checkout]] → [[00_Decisoes/2026-07-12-tokenizacao-cartao-real-asaas|tokenização]] → [[00_Decisoes/2026-07-12-pagamentos-pix-cartao-via-asaas|pagamento real]] → [[00_Decisoes/2026-07-12-diferir-emissao-fiscal-7-dias|diferimento fiscal]]; ver também [[00_Decisoes/2026-07-12-precificacao-entrega-por-distancia|precificação de entrega por distância]], [[00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|adoção de Alembic em produção]] e [[00_Decisoes/2026-07-23-confirmar-compra-cruza-orcamentos-e-estoque|Confirmar Compra cruza orçamentos e estoque]]
- Contexto de negócio (só o usuário escreve): `01_Contexto_Usuario/`
- Padrões, políticas, premissas e regras de negócio não cobertas pelo `claude.md`/`agent.md`: `03_Padroes_Politicas/`
- Segurança, vulnerabilidades e registro de riscos: `04_Seguranca_Riscos/` — principais gaps abertos: [[04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate limiting]], [[04_Seguranca_Riscos/idempotencia-sem-persistencia|idempotência]] e [[04_Seguranca_Riscos/upload-sem-validacao-magic-bytes|upload sem magic bytes]]
- APIs, integrações, bancos de dados e infra: `05_Integracoes_Infra/`
- Pendências e débito técnico: `06_Pendencias/`
- POPs e processos: `07_POPs_Processos/` — ver [[07_POPs_Processos/resetar-e-re-semear-dados-locais|resetar e re-semear dados locais]] e [[07_POPs_Processos/aplicar-migration-alembic-producao|aplicar migration Alembic em produção]]
