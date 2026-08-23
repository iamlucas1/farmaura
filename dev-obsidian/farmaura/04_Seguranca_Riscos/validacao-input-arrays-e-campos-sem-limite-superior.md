# Validação de input: arrays/campos numéricos sem `max_length`/limite superior em alguns schemas

**Tipo:** Vulnerabilidade/inconsistência (validação de input incompleta)
**Status:** CONFIRMADO
**Severidade:** MÉDIO (item 1) / BAIXO (itens 2 e 3)
**Sistema afetado:** `farmaura-api`
**Categoria:** Validação de input / DoS de baixo custo
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

O padrão do projeto é limitar arrays e campos numéricos com `max_length`/`ge`/`le` no schema Pydantic (ex.: `product_refs`/`schedule_entries` limitados a 30, itens de pedido/PDV limitados a 50-100). Três inconsistências encontradas onde esse cuidado não foi aplicado:

1. **`CustomerProfileUpdateRequest.marketing_program_preferences`/`communication_channel_preferences`** (`app/schemas/customers.py:65-66`) — `list[dict[str, bool | str]] = Field(default_factory=list)`, **sem `max_length`**, e as strings dentro do dict também sem `max_length`. Endpoint `PUT /me/profile`, acessível a qualquer `UserRole.CUSTOMER` autenticado (barreira baixa). Diferente dos campos vizinhos no mesmo schema (`cpf`, `children_count: ge=0, le=20`), que seguem o padrão de limite.
2. **`quantity_delta`** em `LotAdjustmentRequest`/`InventoryAdjustmentRequest` (`schemas/inventory_lot.py:84`, `schemas/inventory.py:229`) — `int` sem `ge`/`le`. Há defesa em profundidade no service (rejeita saldo negativo) e `CheckConstraint("quantity >= 0")` no banco, mas nenhum limite **superior** — um valor absurdamente grande pode estourar o range de `INTEGER` do Postgres, causando 500 não tratado. Exige papel interno.
3. **Arrays de itens em orçamento/nota fiscal** (`schemas/purchase_quote.py:144-145`, `schemas/inventory.py:367`) — `items`/`payment_terms` sem limite superior, diferente de `orders.py`/`pdv.py`, que usam `max_length=50/100` consistentemente. Exige papel interno (ADMIN/MANAGER).

## Evidência

Ver localizações acima; cada uma confirmada por ausência de `max_length`/`le` no `Field(...)` correspondente, contrastando com o padrão já aplicado em campos irmãos do mesmo schema.

## Cenário de risco

Item 1 é o mais sensível: um cliente comum (barreira de acesso baixa) envia um payload JSON com um número muito grande de entradas nessas listas (limitado só pelo teto global de corpo de requisição, `max_request_body_bytes=560_000_000`, dimensionado para upload de arquivo, não para JSON de perfil), causando alto consumo de CPU/memória na validação Pydantic e no armazenamento. Itens 2 e 3 exigem papel interno, reduzindo a superfície prática.

## Impacto

Item 1: negação de serviço (esgotamento de memória/CPU) por um ator de baixo privilégio. Itens 2/3: robustez (erro 500) e superfície de abuso limitada a contas internas.

## Pré-condições

Item 1: apenas autenticação de cliente comum. Itens 2/3: papel interno com permissão de ajuste de estoque ou importação de orçamento/nota fiscal.

## Escopo afetado

`app/schemas/customers.py`, `app/schemas/inventory_lot.py`, `app/schemas/inventory.py`, `app/schemas/purchase_quote.py`.

## Causa raiz

Inconsistência de aplicação do padrão de limite já usado em outros campos/arrays do mesmo módulo — não foi replicado nestes schemas específicos.

## Correção sugerida para análise futura

Adicionar `max_length` razoável (ex.: 20-50) às listas e strings do item 1; `le` plausível (ex.: 1.000.000) a `quantity_delta` no item 2; `max_length` consistente (ex.: 200-500) aos arrays de itens no item 3 — seguindo o mesmo padrão já usado em `product_refs`/`schedule_entries`/`orders.py`/`pdv.py`.

## Dependências da correção

Nenhuma migration — mudança de schema Pydantic (validação, não persistência).

## Riscos de regressão

Baixo — limites bem calibrados (acima do uso legítimo real observado) não deveriam rejeitar nenhum caso de uso atual.

## Como validar futuramente que a correção funcionou

Testar que um payload dentro do novo limite continua funcionando normalmente, e que um payload acima do limite é rejeitado com 422 em vez de processado.

## Referências

- [[../06_Pendencias/paginacao-inconsistente-entre-rotas|paginacao-inconsistente-entre-rotas]] — inconsistência de proteção semelhante, em outra camada (listagem em vez de escrita).
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.
