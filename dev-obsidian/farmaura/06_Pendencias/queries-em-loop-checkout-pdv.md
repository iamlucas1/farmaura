# Chamadas ao banco em loop, por item, em checkout e PDV

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-19

## Descrição

Não há uso de `relationship()`/`selectinload`/`joinedload` em nenhum model (todas as queries são explícitas — sem o "alçapão" clássico de N+1 via ORM), mas existem chamadas ao banco por item dentro de loop:

- `order_service.py:263-274` — `get_item_by_id_for_update` por item de pedido.
- `pdv_service.py:564-566, 1072-1073, 1141-1142` — idem para itens de carrinho/preview de desconto do PDV.
- `pdv_service.py:728-742, 1011-1012` — inserções por item de venda/linha de transação em loop.
- `portal_service.py:598-600, 675-677` — `session.delete(record)` por registro em loop.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19. Plausivelmente intencional — `get_item_by_id_for_update` precisa de lock de linha por item, difícil de fazer em lote com segurança — mas ainda assim escala linearmente com o tamanho do carrinho/pedido. Baixo risco hoje (carrinhos pequenos), mas vale reavaliar se volumes por pedido crescerem.

## Ver também

- [[excecao-delivery-pricing-cross-service]] — mesmo `pdv_service.py`/checkout, outra pendência arquitetural documentada a partir do mesmo fluxo.
