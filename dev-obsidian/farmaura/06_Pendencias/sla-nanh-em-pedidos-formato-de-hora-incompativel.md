---
cssclasses: ia-nota
---

# SLA de pedidos exibe "NaNh" — formato de hora incompatível

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-11

## Descrição

Na tela de pedidos do console interno (`orders-screen.jsx`, kanban), o indicador de SLA decorrido de alguns pedidos exibe "NaNh" em vez de um tempo válido. A função `minsSince()`/`_hm()` (em `core/internal-shell.jsx`) espera que `o.placed` esteja no formato `"HH:MM"`; aparentemente nem todo pedido de demonstração segue esse formato, e o cálculo de diferença de tempo produz `NaN` silenciosamente.

## Contexto

Encontrado durante a migração visual completa do console interno para o design "Farmaura Operações" ([[../00_Decisoes/2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|ADR]]), ao revisar `orders-screen.jsx` no lote D. É um bug pré-existente, não introduzido pela migração — a migração foi deliberadamente restrita a JSX/apresentação, sem tocar lógica de cálculo, então este bug de dados ficou fora do escopo e foi apenas disclosado, não corrigido.

Suspeita: o formato `"HH:MM"` esperado por `o.placed` não bate com o que `populate_demo_content.py`/seed local geram para alguns pedidos — vale investigar ali antes de mexer em `minsSince()`/`_hm()`.

**Causa raiz confirmada em 2026-09-19** (ao implementar a coluna "Prazo" em contagem regressiva, ver [[../00_Decisoes/2026-09-19-pedidos-online-pagamento-traduzido-prazo-e-priorizacao-automatica|ADR]]): a função `label()` em `farmaura-api/scripts/seed.py` grava `placed_at_label` como `"DD/MM/AAAA HH:MM UTC"`, enquanto o caminho real de criação de pedido (`order_service.py`, checkout do marketplace) grava só `"HH:MM"` (`now.astimezone(UTC).strftime('%H:%M')`). Todo pedido de seed que usa `label()` bate nesse formato incompatível. Corrigido apenas no consumidor novo (o parser da coluna Prazo em `orders-screen.jsx` aceita os dois formatos); o card de SLA do drawer (`minsSince()`/`_hm()` em `core/internal-shell.jsx`) continua exibindo "NaNh em aberto" para esses pedidos — ainda não corrigido.