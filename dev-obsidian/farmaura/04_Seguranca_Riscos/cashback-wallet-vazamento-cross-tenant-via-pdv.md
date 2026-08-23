# Wallet de cashback sem isolamento por tenant — leitura e escrita cross-tenant via PDV

**Tipo:** Vulnerabilidade (Broken Access Control / IDOR + falha de isolamento multi-tenant)
**Status:** CONFIRMADO (verificado manualmente no código, também achado de forma independente por dois agentes de investigação com métodos diferentes)
**Severidade:** CRÍTICO
**Sistema afetado:** `farmaura-api`
**Categoria:** Broken Object Level Authorization (IDOR) + isolamento multi-tenant quebrado + integridade financeira
**Data de identificação:** 2026-08-17 (auditoria completa de segurança, ver [[../08_Skills_Agentes_Prompts/auditoria-completa-seguranca|prompt de auditoria]])

## Descrição

A tabela `customer_cashback_wallets` não tem coluna `tenant_id` e não está na lista de tabelas protegidas por RLS em `app/core/row_level_security.py` (só `cashback_rules`/`cashback_transactions` estão lá, não a wallet em si). Isso por si só seria aceitável **se** todo `customer_id` usado para acessá-la já tivesse sido validado como pertencente ao tenant do chamador antes de chegar ali — mas isso não acontece no fluxo de PDV.

`CashbackRepository.get_or_create_wallet` filtra **apenas** por `customer_id`, sem nenhum parâmetro de tenant:

```python
# app/repositories/cashback_repository.py:47-58
async def get_or_create_wallet(self, *, customer_id: str) -> CustomerCashbackWallet:
    statement = select(CustomerCashbackWallet).where(CustomerCashbackWallet.customer_id == customer_id)
    ...
```

E em `PdvService`, `customer_id` vem direto do payload enviado pelo operador de PDV, sem nenhuma validação de que esse cliente pertence ao tenant do usuário autenticado:

```python
# app/services/pdv_service.py:332
customer_id = payload.customer.id if payload.customer and payload.customer.id else None
...
potential_cashback = await self._resolve_potential_cashback(customer_id)   # linha 334 — leitura
...
# linha 392, o mesmo customer_id vira PdvOrder.customer_id
```

A única checagem tenant-scoped real (`get_customer_by_id(tenant_id=..., customer_id=...)`) só existe em `confirm_recurrence` (linha 670) — o padrão correto existe no código, mas não foi aplicado em `create_queue_order`/`create_reservation`/`get_discount_limit`/`complete_sale`.

## Evidência

Confirmado manualmente (não só por relato de agente) em 2026-08-17:
- `app/repositories/cashback_repository.py:47-58` — `get_or_create_wallet` sem parâmetro `tenant_id`.
- `app/models/customer_cashback_wallet.py` — model sem coluna `tenant_id`.
- `app/core/row_level_security.py:59-60` — só `cashback_rules`/`cashback_transactions` na lista de tabelas com RLS, `customer_cashback_wallets` ausente.
- `app/services/pdv_service.py:332-334,392,499,930,981-984,1091-1098` — `customer_id` sempre lido de `payload.customer.id` (controlado pelo cliente da requisição) e usado direto em leitura (`_resolve_potential_cashback`) e escrita (`_settle_cashback_ledger` → `get_or_create_wallet` na linha 984, que credita/debita `wallet.available_balance`) sem passar por `get_customer_by_id(tenant_id=...)` antes.
- Contraste: `app/services/pdv_service.py:670` (`confirm_recurrence`) já usa o padrão correto (`cashback_repository.get_customer_by_id(tenant_id=str(self.subject.tenant_id), customer_id=payload.customer_id)`) — mostra que a validação existe no codebase, só não foi replicada nos outros métodos.

## Cenário de risco

Dois vetores, ambos exigindo apenas uma sessão interna válida de PDV (qualquer papel — ADMIN/MANAGER/PHARMACIST/CASHIER) de **qualquer** tenant, mais o UUID de um cliente de **outro** tenant (obtido por vazamento incidental, atuação em múltiplas farmácias da plataforma, engenharia social, ou qualquer outro meio):

1. **Leitura/oráculo de saldo**: `POST /pdv/discount-limit` aceita `customer_id` livre e devolve `max_discount_percent`, calculado a partir de `potential_cashback` (saldo da wallet) combinado com o subtotal/custo do carrinho — que o atacante controla (usando produtos do próprio tenant). Isolando as variáveis conhecidas, é possível derivar o saldo exato de cashback de um cliente de outro tenant.
2. **Escrita/corrupção financeira real**: ao criar um pedido de fila (`POST /pdv/orders`) e completá-lo (`POST /pdv/orders/{id}/complete`) usando esse `customer_id` estrangeiro, `_settle_cashback_ledger` credita/debita de verdade `wallet.available_balance` — ou seja, o cashback de um cliente de um tenant pode ser gasto/drenado para financiar desconto numa venda de outro estabelecimento concorrente.

## Impacto

