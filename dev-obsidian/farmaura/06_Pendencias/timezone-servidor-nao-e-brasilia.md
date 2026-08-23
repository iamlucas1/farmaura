# Container `farmaura-api` roda em UTC, não Brasília — vários cálculos de "horário local" ficam errados

**Status:** Parcialmente resolvido (só "ofertas do dia")
**Prioridade:** Média
**Registrado em:** 2026-08-16

## Descrição

Confirmado via `docker exec farmaura_api date` que o container não tem `TZ`/tzdata configurado —
roda em UTC. `datetime.now().astimezone()` (sem argumento) em Python resolve pro fuso do SO, então
qualquer código que faça isso pensando estar pegando "horário de Brasília" na verdade pega UTC (3h à
frente).

Corrigido especificamente para "ofertas do dia" nesta sessão — `_BRASILIA_TZ = timezone(timedelta(hours=-3))`
fixo, aplicado em `_deal_cycle_elapsed`, `_current_cycle_date` e `_match_deal_schedule_entry`
(`portal_service.py`) — depois que o usuário reportou que um horário de término configurado não
batia com a hora real.

**Ainda não corrigido**: `portal_service.py` tem outras ~10 chamadas de `.astimezone()` sem esse
cuidado, todas potencialmente com o mesmo desvio de 3h — entre elas: label de "agora"/"hoje" em
algum relatório (`now_label`/`today_label`), `submitted_at_label` de orçamento, `current_month_key`
de financeiro (pode fazer o mês fechar 3h errado perto da virada), dias decorridos de sessão PDV
(`days_elapsed`), filtro de vendas por dia (`created_at.astimezone().date()`), distribuição de
vendas por hora do dia (`by_hour_counts`) e formatação de timestamp de auditoria.

## Impacto

Qualquer relatório/label que diga "hoje" ou agrupe por dia/hora pode estar até 3h deslocado do
horário real da farmácia — mais visível perto de meia-noite (um evento das 23h de Brasília pode
contar como "amanhã" nesses cálculos, já que em UTC já passou da meia-noite).

## Mitigação / Tratamento

Tratado só para "ofertas do dia" (fixed-offset `_BRASILIA_TZ` local à função). Solução mais completa
e correta pro resto do arquivo seria configurar `TZ=America/Sao_Paulo` no `Dockerfile`/
`docker-compose.yml` do `farmaura-api` (corrige todo `.astimezone()` do processo de uma vez, sem
precisar caçar cada call site) — não testado se a imagem `python:3.13.13-slim-bookworm` tem tzdata
instalado por padrão para resolver o nome da zona; se não tiver, `apt-get install tzdata` no
Dockerfile resolve. Ficou de fora desta sessão por ser mudança de infra (Dockerfile) fora do escopo
pedido (só "o contador" de ofertas do dia).

## Referências

`farmaura-api/app/services/portal_service.py` (`_BRASILIA_TZ`, `_deal_cycle_elapsed`,
`_current_cycle_date`, `_match_deal_schedule_entry` — os três já corrigidos; os demais
`.astimezone()` do arquivo, ainda não).

## Ver também

- [[../00_Decisoes/2026-08-15-ofertas-do-dia-modo-agendado-e-offers-reaproveitada|ADR: modo agendado de ofertas do dia]] — onde o bug de fuso horário apareceu pela primeira vez.
