# Admin não conseguia ocultar/ajustar item de estoque fora da "loja primária" — falha silenciosa

**Tipo:** Vulnerabilidade
**Severidade:** Alta
**Status:** Resolvido — 2026-07-20
**Data de identificação:** 2026-07-20

## Descrição

`InventoryService._require_item()` (usado por `update_item`, `adjust_item` e `transfer_item` em `app/services/inventory_service.py`) resolvia a loja do lookup via `_get_store_id()` **sem** `allow_all_stores=True`. Para um usuário `admin` (acesso `hybrid`, sem `store_id` próprio), essa chamada caía no fallback `get_primary_store_id(tenant_id)` — ou seja, `PUT /inventory/items/{id}` só conseguia enxergar itens da loja "primária" do tenant. Um item pertencente a qualquer outra loja retornava `404 Inventory item not found`, uma mensagem genérica que não indica o motivo real (a loja errada, não a inexistência do item).

`GET /inventory/items` (listagem) não tinha esse problema — já passava `allow_all_stores=True` para admins, então a tabela do Precificador mostrava itens de todas as lojas normalmente. Só a escrita por id ficava restrita, criando uma divergência entre "o que o admin vê" e "o que o admin consegue de fato editar".

Um segundo bug, no frontend, mascarava a falha: `setItemPricing()` em `farmaura/react/internal/core/internal-app.jsx` aplicava a mudança (ex.: badge "Oculto") no estado local **antes** do `PUT` resolver (otimista) e, se a requisição falhasse, só mostrava um toast passageiro — nunca revertia o estado local. O Precificador continuava mostrando "Oculto" mesmo quando nada tinha sido salvo, sem nenhum indicador visual duradouro do erro.

## Impacto

Encontrado ao investigar um relato do usuário: ocultou "Amoxicilina 500mg 21 cápsulas EMS" nas duas lojas pelo Precificador, mas o produto continuava comprável em `/marketplace/product/mkt-amoxicilina-...`. Reproduzido via curl direto contra a API: `PUT` na loja primária retornava `200`; na segunda loja, `404`. A ocultação na primeira loja funcionou; na segunda, falhou silenciosamente — o item ficou com `is_marketplace_visible = true` no Postgres, e o marketplace (que lê o catálogo ao vivo do banco, nunca de cache) corretamente continuava servindo e vendendo o produto porque, para aquela loja, ele genuinamente ainda estava publicado.

Numa farmácia, isso é sensível: um produto que um admin acredita ter retirado de venda (recall, ruptura de lote, decisão comercial) pode continuar à venda numa das lojas sem que ninguém perceba, já que a UI mentia "Oculto". O mesmo padrão de bug afeta `adjust_item` (correção de estoque) e `transfer_item` para qualquer item fora da loja primária — silenciosamente rejeitados com 404 em vez de aplicados.

**Não havia risco de venda duplicada/overselling**: o carrinho (`CustomerService._require_marketplace_product`) e o checkout (`OrderService.create_marketplace_order`) já re-derivam o catálogo agrupado ao vivo do banco a cada chamada — nunca de cache — e rejeitam produto oculto/indisponível de forma independente deste bug. O problema era exclusivamente "o admin não consegue de fato ocultar/ajustar um item fora da loja primária", não uma falha nas guardas de compra.

## Mitigação / Tratamento

- **Backend:** `_require_item()` agora chama `_get_store_id(allow_all_stores=True)`. Papéis não-admin continuam restritos à própria loja — a branch `elif self.subject.store_id` em `_get_store_id()` tem prioridade sobre `allow_all_stores`, então um farmacêutico/gerente/caixa não ganha acesso a outras lojas por essa mudança.
- **Frontend:** `setItemPricing()` agora reverte o item ao estado anterior quando o `PUT` falha, e o toast de erro deixa explícito que a alteração foi desfeita.
- **Padrão para novos helpers `_require_*` de item único** (evitar recorrência): se o recurso pode pertencer a qualquer loja de um tenant multi-loja e o lookup é por id (já inequívoco), resolver a loja com `allow_all_stores=True` — restringir por loja só faz sentido em endpoints de *listagem*, onde o usuário está escolhendo o que ver, não em busca por id específico.
- Testado ponta a ponta: reproduzido o 404 via curl, aplicado o fix, containers reconstruídos, mesma chamada retornando `200`; confirmado no Postgres que as duas linhas do produto reportado ficaram com `is_marketplace_visible = false`; confirmado que `/catalog/public` parou de retornar o produto.

## Referências

`app/services/inventory_service.py` (`_require_item`, `_get_store_id`), `app/repositories/inventory_repository.py` (`get_item_by_id`), `farmaura/react/internal/core/internal-app.jsx` (`setItemPricing`).

## Ver também

- [[../02_Documentacao/Visao_Geral|Visão Geral]] — arquitetura geral do backend.
- [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|Migração Redis → Valkey e cache de catálogo]] — trabalho da mesma sessão que motivou a investigação (confirmou que o cache de catálogo não tinha relação com este bug).

## Atualizações

- 2026-07-20: nota criada, achado já resolvido no mesmo dia.
