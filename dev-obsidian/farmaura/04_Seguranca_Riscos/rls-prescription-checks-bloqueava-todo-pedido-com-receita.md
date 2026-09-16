# RLS de `prescription_checks` bloqueava todo pedido de marketplace com item de receita — RESOLVIDO

**Tipo:** Vulnerabilidade (falha funcional/disponibilidade — RLS falha fechado, sem vazamento cross-tenant)
**Severidade:** Alta (bloqueava 100% dos pedidos de marketplace com item de receita, em qualquer canal de pagamento)
**Status:** Resolvido
**Data de identificação:** 2026-09-02

## Descrição

A policy `prescription_checks_access_policy` (`app/core/row_level_security.py`) usava uma condição
`USING`/`WITH CHECK` própria, diferente das duas tabelas irmãs na mesma hierarquia
(`prescription_files_access_policy`, `prescription_items_access_policy`):

```sql
-- prescription_checks (errado, antes da correção)
prescriptions.reviewed_by_user_id = app_private.current_user_id()
OR app_private.current_user_role() IN ('admin', 'manager', 'pharmacist')

-- prescription_files / prescription_items (correto, usa o helper)
app_private.can_access_prescription_row(prescriptions.customer_id, prescriptions.reviewed_by_user_id)
```

`can_access_prescription_row` inclui `target_customer_id = app_private.current_customer_id()` — a
versão inline de `prescription_checks` não incluía essa condição. Resultado: o próprio cliente
**nunca** conseguia inserir linhas em `prescription_checks` para uma prescrição sua, porque no
momento da criação `reviewed_by_user_id` ainda é `NULL` (a receita ainda não foi revisada) e o
papel do cliente é `customer`, não `admin`/`manager`/`pharmacist` — nenhuma das duas condições da
policy batia.

`OrderService._create_prescription_snapshot` (chamado por `create_marketplace_order` sempre que o
pedido tem item que exige receita, em **qualquer** canal de pagamento) insere 4 linhas de checklist
nessa tabela logo após criar a `Prescription` do pedido — então **todo** `POST /orders` com item de
receita batia nessa policy e falhava com `psycopg.errors.InsufficientPrivilege`, sem tratamento
específico em `core/exceptions.py`, virando uma falha de conexão bruta pro cliente
(`net::ERR_FAILED` no navegador, não um 4xx limpo).

## Impacto

Nenhum vazamento cross-tenant — a falha é "fechada" (nega acesso demais, não de menos). O impacto
real é de disponibilidade: **nenhum pedido de marketplace contendo item de receita jamais pôde ser
finalizado**, desde que esse código existe — Pix, cartão, qualquer método, o pedido sempre falhava
no momento da criação do snapshot de prescrição. Não é uma regressão desta sessão: o bug já
existia antes de qualquer mudança feita hoje; só nunca tinha sido exercitado ponta a ponta (testes
anteriores desse fluxo cobriram o gate de pagamento, mas pararam antes de realmente colocar um
pedido).

## Mitigação / Tratamento

Corrigido trocando a condição inline pelo mesmo helper `app_private.can_access_prescription_row`
já usado pelas duas tabelas irmãs — consistência total entre as três policies da hierarquia de
prescrição. `bootstrap_database.py` reaplica RLS a cada start do container (idempotente, já
existia), então a correção só exigiu rebuild + restart do `farmaura-api` em dev — nenhuma migration
necessária (é definição de policy, não schema).

## Referências

- [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR onde foi encontrado e corrigido]] (Segunda rodada).
- [[rls-pos-commit-quatro-servicos-nao-corrigidos|RLS pós-commit — 2 métodos ainda não corrigidos]] — achado relacionado (mesma área de código, classe de bug diferente: aqui é condição incompleta na própria policy, não contexto perdido após commit).

## Atualizações

- 2026-09-02: nota criada — achado e corrigido no mesmo dia, ao testar ponta a ponta o pré-pedido de receita física.
