# Visão Geral: Farmaura

## Missão

Backend Farmaura (Python) operando com APIs reais, persistência, autorização, isolamento multi-tenant, tratamento de arquivos e regras de negócio completas. Pagamento (Pix/cartão via Asaas), emissão fiscal e precificação de entrega por distância já estão implementados de verdade, não mockados — ver [[../00_Decisoes/2026-07-12-pagamentos-pix-cartao-via-asaas|pagamentos via Asaas]], [[../00_Decisoes/2026-07-12-diferir-emissao-fiscal-7-dias|diferimento fiscal]] e [[../00_Decisoes/2026-07-12-precificacao-entrega-por-distancia|precificação de entrega]].

## Arquitetura (backend)

Camadas em `farmaura-api/app/`: `api/v1/` (21 módulos de rota) → `services/` (25 arquivos, regra de negócio) → `repositories/` (18 arquivos, acesso a dados) → `models/` (43 arquivos SQLAlchemy). `domain/` guarda enums, erros e regras de domínio sem I/O. `schemas/` (Pydantic v2) espelha os domínios. Padrão confirmado em [[../03_Padroes_Politicas/padrao-camadas-backend-di-fastapi|padrao-camadas-backend-di-fastapi]].

Duas exceções deliberadas à camada estrita (documentadas em `03_Padroes_Politicas/`):
- `delivery_pricing_service.py` compõe `PortalService` e acessa repositórios de outro domínio diretamente, para ser reaproveitado por marketplace e PDV — ver [[../03_Padroes_Politicas/excecao-delivery-pricing-cross-service|excecao-delivery-pricing-cross-service]].
- `fiscal_scheduler.py` roda como tarefa `asyncio` em processo (iniciada no `lifespan()`, sem Celery/APScheduler) e gerencia sua própria sessão de banco fora do DI por request — ver [[../03_Padroes_Politicas/excecao-fiscal-scheduler-sessao-propria|excecao-fiscal-scheduler-sessao-propria]].

## Segurança (arquitetura, não achados — achados ficam em `04_Seguranca_Riscos/`)

- **JWT** (`core/jwt.py`): 4 tipos de token com claims tipados e discriminador `type` — acesso (15min), refresh (30/90 dias, com `family_id`+`jti` para revogação em família), desafio MFA (5min) e desafio de reset de senha (10min). Algoritmo fixo, validação obrigatória de `iss`/`aud`/claims. Ver skill [[../../_Compartilhado/Skills/secure-auth-rbac-jwt|secure-auth-rbac-jwt]].
- **Senhas** (`core/password_hashing.py`): Argon2id via `pwdlib`.
- **Row-Level Security** (`core/row_level_security.py` + `core/tenant_context.py`): isolamento multi-tenant reforçado no próprio Postgres, não só na aplicação — ver [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]] para o detalhe completo.
- **Upload** (`core/file_validation.py`): allowlist de extensão/content-type + tamanho máximo; **sem** verificação de magic bytes ainda — ver [[../04_Seguranca_Riscos/upload-sem-validacao-magic-bytes|upload-sem-validacao-magic-bytes]].
- **Rate limiting**: `core/rate_limit.py` aplicado de fato via Valkey (janela fixa, fail-open) em auth + navegação pública — ver [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]]. **Idempotência**: `core/idempotency.py` continua **não aplicada de fato** (sem backend de persistência) — ver [[../04_Seguranca_Riscos/idempotencia-sem-persistencia|idempotencia-sem-persistencia]] e [[../06_Pendencias/conectar-valkey-a-rate-limit-e-idempotencia|conectar-valkey-a-rate-limit-e-idempotencia]].
- **Cache de catálogo**: `core/cache.py`, também sobre Valkey — invalidação por contador de geração, TTL curto como rede de segurança, fail-open. Cobre só a listagem de catálogo (público e autenticado); preço/estoque de checkout nunca passam por cache — ver [[../05_Integracoes_Infra/Valkey|Valkey]] e [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]].

## Stack Aprovada (baseline)

- Python 3.13.13
- PostgreSQL 17.x
- Valkey 9.1.x
- Backend: FastAPI + Pydantic v2 + SQLAlchemy (async)
- Frontend: React puro (sem meta-framework) + Vite

Versões e políticas de dependências detalhadas ficam em `claude.md`/`agent.md` do repositório — não replicar aqui, só linkar.

## Fronteira de Responsabilidade

Duas superfícies de frontend estritamente segregadas por permissão:

1. **Marketplace** (cliente final) — `farmaura/react/marketplace/`
2. **Internal** (farmacêutico/operações) — `farmaura/react/internal/`

Nunca misturar responsabilidades das duas superfícies num mesmo componente/rota sem passar pela regra de segregação de acesso documentada no `claude.md`.

## Este projeto não vive sozinho no repositório

O mesmo repositório git `dev` também contém `lumos-api/`, `lumos-gateway/` e `lumosmed/` (produto Lumos, família separada) como stacks-irmãs — têm seus próprios repositórios git independentes (listados no `.gitignore` da raiz) e sua própria documentação no vault `lumos-obsidian`, não neste cofre. Este cofre documenta o LumosMed de forma enxuta em [[../../lumosmed/Hub|lumosmed/Hub]]. Farmaura compartilha apenas o gateway ([[../05_Integracoes_Infra/Lumos_Gateway|Lumos_Gateway]]) com eles. Se o produto Lumos passar a ser documentado aqui também, ele ganha sua própria chave de projeto (`lumosmed`), separada de `farmaura`.

## Onde cada coisa deveria estar registrada

- Decisão de arquitetura/trade-off → `../00_Decisoes/`
- Padrão, política, premissa ou regra de negócio que o `claude.md`/`agent.md` do repo ainda não cobre → `../03_Padroes_Politicas/`
- Achado de segurança, vulnerabilidade ou risco → `../04_Seguranca_Riscos/`
- API, integração, banco de dados ou infra → `../05_Integracoes_Infra/`
- Pendência ou débito técnico → `../06_Pendencias/`
- POP ou processo → `../07_POPs_Processos/`
- Contexto de negócio definido pelo usuário → `../01_Contexto_Usuario/` (só o usuário escreve aqui)

## Atualizações

- 2026-07-20: migração de Redis para Valkey (drop-in, mesmo protocolo) em toda a infra/código; rate limiting e bloqueio de login passam a rodar sobre Valkey. Novo cache de listagem de catálogo (`core/cache.py`), também sobre Valkey — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]].
- 2026-07-20: seção de atualizações adotada nesta nota — daqui em diante, toda mudança material ou adoção de tecnologia nova relevante para esta visão geral ganha uma entrada aqui.
