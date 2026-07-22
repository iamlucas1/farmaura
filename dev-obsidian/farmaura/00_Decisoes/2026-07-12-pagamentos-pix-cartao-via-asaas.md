# 2026-07-12 — Processar pagamentos Pix e cartão de verdade via Asaas

## Contexto

Com o escopo de métodos definido (`ead6bb3`) e a tokenização real implementada (`edca24e`), faltava o processamento efetivo da cobrança — antes o checkout não movia dinheiro de verdade.

## Alternativas consideradas

- **Processador internacional (Stripe/Adyen)** — não há evidência de avaliação registrada; Asaas foi adotado provavelmente por já cobrir Pix nativamente e emissão fiscal brasileira (NFS-e) num único provedor — ver decisão de diferimento fiscal (`c146a0b`), que reaproveita o mesmo provedor.
- **Processar Pix e cartão com integrações separadas** — descartado; um único cliente (`AsaasClient`) cobre ambos os métodos, reduzindo integrações a manter.

## Decisão

`farmaura-api/app/services/payment_service.py` processa cobranças reais de Pix e cartão via `AsaasClient`, incluindo o recebimento de webhooks de confirmação de pagamento. Commit `45bb58f`.

## Consequências

- Webhook do Asaas é autenticado por segredo compartilhado + allowlist de IP (`asaas_webhook_auth_token`, `asaas_webhook_allowed_ips` em `app/core/config.py`) — mesmo padrão usado pelo `lumos-api` para seus próprios webhooks.
- O contexto de RLS `apply_webhook_context` (`app/core/tenant_context.py`) restringe um webhook autenticado a tocar exatamente o pedido referenciado (`current_webhook_payment_id`), não o tenant inteiro.
- Cria dependência de disponibilidade do Asaas para o checkout — não há fallback documentado se o provedor cair.
- Ver [[Asaas]] para o contrato completo do Asaas.

## Ver também

- [[2026-07-12-restringir-checkout-pix-cartao]] — decisão de escopo que precede esta.
- [[2026-07-12-tokenizacao-cartao-real-asaas]] — tokenização que esta decisão consome.
- [[2026-07-12-diferir-emissao-fiscal-7-dias]] — decisão seguinte, reaproveita o mesmo provedor.
- [[padrao-autenticacao-webhook-segredo-e-ip-allowlist]] — padrão do webhook de confirmação de pagamento.
- [[idempotencia-sem-persistencia]] — risco de duplicidade de cobrança relacionado a este fluxo.
