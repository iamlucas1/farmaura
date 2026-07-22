# `portal_billing.py` (202KB / 4425 linhas) precisa ser decomposto

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-07-19

## Descrição

Maior arquivo do domínio LumosMed, sem nenhum divisor de seção (`grep -c "^# "` = 0). Contém funções individuais muito grandes: `start_checkout` (linhas 707–1374, **667 linhas**, faz tracing + log + validação + resolução de plano + lock de clínica + idempotência + payload Asaas + tokenização de cartão tudo inline), `_validate_credit_card_holder_payload` (141 linhas), `_load_billing_state` (132 linhas). O processamento de webhook (`process_asaas_webhook` + 6 helpers `_sync_*`/`_resolve_*`, ~500 linhas no final do arquivo) já é logicamente separável.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19 (amostragem — `start_checkout` lido por completo nas primeiras ~120 linhas, resto indexado por assinatura de função, não lido linha a linha). Não há evidência de que seja um gargalo de performance medido — é um risco de manutenibilidade: função de 667 linhas é difícil de testar isoladamente e de raciocinar sobre onde exatamente o idempotency-replay interrompe o fluxo em relação à tokenização de cartão. Divisão sugerida: `checkout_asaas.py`, `checkout_validation.py`, `checkout_webhook.py`.

## Ver também

- [[padrao-services-funcoes-planas-python]] — convenção da qual este arquivo é uma exceção de tamanho, não de estilo.
- [[Asaas_LumosMed]] — integração implementada por este arquivo.
