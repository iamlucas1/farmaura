# Paginação implementada de forma ad-hoc, sem padrão compartilhado

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-07-19

## Descrição

Não existe um schema/dependência de paginação reutilizado — cada rota define seus próprios parâmetros:

- `catalog.py`: `page`/`page_size` (padrão 20, máx 100)
- `inventory.py` (itens): `page`/`page_size` (padrão 30, máx 100)
- `inventory.py` (movimentações): só `limit` (padrão 50, máx 200), sem page/offset
- `pdv.py` (busca de produto): só `limit` (padrão 20, máx 50)
- `crm.py` `/customers`, `customers.py` `/me/addresses`, `/me/cart`: **sem nenhum parâmetro de paginação** — retornam lista completa

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19. Os endpoints sem paginação nenhuma são o risco mais concreto — crescem sem limite conforme a base de clientes/endereços/itens de carrinho aumenta. Vale criar um `PaginationParams` compartilhado e aplicar de forma consistente, começando pelos endpoints sem limite nenhum.

## Ver também

- [[secure-api-endpoint]] (`_Compartilhado/Skills/`) — lista "paginação sem limite" explicitamente como anti-padrão a evitar.