- Vazamento de dado financeiro (saldo de cashback) de cliente de outro tenant.
- Corrupção/drenagem real de saldo financeiro entre tenants — não é só leitura, é mutação de um ativo do cliente.
- A linha de `CashbackTransaction` gravada usa `tenant_id=str(self.subject.tenant_id)` (o tenant do atacante), não o tenant real do cliente — o ledger fica poluído/inconsistente, dificultando até auditoria posterior do próprio incidente.
- Quebra do princípio central do produto (isolamento multi-tenant reforçado por RLS, ver [[padrao-rls-multitenant-via-session-guc|padrão RLS multi-tenant]] em `_Compartilhado/Padroes_Politicas/`) — esta é a primeira vulnerabilidade cross-tenant confirmada e ativa encontrada no produto desde o lançamento.

## Pré-condições

- Login interno válido em qualquer tenant (qualquer papel com acesso ao PDV: ADMIN, MANAGER, PHARMACIST, CASHIER).
- Conhecimento (não adivinhação por força bruta — o campo é UUID) do `customer_id` de um cliente de outro tenant.

## Escopo afetado

`app/repositories/cashback_repository.py` (`get_or_create_wallet`), `app/services/pdv_service.py` (`create_queue_order`, `create_reservation`, `get_discount_limit`, `complete_sale`, `_resolve_potential_cashback`, `_compute_cashback`, `_settle_cashback_ledger`), `app/models/customer_cashback_wallet.py`, `app/core/row_level_security.py`. Endpoints: `POST /pdv/orders`, `POST /pdv/orders/reservation` (nomes aproximados, ver `app/api/v1/pdv.py`), `POST /pdv/discount-limit`, `POST /pdv/orders/{id}/complete`.

## Causa raiz

Dupla ausência de defesa: (1) a tabela não tem `tenant_id`/RLS como rede de segurança (diferente da maioria das tabelas do sistema, que têm RLS *e* filtro manual — ver [[rls-ausente-em-tabelas-de-varios-dominios]] para as outras 9 tabelas nessa mesma situação, mas nenhuma delas tinha, até este achado, um caminho de aplicação que também esquecesse o filtro manual); (2) o código de aplicação em `pdv_service.py` aceita `customer_id` do payload do cliente sem resolvê-lo contra o tenant do subject antes de usá-lo — o padrão correto (`get_customer_by_id(tenant_id=...)`) existe no mesmo arquivo (`confirm_recurrence`) mas não foi replicado nos métodos mais usados do fluxo de PDV.

## Correção sugerida para análise futura

1. Validar `payload.customer.id`/`payload.customer_id` contra o tenant do subject (mesmo padrão de `confirm_recurrence`, linha 670) logo no início de `create_queue_order`, `create_reservation` e `get_discount_limit`, rejeitando com 404 se o cliente não pertencer ao tenant — antes de qualquer leitura/escrita de wallet.
2. Como segunda camada (defesa em profundidade, consistente com o resto do sistema): adicionar `tenant_id` à tabela `customer_cashback_wallets` (denormalizado a partir de `customers.tenant_id`, preenchido na criação) e incluir a tabela em `row_level_security.py`, com policy nos mesmos moldes de `cashback_rules`/`cashback_transactions`.
3. Auditar o ledger existente (`CashbackTransaction`/`CustomerCashbackWallet`) em produção para checar se algum registro já reflete uma mutação cross-tenant real antes desta correção — não faz parte desta auditoria (que é somente observacional), mas é um passo recomendado antes/durante a correção.

## Dependências da correção

Nenhuma migration é estritamente necessária para o item 1 (validação na aplicação). O item 2 (coluna `tenant_id` + RLS) exige uma migration Alembic (ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|adoção de Alembic em produção]]) e backfill do `tenant_id` a partir do `customer_id` para linhas já existentes.

## Riscos de regressão

Baixo para o item 1 — é uma checagem adicional que só rejeita casos hoje inválidos (cliente de outro tenant), não deveria afetar nenhum fluxo legítimo. Testar com atenção o fluxo de cliente "não identificado" no PDV (`customer_id=None`), que já é tratado hoje e deve continuar funcionando sem essa validação (não há tenant a validar quando não há cliente).

## Como validar futuramente que a correção funcionou

1. Teste automatizado de API (não só unitário com mock, ver achado de gap de testes em [[gap-testes-e2e-autorizacao-cross-tenant]]): autenticar como PDV do tenant A, tentar `POST /pdv/discount-limit` e `POST /pdv/orders` com o `customer_id` de um cliente real do tenant B, esperar 404/erro de validação em ambos.
2. Confirmar via `pg_class.relrowsecurity`/`pg_policies` que `customer_cashback_wallets` passou a ter RLS ativa (mesmo teste já usado para confirmar a ausência em `rls-ausente-em-tabelas-de-varios-dominios.md`).
3. Repetir o cenário de "oráculo" (`discount-limit` variando o carrinho) contra um cliente de outro tenant e confirmar que a resposta não depende mais do saldo real desse cliente.

## Referências

- [[rls-ausente-em-tabelas-de-varios-dominios]] — mesma classe de gap (RLS ausente por tabela), mas nas outras 9 tabelas o filtro manual de tenant na aplicação ainda protege; aqui não.
- [[../../_Compartilhado/Padroes_Politicas/padrao-rls-multitenant-via-session-guc|padrao-rls-multitenant-via-session-guc]] — padrão que este achado viola.
- [[../08_Skills_Agentes_Prompts/auditoria-completa-seguranca|prompt de auditoria completa]] — prompt que originou esta investigação.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada de todos os achados desta auditoria.

## Atualizações

- 2026-08-17: achado registrado e verificado manualmente contra o código (não só relatado por agente) via auditoria completa de segurança.
