---
cssclasses: ia-nota
---

# Aplicar migration `20260920_05` (módulo NFC-e) em produção — e testá-la antes em Postgres

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

`farmaura-api/alembic/versions/20260920_05_nfce_fiscal_module.py`: evolui `fiscal_documents` (colunas novas, `access_key` nullable, remove `uq_fiscal_documents_number_series` e `ix_fiscal_documents_pdv_sale_id`, cria índices únicos parciais, marca linhas antigas `LEGACY_SIMULATED`) e cria `fiscal_events`, `fiscal_attempts`, `fiscal_number_sequences`, `fiscal_inutilizations` e `product_fiscal_profiles`. O RLS das tabelas novas vem de `row_level_security.py` (bootstrap).

**Não foi executada em Postgres** neste ambiente (sem Docker); só o SQL offline foi gerado e revisado. Antes de produção: rodar `alembic upgrade head` / `downgrade -1` / `upgrade head` no Postgres do Docker local, confirmar o RLS e o índice único por venda. **Não subir o backend novo sem a migration** (o modelo seleciona colunas novas em toda leitura). O `downgrade` recusa reverter se houver documento fiscal real. Encadeia depois de `20260920_04` (todas as de 2026-09-19/20 ainda pendentes). Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]].

## Contexto

Registrada ao implementar o módulo NFC-e. Ver o [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]]. Aplicar em produção exige confirmação explícita do usuário.
