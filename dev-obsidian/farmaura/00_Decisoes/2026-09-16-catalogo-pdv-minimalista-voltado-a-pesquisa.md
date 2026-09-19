---
cssclasses: ia-nota
---

# 2026-09-16 — Catálogo de produtos do PDV: minimalista, sem lista de navegação por padrão

## Contexto

O card de catálogo do PDV mostrava, com a busca vazia, uma lista de até 30 produtos em estoque — visualmente pesado e sem propósito claro (o fluxo real do farmacêutico é buscar/bipar, não navegar por uma lista genérica). Pedido: reformular para algo mais minimalista e voltado à pesquisa.

## Decisão

- **Sem lista por padrão**: com a busca vazia, o card mostra um `EmptyState` (ícone de lupa, "Busque um produto para começar", "Digite o nome, a marca, o EAN — ou bipe o código de barras do produto.") em vez de qualquer listagem. A busca deixa de competir com uma lista de navegação — ela é o único ponto de entrada.
- **Resultado sem correspondência** também virou `EmptyState` (era um texto simples cinza) — consistência visual com o estado vazio.
- **Linhas de resultado mais enxutas**: removida a caixa de ícone (34×34px) de cada linha — nome do produto e o badge "Controlado" (quando aplicável) ficam na mesma linha, EAN/local logo abaixo, preço e ação à direita. Mesmo padrão de reserva em outra loja (expansível) de antes, só com o recuo ajustado por não ter mais a coluna do ícone.
- Removida `dedupeByName`, que só existia para montar a lista de navegação agora eliminada — sem mais nenhum uso no arquivo.

## Consequências

- Testado via Chrome headless: busca vazia, busca com resultados (múltiplas variantes de um produto), busca sem correspondência, e clique num resultado adicionando ao carrinho normalmente — tudo funcionando sem mudança de contrato com o backend (`pdvSearchProducts`/`addComponent`/`openReservation` inalterados).

## Ver também

- [[2026-09-16-produto-nao-encontrado-busca-ao-vivo-e-visual-distinto|card "Não encontrou o produto?"]] — mesma leva de trabalho no PDV, cuidado equivalente para não confundir os dois campos de busca.