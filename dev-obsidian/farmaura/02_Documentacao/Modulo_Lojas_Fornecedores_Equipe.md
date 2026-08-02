# Módulo Lojas, Fornecedores e Equipe

## O que é

Três cadastros administrativos do console interno, todos seguindo o mesmo padrão de **soft-delete only** (flag `is_active`, nenhum DELETE, nunca hard delete — para preservar histórico referenciado por estoque/pedidos/entregas). O boundary de autorização real por loja (`can_access_store_row`) que sustenta a RLS de dezenas de outras tabelas do sistema nasce aqui, na atribuição `users.store_id` feita na tela de Equipe.

## Lojas (Stores)

**Model** `stores`: `code` (imutável após criação, `UniqueConstraint(tenant_id, code)`), `name`, endereço completo, `latitude`/`longitude` (**sempre resolvidos server-side via geocoding**, nunca informados pelo admin — falha soft para `0.0/0.0` se o geocoding falhar), `is_primary`, `is_active`. **Gap notável**: nada no service garante que só uma loja tenha `is_primary=True` — múltiplas podem ficar marcadas simultaneamente.

RLS (`stores_access_policy`): tenant + (`role='customer'` OU `can_access_store_row(id)`) — **admin** vê/edita qualquer loja; **demais papéis internos só a própria loja atribuída** (`app.current_store_id`, derivado de `users.store_id`). Este mesmo helper `can_access_store_row` é reaproveitado pela RLS de `inventory_items`, `inventory_locations`, `inventory_movements`, `pdv_orders`, `pdv_sales`, `delivery_routes`, `driver_locations` e mais — ou seja, **a atribuição de loja feita em Equipe é o boundary de autorização real de boa parte do sistema**, não só uma conveniência de UI.

Endpoints: `GET /stores` (admin/manager/pharmacist/cashier, só lojas ativas), `POST /stores` (**admin only**, 409 em código duplicado), `PATCH /stores/{id}` (**admin only**, re-geocodifica só se o endereço mudou; é por aqui que `is_active`/`is_primary` são alternados — sem endpoint de status dedicado). Sem DELETE.

Frontend: `stores-screen.jsx` (CRUD + KPIs + toggle ativar/desativar sem confirmação de efeito cascata) e `locations-screen.jsx` (sub-cadastro de `inventory_locations` — prateleiras/gôndolas/caixas por loja, RLS restrita a admin/manager/pharmacist, cashier sem acesso). Rota `stores` visível só a `ADMIN` no frontend — **mais restrito que o backend**, que permite manager/pharmacist/cashier fazer `GET /stores` (usado para popular seletores em outras telas).

## Fornecedores (Suppliers)

**Model** `suppliers`: **tenant-scoped, não store-scoped** (deliberado — um fornecedor serve todas as lojas do tenant). `UniqueConstraint(tenant_id, cnpj)`, `lead_time_days`/`minimum_order_amount`/`freight_policy`/`payment_terms`, soft-delete via `is_active` "para preservar referências de histórico de lote". RLS: tenant + role in `(admin, manager, pharmacist)` — **cashier e driver sem acesso nenhum**.

Endpoints (`ADMIN, MANAGER, PHARMACIST`): `GET /suppliers?query=&active_only=` (default `False` — lista inativos também, diferente de stores), `POST /suppliers` (409 em CNPJ duplicado), `PUT /suppliers/{id}`, `PATCH /suppliers/{id}/status` (endpoint dedicado, diferente de stores).

**Vínculo com Orçamentos**: `purchase_quotes.supplier_id` é FK **opcional** (`SET NULL`) com snapshot obrigatório de nome/CNPJ — desativar (ou perder) um fornecedor nunca quebra o histórico de cotação exibido; RLS de Orçamentos é mais restrita (admin/manager, sem pharmacist) por expor preço concorrente entre fornecedores — ver [[Modulo_Orcamentos|Módulo Orçamentos]].

Frontend: `suppliers-screen.jsx` — CRUD completo com todos os campos comerciais (prazo de entrega, pedido mínimo, política de frete, condição de pagamento). Rota visível a admin/manager/pharmacist — **bate exatamente com o backend**, sem divergência.

## Equipe (Team)

Não há model `Team` dedicado — "equipe" é `users` filtrado por papel de staff (admin/manager/pharmacist/cashier/driver, excluindo customer). `access_scope` é **auto-derivado, não escolhido**: `admin` → `hybrid` (pode também comprar no marketplace com o mesmo login); qualquer outro papel interno → `internal`.

RLS de `users`: visível se o e-mail bate com login/first-access pré-auth (carve-outs), OU (tenant bate E (`id=current_user_id()` OU role admin/manager/pharmacist)) — **cashier e driver não veem outros membros da equipe** via RLS, reforçando o que o endpoint já restringe.

Endpoints (`api/v1/team.py`) — **todos admin-only**, sem exceção: `GET /team/members` (inclui inativos), `POST /team/members` (cria com senha em texto claro informada pelo admin — **sem convite/e-mail, sem `must_change_password`**, ver [[Modulo_Auth|Módulo Auth]]), `PUT /team/members/{id}`, `PATCH /team/members/{id}/status`, `PATCH /team/members/{id}/store` (endpoint dedicado de reatribuição de loja).

Regras de negócio não óbvias:
- **Sem invitation/e-mail flow** — divergência deliberada do fluxo de primeiro acesso do cliente PDV (ver [[Modulo_Auth|Módulo Auth]]).
- **Auto-desativação bloqueada** (400, checado também no frontend antes da chamada).
- **Última conta admin protegida**: não é possível desativar o único admin ativo do tenant.
- **Gap simétrico**: essa proteção existe só no caminho de desativação — trocar o `role` do último admin para outro papel via `PUT /team/members/{id}` **não** é bloqueado da mesma forma.
- Loja atribuída é opcional (`store_id` nullable) — staff pode existir "sem loja atribuída" antes de ser alocado.

Frontend: `team-screen.jsx` — único campo de senha visível só na criação, com regex de senha forte duplicado do backend só para feedback antecipado. Rota `team` admin-only no frontend, **coincide exatamente** com o backend.

## Decisões de arquitetura dignas de nota

- **Soft-delete-only como convenção consistente** nas três áreas — explícito nos docstrings dos três arquivos.
- **`can_access_store_row` é o mecanismo único** que gate-keeps visibilidade store-scoped em praticamente todo o backend — a atribuição feita em Equipe carrega peso de autorização real, não só cosmético.
- **RLS aplicada via bootstrap idempotente em Python**, não via migration Alembic — mesma política de fase de desenvolvimento documentada em [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|adoção de Alembic em produção]] (que cobre schema, mas RLS em si segue fora desse fluxo).
- **Fornecedores e Orçamentos compartilham o mesmo template tenant-only de RLS**, mas Orçamentos é deliberadamente mais restrito (sem pharmacist) por expor preço concorrente.

## Ver também

- [[Modulo_Auth|Módulo Auth]] — provisionamento de conta sem convite, RBAC por papel.
- [[Modulo_Orcamentos|Módulo Orçamentos]] — vínculo opcional de fornecedor à cotação.
- [[Modulo_Estoque|Módulo Estoque]] — `store_id`/`inventory_locations` usados por praticamente todo o domínio de estoque.
- [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|Adoção de Alembic em produção]].

## Atualizações

- 2026-07-25: nota criada — documentação do estado atual do módulo.
