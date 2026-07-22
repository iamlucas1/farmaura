# 2026-07-12 — Diferir emissão de nota fiscal em 7 dias após o pagamento

## Contexto

Emitir a nota fiscal imediatamente após o pagamento entra em conflito com a janela legal de arrependimento do CDC (Código de Defesa do Consumidor) para compras não presenciais — emitir cedo demais complica estorno/cancelamento dentro do prazo.

## Alternativas consideradas

- **Emitir a nota fiscal no momento do pagamento** — descartado por risco de conflito com o direito de arrependimento do CDC.
- **Job externo (cron do SO / Celery) para o diferimento** — descartado; optou-se por uma tarefa `asyncio` em processo, iniciada no `lifespan()` da própria aplicação (`fiscal_scheduler.py`), evitando infraestrutura de fila adicional nesta fase.

## Decisão

Emissão fiscal via Asaas passa a ser agendada para **7 dias após o pagamento confirmado**, executada por `farmaura-api/app/services/fiscal_scheduler.py`. Commit `c146a0b`.

## Consequências

- O scheduler roda com contexto de sistema (`apply_system_job_context` / `is_system_job()` em `row_level_security.py`), uma das poucas exceções documentadas que atravessam múltiplos tenants — deve ser tratado como código confiável de servidor, nunca acionável por input de cliente.
- **Resiliente a restart por design, não por acaso**: cada tick (a cada 15 min, `TICK_INTERVAL_SECONDS`) roda uma varredura sem estado — busca no banco todo pedido com `payment_confirmed_at <= cutoff` que ainda não tem `FiscalDocument`. Não existe agenda em memória para perder; se o processo cair e voltar, o tick seguinte simplesmente emite tudo que ficou elegível nesse meio-tempo. Confirmado em `farmaura-api/app/services/fiscal_scheduler.py` e no registro da tarefa em `app/main.py` (`asyncio.create_task(run_fiscal_scheduler_forever())` no `lifespan()`) — verificado em 2026-07-18.
- Reaproveita o mesmo provedor (Asaas) já usado para pagamento, evitando um segundo integrador fiscal.

## Ver também

- [[regra-negocio-janela-cdc-nota-fiscal]] — regra de negócio formalizada a partir desta decisão.
- [[excecao-fiscal-scheduler-sessao-propria]] — exceção arquitetural do serviço que executa este agendamento.
- [[2026-07-12-pagamentos-pix-cartao-via-asaas]] — decisão que reaproveita o mesmo provedor Asaas.
- [[Asaas]] — contrato completo da integração.
