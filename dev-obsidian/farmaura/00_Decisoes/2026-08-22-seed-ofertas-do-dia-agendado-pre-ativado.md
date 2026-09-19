---
cssclasses: ia-nota
---

# 2026-08-22 — Seed determinístico e `populate_demo_content.py` passam a ativar "ofertas do dia" (modo agendado) por padrão

## Contexto

Pedido do usuário: poder testar o modo `scheduled` (agendado) de "ofertas do dia" — ver
[[2026-08-15-ofertas-do-dia-modo-agendado-e-offers-reaproveitada|ADR que introduziu o modo]] — sem
precisar configurar nada manualmente no console interno, tanto ao rodar o script de conteúdo de
demo quanto ao resetar o ambiente Docker local do zero. Até então, um tenant novo nascia sempre com
`deal_of_the_day.mode="off"` (default do schema) — o modo agendado nunca tinha sido testado
ponta a ponta via clique real (ver observação nesse sentido no ADR anterior).

## Decisão

1. **`farmaura-api/scripts/seed.py`** ganhou `build_deal_of_the_day_settings(catalog)`, chamado em
   `seed_database()` junto com `build_cnae_settings()`. Grava direto um `PortalSetting` (`setting_key
   ="deal_of_the_day"`, `portal_name="internal"`) já com `mode="scheduled"` e 7 `schedule_entries`
   (`specific_dates`, uma por dia a partir de hoje) — datas ancoradas em `datetime.now()` (fuso
   América/São Paulo), não em `SEED_NOW`, mesma lógica de `build_coupon_campaigns` para não ficar
   desatualizado conforme o tempo real passa. Produtos rotacionam por uma lista fixa de 20 chaves de
   catálogo, todas OTC (nunca `requires_prescription`/`is_controlled`, para parecer uma promoção real
   de loja) — `DEAL_OF_THE_DAY_CANDIDATE_KEYS`.
2. **`farmaura-api/scripts/populate_demo_content.py`** ganhou `--deal-mode {manual,scheduled}` (agora
   `scheduled` por padrão, era só `manual` antes) e `--scheduled-days N` (padrão 7) — mesma ideia,
   via HTTP contra uma API já no ar, para reaproveitar em `lumos-dev`/ambientes que não passam pelo
   seed determinístico de banco.
3. Efeito colateral aceito: como `seed.py` só roda quando o banco está vazio
   (`should_seed_database`), isso só ativa em banco novo — resetar sem apagar dados (`docker compose
   restart` sem `down -v`/recriar volume) não reativa nada, o `deal_of_the_day` já persistido
   continua como está.

## Verificação

Testado nesta sessão: `docker compose down -v && docker compose up -d --build` local — log
`Seed concluido com sucesso.`, `GET /portal/marketplace/public-bootstrap` retornou
`deal_of_the_day.mode="scheduled"`, entrada de hoje resolvida (`title="Ofertas de Sábado"`,
`subtitle="22/08"`, 5 `product_refs`), todos os refs confirmados presentes como `aliases` em
`GET /catalog/public` (produtos resolvem de verdade, não são refs soltos). Consulta direta em
`portal_settings` confirmou 7 `schedule_entries` persistidas.

## Consequências

- Todo ambiente que reconstruir o banco do zero (local ou uma futura reprodução do mesmo padrão em
  `lumos-dev`) passa a nascer com "ofertas do dia" já visível na home/`, /offers` do marketplace —
  cenário de demo/preview muda de "seção vazia" para "seção populada" por padrão. Aceito
  explicitamente pelo usuário (pedido direto).
- Console interno (Portal → Ofertas do dia) agora sempre mostra 7 entradas de calendário
  pré-populadas num ambiente novo — um admin real revisando pela primeira vez precisa saber que isso
  é conteúdo de seed, não curadoria real (mesmo racional de "conteúdo de demo" já documentado em
  [[../07_POPs_Processos/popular-conteudo-demo|popular-conteudo-demo]]).

## Ver também

- [[2026-08-15-ofertas-do-dia-modo-agendado-e-offers-reaproveitada|ADR: modo agendado (calendário)]]
- [[2026-08-05-populate-demo-content-via-api-e-reset-v2-com-farmaura|ADR: populate_demo_content.py via HTTP]]
- [[../07_POPs_Processos/popular-conteudo-demo|POP: popular conteúdo de demo]] — atualizado com as
  flags novas.
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]]