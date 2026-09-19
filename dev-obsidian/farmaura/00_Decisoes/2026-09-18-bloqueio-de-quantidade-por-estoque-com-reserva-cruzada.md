---
cssclasses: ia-nota
---

# 2026-09-18 — PDV: quantidade travada no estoque da loja, com desdobramento em reserva de outra loja

## Contexto

Pedido: "bloqueios, como a do desconto para termos a margem, mas também de quantidades dos produtos com a que tem no estoque, bloqueando a venda caso não tenha na loja, permitindo somente para compras com o que tem no estoque. Mas caso a pessoa queira mais produtos que tenha em outra loja, permita vender o que está no estoque e retirar na outra loja as demais unidades."

Ou seja: hoje o stepper de quantidade do carrinho (`pdvSetQty`) não tinha nenhum teto — dava pra adicionar 50 unidades de um item com 2 no estoque, e o erro só aparecia (409 "Estoque insuficiente") quando o farmacêutico já tinha terminado o atendimento e clicava "Enviar para o caixa". O padrão de referência pedido (limite de desconto por margem, `fetchPdvDiscountLimit`/`discountLimit`) já existia e funciona assim: um teto é calculado, mostrado como hint, e o campo trava nele proativamente — o servidor some validando de novo no commit.

## Decisão

### Teto de quantidade por estoque da loja atual

Reaproveitado `itemLocations[l.id]` (já buscado para o dropdown de local de retirada — soma dos locais dá o estoque real da loja daquele item) como a fonte do teto, em vez de criar um novo endpoint:

- `currentStock = null` enquanto `itemLocations[l.id]` não carregou (não bloqueia à toa antes de ter dado certo).
- `atStockCap = l.qty >= currentStock` uma vez carregado.
- Botão "+" do stepper do carrinho fica `disabled` no teto.
- `addComponent` (re-clicar em "adicionar" na busca, para um item já no carrinho) também passou a checar contra `component.qty` (o estoque real da loja, já vem fresco na própria busca) — sem isso dava pra furar o teto do stepper simplesmente clicando de novo no resultado da busca.
- Ao bater no teto, aparece uma dica inline (`.pdv-cart-line-stock-hint`, tom `--warning`): "Estoque máximo desta loja: N un." + botão "Reservar mais em outra loja".

### Reserva do excedente em outra loja

Esse botão reaproveita 100% o mecanismo de reserva que já existia no card de busca (usado quando um produto está zerado na loja atual) — `reservationTarget`/`confirmReservation`/`pdvCreateReservation`, sem nenhuma mudança nesse fluxo em si:

1. `openExtraReservation(line)` chama `pdvSearchProducts(line.name)` para pegar o estoque de todas as lojas de novo (fresco, não guardado do momento em que o item entrou no carrinho).
2. Se só uma outra loja tem estoque, abre a modal de reserva direto nela.
3. Se mais de uma, abre `PdvRestockPickerModal` (novo) para escolher, e a escolha abre a mesma modal de reserva de sempre.
4. Reservar não altera a linha do carrinho atual — ela continua vendendo só o que a loja tem; a reserva é um pedido `is_reservation=true` separado, na loja de destino, para o cliente retirar lá.

### Bug de RLS descoberto no caminho: reserva entre lojas nunca funcionou para farmacêutico/gerente

Ao testar como `paula.sena@farmaura.com.br` (farmacêutica de verdade, não admin), a busca cross-loja voltava só a própria loja, e depois a criação da reserva falhava com "Inventory item not found" e depois "banco de dados indisponível". Investigando: **toda a arquitetura de reserva entre lojas já foi projetada para isso** — o próprio código documenta a intenção (`PdvService._prepare_lines`: *"Items are looked up by id across every store in the tenant... since the balcão can now source a line from whichever branch actually has stock"*; `create_reservation`: *"queued against the destination store... not the requesting pharmacist's own"*) — mas as policies de RLS nunca foram atualizadas para permitir isso. `can_access_store_row()` (`role='admin' OR store_id = current_store_id()`) restringe farmacêutico/gerente à própria loja em várias tabelas; só `admin` nunca esbarrava nisso, e a maioria dos testes anteriores deste projeto usou a conta admin (`adriana.lima@farmaura.com.br`), o que escondeu o problema.

**Corrigido** com policies adicionais (nunca substituindo as originais — policies permissivas do mesmo comando se combinam com OR, então isso só *amplia* acesso, nunca reduz o que já funcionava):

