---
cssclasses: ia-nota chat-log
---

# Chat farmaura (Claude Code) — 2026-09-16 (fc04cc55-c039-4ab6-bf00-36520c815341)

- Diretório: `/home/noname/Documentos/desenvolvimento/dev`
- Sessão: `fc04cc55-c039-4ab6-bf00-36520c815341`
- Log de execução: [[_Logs_Execucao/2026-09-16/claude-farmaura-fc04cc55|abrir]]

## Turno 1 · 2026-09-16 01:20
<span class="log-crosslink">🔧 [[_Logs_Execucao/2026-09-16/claude-farmaura-fc04cc55#Turno 1 · 2026-09-16 01:20|ver execução deste turno]]</span>

<span class="chat-role chat-role-user">Você</span>

<span class="chat-command">⚡ /contexto farmaura</span>

<span class="chat-role chat-role-ai">Claude</span>

Vou carregar o contexto completo do projeto farmaura: primeiro a estrutura de diretórios, depois os arquivos de governança e do projeto.

Permissões conferem com a política (nada em "allow" sobrepondo "ask"). Agora vou ler os arquivos de governança e do projeto farmaura.

Vou delegar a leitura do restante (todas as pendências, padrões, riscos de segurança e integrações do projeto — dezenas de arquivos) a um agente de pesquisa, para não sobrecarregar o contexto principal com o conteúdo bruto.

## Contexto: Farmaura

**O que é**: marketplace farmacêutico — frontend React (Vite) com duas superfícies estritamente segregadas (`farmaura/react/marketplace/` para clientes, `farmaura/react/internal/` para farmacêutico/operações, mais `farmaura/react/shared/`) e backend próprio em FastAPI (`farmaura-api/`), dono de todo o domínio de negócio: catálogo, carrinho/pedidos, prescrições, estoque, PDV, CRM, entrega, fiscal, chat, orçamentos. Em produção desde 2026-07-22 em `drogariafarmaura.com.br`, atrás do `lumos-gateway` compartilhado.

### Arquitetura e convenções a respeitar
- Camadas: `api/v1/` → `services/` → `repositories/` → `models/` (SQLAlchemy async) + `domain/` (regras sem I/O) + `schemas/` (Pydantic v2). Duas exceções documentadas: `delivery_pricing_service.py` (cross-service por reuso marketplace/PDV) e `fiscal_scheduler.py` (sessão própria fora do DI, roda como task asyncio).
- Multi-tenant via RLS real no Postgres (GUCs `app.current_tenant_id` etc.), não só filtro de aplicação — mas **cuidado**: padrão recorrente de bug é "commit limpa contexto RLS transaction-local" (já mordeu 2FA/login e ainda está aberto em `InventoryService.update_location*`/`CrmService.create_address`).
- Backend é fonte única de verdade — nunca confiar em cálculo vindo do client (dinheiro, estoque, elegibilidade).
- Pós-lançamento: mudança de schema exige migration Alembic (`alembic revision --autogenerate` + revisão + `alembic upgrade head`), não mais direto no ORM.
- Toda mudança de dado pessoal/tratamento/regra de negócio (pagamento, cancelamento, receita) precisa atualizar Termos/Privacidade/Retenção na mesma leva.
- Sem CI/CD e sem teste E2E de isolamento cross-tenant — foi exatamente o que deixou passar o achado crítico de cashback.

### Riscos de segurança mais relevantes (abertos)
- **CRÍTICO** — [cashback-wallet-vazamento-cross-tenant-via-pdv](../dev-obsidian/farmaura/04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv.md): correção de validação aplicada, mas a migration de RLS que fecha em profundidade [ainda não está em produção](../dev-obsidian/farmaura/06_Pendencias/aplicar-migration-cashback-em-producao.md).
- **ALTA** — [rls-bloqueava-2fa-login-e-primeiro-acesso](../dev-obsidian/farmaura/04_Seguranca_Riscos/rls-bloqueava-2fa-login-e-primeiro-acesso.md): corrigido só localmente, pode estar bloqueando login real com 2FA em produção agora.
- **ALTO**, mesma família (falta guarda de estado antes de efeito colateral financeiro): [cupom-pdv-bypass-limite-uso-fluxo-duas-fases](../dev-obsidian/farmaura/04_Seguranca_Riscos/cupom-pdv-bypass-limite-uso-fluxo-duas-fases.md), [pdv-complete-sale-sem-guarda-estado](../dev-obsidian/farmaura/04_Seguranca_Riscos/pdv-complete-sale-sem-guarda-estado.md), [rejeicao-prescricao-duplicavel-credita-estoque-em-dobro](../dev-obsidian/farmaura/04_Seguranca_Riscos/rejeicao-prescricao-duplicavel-credita-estoque-em-dobro.md) — nenhum corrigido ainda.
- **ALTO** — [bootstrap-vaza-dados-financeiros-para-cliente-e-caixa](../dev-obsidian/farmaura/04_Seguranca_Riscos/bootstrap-vaza-dados-financeiros-para-cliente-e-caixa.md), [webhook-asaas-ip-allowlist-valida-ip-interno-errado](../dev-obsidian/farmaura/04_Seguranca_Riscos/webhook-asaas-ip-allowlist-valida-ip-interno-errado.md) (dormant, vai quebrar pagamento no dia em que a allowlist for ativada), [idempotencia-sem-persistencia](../dev-obsidian/farmaura/04_Seguranca_Riscos/idempotencia-sem-persistencia.md).

### Pendências mais relevantes
- [product-ref-nao-normalizado-quebra-favoritos-assinaturas](../dev-obsidian/farmaura/06_Pendencias/product-ref-nao-normalizado-quebra-favoritos-assinaturas.md) (alta — pode estar quebrando favoritos/assinaturas agora).
- [webhook-asaas-nao-trata-ciclos-de-assinatura-recorrente](../dev-obsidian/farmaura/06_Pendencias/webhook-asaas-nao-trata-ciclos-de-assinatura-recorrente.md) (feature de recorrência mais recente, ciclo 2+ não credita cashback).
- [migration-chat-spam-guard-pendente-em-producao](../dev-obsidian/farmaura/06_Pendencias/migration-chat-spam-guard-pendente-em-producao.md) — quebra runtime se deployar código sem aplicar.
- [revisao-juridica-termos-privacidade-retencao](../dev-obsidian/farmaura/06_Pendencias/revisao-juridica-termos-privacidade-retencao.md) — bloqueante antes do lançamento.

### Decisões recentes (últimos 2 dias)
Trabalho ativo tem sido em **PDV** e **motor de recorrência/oportunidades de venda**: retirada/entrega movida para dentro do card de carrinho no PDV com cadastro em modal ([2026-09-16](../dev-obsidian/farmaura/00_Decisoes/2026-09-16-retirada-ou-entrega-movida-para-o-carrinho-com-cadastro-em-modal.md)); recorrência agora por intervalo real de compra + assinatura mensal real no Asaas ([2026-09-15](../dev-obsidian/farmaura/00_Decisoes/2026-09-15-recorrencia-por-padrao-real-de-compra-e-assinatura-asaas.md)); correção de contaminação de histórico sintético com `customer_id` real ([2026-09-15](../dev-obsidian/farmaura/00_Decisoes/2026-09-15-historico-sintetico-do-painel-de-compras-nao-pode-ter-customer-id-real.md)); análise de cliente mesmo com carrinho vazio + 5 inline/15 no modal em Oportunidades de Venda ([2026-09-15](../dev-obsidian/farmaura/00_Decisoes/2026-09-15-oportunidades-de-venda-analisa-cliente-mesmo-com-carrinho-vazio.md), [2026-09-15](../dev-obsidian/farmaura/00_Decisoes/2026-09-15-oportunidades-de-venda-5-inline-mais-modal-com-15.md)).

### Arquivos de código para começar (por domínio, `farmaura-api/app/`)
- **PDV**: `api/v1/pdv.py` / `services/pdv_service.py`
- **CRM** (cashback, cupons, recorrência): `api/v1/crm.py`, `api/v1/customers.py` / `services/crm_service.py`, `services/customer_service.py`, `services/purchase_history_service.py`
- **Carrinho/Pedidos**: `api/v1/cart.py`, `api/v1/orders.py` / `services/order_service.py`, `services/marketplace_projection.py`
- **Catálogo**: `api/v1/catalog.py` / `services/catalog_service.py`
- **Estoque**: `api/v1/inventory.py`, `api/v1/inventory_lots.py` / `services/inventory_service.py` e correlatos
- **Frontend**: telas relevantes em `farmaura/react/internal/` (console/PDV) e `farmaura/react/marketplace/`, mais o que for compartilhado em `farmaura/react/shared/`

O que exatamente você quer implementar ou alterar no Farmaura?

---
