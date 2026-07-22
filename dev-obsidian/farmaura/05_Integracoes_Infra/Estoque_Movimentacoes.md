# Estoque — movimentações internas por loja

**Tipo:** API interna

## Propósito

Registrar entradas, saídas, ajustes e transferências de estoque no console interno, mantendo o saldo agregado do item e o saldo por lote/local consistentes dentro da mesma loja.

## Contrato

- O console usa `GET /inventory/dashboard?store_id=` e `GET /inventory/lots?store_id=` para apresentar uma unidade selecionada por administrador.
- As operações de escrita aceitam o mesmo `store_id` opcional: `POST /inventory/items/{item_id}/adjustments`, `POST /inventory/lots/receipts`, `POST /inventory/lots/{lot_id}/adjustments` e `POST /inventory/lots/{lot_id}/transfers`.
- O parâmetro de loja só tem efeito para administradores. Para gerente e farmacêutico, o backend mantém obrigatoriamente a loja atribuída ao usuário.
- Em cada escrita, o serviço valida o pertencimento do item, lote e local à loja resolvida, além do escopo do tenant e das permissões internas. Um identificador fora desse escopo responde como não encontrado.
- Saídas não podem resultar em saldo negativo. A interface bloqueia preventivamente uma saída maior que o saldo disponível e a API mantém a mesma regra como autoridade final.

## Dependências

- Backend FastAPI: `app/api/v1/inventory.py`, `app/api/v1/inventory_lots.py`, `app/services/inventory_service.py` e `app/services/inventory_lot_service.py`.
- Console React: `farmaura/react/internal/core/internal-app.jsx` e `farmaura/react/internal/screens/inventory-screen.jsx`.
- PostgreSQL com RLS e contexto de tenant/loja, documentado em [[PostgreSQL_RLS]].

## Atualizações

- 2026-07-20: item e lote passaram a retornar e propagar sua loja de origem em cada operação, permitindo movimentar corretamente uma unidade enquanto o administrador visualiza todas as lojas.
- 2026-07-20: a modal de movimentação passou a reinicializar a seleção quando os lotes são recarregados; uma referência de lote obsoleta atualiza o estoque e solicita nova seleção.
- 2026-07-20: nota criada; operações de movimentação passaram a propagar a loja selecionada pelo administrador e a validar item, lote e local nesse mesmo escopo.