| Tabela | O que faltava | Policy nova | Escopo |
|---|---|---|---|
| `inventory_items` | `search_products` não via estoque de outra loja | `..._cross_store_read_policy` (SELECT) | manager/pharmacist, tenant inteiro |
| `inventory_items` | `SELECT...FOR UPDATE` exige policy de UPDATE também, não só SELECT | `..._cross_store_fulfillment_policy` (UPDATE) | manager/pharmacist, tenant inteiro |
| `stores` | nome da loja de destino caía no fallback genérico "Loja" | `stores_cross_store_read_policy` (SELECT) | manager/pharmacist, tenant inteiro |
| `pdv_orders` | INSERT do pedido de reserva na loja de destino | `..._cross_store_reservation_policy` (INSERT) + companion SELECT (`session.refresh` do ORM) | manager/pharmacist, **só `is_reservation=true`** |
| `pdv_order_items` | idem, item do pedido de reserva | INSERT + SELECT companion, mesmo padrão | idem, via join a `pdv_orders.is_reservation=true` |
| `inventory_movements` | log de auditoria da baixa de estoque na loja de destino | INSERT + SELECT companion | manager/pharmacist, tenant inteiro |
| `inventory_stock_lots` | `decrement_lot_fefo` lê e decrementa o lote na loja de destino | SELECT + UPDATE | manager/pharmacist, tenant inteiro |
| `inventory_lot_movements` | idem, log do lote | INSERT + SELECT companion | manager/pharmacist, tenant inteiro |

Todas em `app/core/row_level_security.py` (bootstrap idempotente, não migration — reaplica a cada start do container).

**Por que restringir `pdv_orders`/`pdv_order_items` a `is_reservation=true`** (e não liberar geral, como as demais): essas duas são as únicas tabelas onde a ação em si (criar um pedido) é sensível o bastante para valer a pena o escopo mais estreito — um farmacêutico continua *não* podendo abrir um pedido comum em outra loja, só reservas. Testado e confirmado (`INSERT ... is_reservation=false` como farmacêutico em outra loja → RLS rejeita, como esperado). As demais tabelas (estoque, movimentações) são exatamente onde o `inventory_products` já dava acesso irrestrito multi-loja para esses dois papéis há muito tempo — ampliar `inventory_items`/lotes/movimentações do mesmo jeito não é uma escalada de confiança nova, só fecha uma inconsistência entre tabelas irmãs.

## Consequências

- Testado de ponta a ponta como `paula.sena` (farmacêutica real, não admin): estoque de 2 un. na loja dela, tentar adicionar um 3º trava o "+", aparece "Estoque máximo desta loja: 2 un." com "Reservar mais em outra loja"; busca cross-loja agora encontra a outra loja (5 un.), abre a modal de reserva com o nome certo da loja ("Reservar em Farmaura Ponte Alta Norte" — antes caía no fallback genérico), confirma a reserva, pedido `RSV-...` criado na loja de destino, estoque de lá decrementado de 5→4 corretamente.
- Confirmado que o carve-out não abre `pdv_orders` para pedidos comuns fora da própria loja (só reservas).
- Sem migration nova — tudo via bootstrap de RLS, aplicado ao reiniciar o container `farmaura-api`.

## Atualização 2026-09-18 (2) — confirmado: unidade reservada já bloqueia venda na loja de destino

Pergunta do usuário: se a última unidade de um produto em outra loja for reservada, e um cliente diferente tentar comprar esse mesmo produto ali (não para retirar a reserva, uma venda nova), o sistema já bloqueia?

**Sim, sem precisar de nenhuma mudança** — `create_reservation` decrementa `InventoryItem.quantity` (e o lote correspondente) na hora, exatamente como uma venda normal, e não como uma "flag de reservado" separada. Isso significa que qualquer busca/tentativa de adicionar ao carrinho depois disso já lê o estoque reduzido, na mesma coluna que qualquer outra venda usa.

Confirmado com teste real: zerei o estoque de "Protetor Solar FPS 70" em Águas Claras, deixei 1 unidade em Ponte Alta Norte, reservei essa unidade como farmacêutica de Águas Claras (Paula) — e então logada como **a farmacêutica de Ponte Alta Norte** (Helena, a loja onde a unidade fisicamente está), a busca do mesmo produto já mostra "esgotado" e o botão de adicionar fica desabilitado. A trava vale tanto no servidor (`_prepare_lines`, com `SELECT...FOR UPDATE`, então nem uma corrida entre duas vendas simultâneas consegue vender a mesma unidade duas vezes) quanto na tela.

De brinde, ao investigar isso confirmei que a reserva não é permanente: `PdvService.list_queue` expira preguiçosamente reservas com mais de 48h (`RESERVATION_HOLD_HOURS`) toda vez que a fila é consultada, devolvendo o estoque via `_return_stock_and_cancel` — então uma reserva não retirada não trava o produto para sempre.

## Ver também

- [[2026-09-17-integracao-maquininha-itau-via-agente-usb-local]] — outra mudança recente no mesmo card do carrinho/PDV.
- `app/core/row_level_security.py` — todas as policies novas ficam logo depois de suas policies-mãe (`inventory_items_access_policy`, `stores_access_policy`, `pdv_orders_access_policy`, etc.), com comentário explicando o motivo de cada uma.