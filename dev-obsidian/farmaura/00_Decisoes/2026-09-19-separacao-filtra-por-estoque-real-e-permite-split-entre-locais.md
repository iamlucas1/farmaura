---
cssclasses: ia-nota
---

# 2026-09-19 — Separação de Pedidos Online: só locais com estoque real do item, com opção de dividir entre dois locais

## Contexto

Pedido do usuário: no seletor de local de retirada de cada item da Separação (drawer de
Pedidos Online), filtrar para aparecerem só os locais onde o item de fato tem estoque — em vez da
lista fixa de todos os locais ativos da loja (`ctx.inventoryLocations`, sem relação nenhuma com o
produto específico daquela linha). E, quando o item foi conferido em dois locais diferentes
(primeira prateleira não tinha a quantidade toda), permitir registrar isso com a quantidade de
cada local.

## Decisão

- **Filtro por estoque real**: reaproveitado o endpoint que o PDV já usa para o mesmo problema —
  `GET /pdv/products/{item_id}/locations` (`PdvService.list_item_locations`), que já retorna só
  locais com lote disponível (`status='available'`, `quantity>0`) para um `inventory_item_id`. Não
  era exposto para pedidos online porque `InternalOrderItemResponse` nunca mandava o
  `inventory_item_id` do item pro frontend — adicionado (aditivo, `inventory_item_id: str = ""`).
  No frontend, `OrderDrawer` passou a buscar isso por item (`fetchPdvItemLocations`, já existente
  no `ctx` para o PDV, reaproveitado tal e qual) com o mesmo padrão de `useEffect` que o PDV já usa
  em `point-of-sale-screen.jsx` (busca só os `inventory_item_id` ainda não carregados, guarda num
  mapa local `{ [inventoryItemId]: locations[] }`).
- **Split entre dois (ou mais) locais**: mudança de schema — `order_items.storage_location_snapshot`
  (string única) não representa "3 unidades do A1-05 + 2 do B2-03". Nova coluna
  `order_items.pick_locations` (JSON, `[{location_code, location_name, quantity}]`,
  migration `20260919_01_order_item_pick_locations`). `storage_location_snapshot` continua
  existindo, mas agora como resumo derivado (`"A1-05 (3) + B2-03 (2)"` quando há split, ou só o
  código quando é um local só) — nenhum outro consumidor dessa coluna além de `order_service.py`
  foi encontrado (`pdv_order_item.py`/`pdv_sale_item.py` são modelos separados, não afetados).
  Endpoint `POST /orders/{order_id}/items/{item_id}/location` trocou de `{location_code}` para
  `{locations: [{location_code, quantity}, ...]}`; o backend valida que a soma das quantidades bate
  exatamente com `item.quantity` antes de salvar (`422` se não bater), e rejeita local duplicado na
  mesma requisição.
- **UX**: no caso comum (um local só, cobrindo a quantidade inteira) o comportamento é idêntico ao
  de antes — selecionar no dropdown salva na hora, sem passo extra. O split só aparece quando o
  operador clica em "Retirado de outro local também" (só visível quando o item tem estoque em mais
  de um local): aí aparece um input de quantidade por linha, um contador "X/Y un alocadas" (verde
  quando bate com a quantidade do item, âmbar quando não bate) e um botão "Salvar" que só habilita
  quando a soma bate — evita salvar um split incompleto ou incorreto.

## Consequências

- **Mudança de contrato que quebra clientes antigos do endpoint de local** (não é aditiva):
  `location_code` (string) trocou para `locations` (lista) no request. Backend antigo em produção
  ainda espera o formato velho — deploy deste backend em produção exige a migration
  `20260919_01` aplicada primeiro (ver
  [[../06_Pendencias/aplicar-migration-order-item-pick-locations-em-producao|pendência]]) e o
  frontend/backend sobem juntos (não dá pra subir só um dos dois sem quebrar a atualização de
  local).
- Testado via Playwright contra o Docker local com dado real: item com estoque em 3 locais
  (`Amoxicilina 500mg`, pedido FA-1005) mostra o botão de split; itens com 1 local só não mostram
  (nada muda pra eles); adicionar uma segunda linha mostra os inputs de quantidade, o contador de
  alocação e desabilita "Salvar" até bater a soma.
- Nenhum item de estoque no seed local tem hoje lote em mais de um local em quantidade que valha a
  pena testar um split "de verdade" (a maioria dos itens do seed tem 1 local só) — a mecânica foi
  validada (adicionar/remover linha, contador, gate do Salvar), mas não um salvamento completo com
  soma balanceada, por falta de um item de teste com estoque dividido e quantidade de pedido > 1
  simultaneamente no seed atual.

## Ver também

- [[../06_Pendencias/aplicar-migration-order-item-pick-locations-em-producao|Aplicar migration em produção]]
- [[../06_Pendencias/alembic-version-ausente-no-postgres-local|alembic-version-ausente-no-postgres-local]] — reincidiu de novo ao gerar esta migration; causa raiz identificada nesta sessão.
- [[2026-09-19-pedidos-online-itens-padrao-pdv-e-modal-de-retirada|Itens no padrão visual do PDV]] — mesma seção de Separação, reformulada antes nesta sessão.
