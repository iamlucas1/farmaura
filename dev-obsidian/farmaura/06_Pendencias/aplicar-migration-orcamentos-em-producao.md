# Aplicar migration Alembic do módulo Orçamentos em produção

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-07-23

## Descrição

As tabelas `purchase_quotes`, `purchase_quote_items` e `purchase_quote_payment_terms` (módulo [[../02_Documentacao/Modulo_Orcamentos|Orçamentos]]) existem nos models e no código do backend, mas **não existem ainda no banco de produção**. A migration já foi gerada e verificada — falta só rodar em produção:

```
alembic stamp 20260723_01
alembic upgrade head
```

Nessa ordem — ver [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] para o passo a passo completo e por que a ordem importa (rodar `upgrade head` direto, sem o `stamp` antes, falha tentando recriar tabelas que já existem).

## Contexto

Farmaura foi para produção em 2026-07-22, e a política de schema mudou para exigir migrations Alembic (ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão]]) — o próprio módulo de Orçamentos foi o gatilho dessa mudança, por ter sido construído (Fase 1) do jeito antigo, direto no ORM/bootstrap, antes da política mudar. A migration foi gerada, dividida (baseline + Orçamentos) e testada de ponta a ponta em Postgres isolado, mas a aplicação real em produção ficou para o usuário decidir quando rodar — nenhuma ação foi tomada contra o banco real durante o desenvolvimento.

Até esta migration ser aplicada, o módulo de Orçamentos (telas "Cotações", "Comparar fornecedores" e "Painel de Compras" no console interno) não funciona em produção — as rotas de API vão falhar por falta das tabelas.
