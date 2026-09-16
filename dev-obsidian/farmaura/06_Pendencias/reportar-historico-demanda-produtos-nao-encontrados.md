# Tornar consultável o histórico de "produto que o cliente queria e não encontramos"

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-13

## Descrição

A caixa "Produto que o cliente queria e não encontramos" do PDV (ver [[../00_Decisoes/2026-09-13-pdv-ajuste-visual-vs-artifact-e-produto-nao-encontrado|ADR]]) registra a demanda via `PdvService.log_demand` como um evento de log estruturado (`pdv_product_demand`), não numa tabela — não há hoje nenhuma tela ou relatório que agregue "quais produtos os clientes mais pediram e não encontramos" ao longo do tempo, só leitura bruta do log da API.

## Contexto

Decisão deliberada de escopo: implementar uma tabela nova (modelo + migration + repositório + endpoint de listagem) para um recurso cuja necessidade de relatório ainda não foi confirmada pelo usuário pareceu desproporcional ao pedido original (ajuste visual do PDV). Se a farmácia quiser decidir compras/reposição com base nisso, migrar o registro de `logger.info` para uma tabela própria (ex.: `pdv_demand_request`) com uma tela simples de listagem/contagem por produto seria o próximo passo natural.
