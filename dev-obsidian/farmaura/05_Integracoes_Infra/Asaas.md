# Asaas (pagamentos + emissão fiscal)

**Tipo:** API de terceiro

## Propósito

Provedor único para dois usos distintos: (1) processamento de pagamentos do checkout (Pix, cartão de crédito, cartão de débito) e (2) emissão de nota fiscal de serviço (NFS-e) para os pedidos do marketplace, diferida em 7 dias após o pagamento — ver [[2026-07-12-diferir-emissao-fiscal-7-dias]].

## Contrato

- Cliente próprio: `farmaura-api/app/services/asaas_client.py` — `AsaasClient`, síncrono via `urllib` (não `httpx`).
- Base URL: `asaas_base_url` em `app/core/config.py`, padrão sandbox (`https://api-sandbox.asaas.com`).
- Cobre: tokenização de cartão (`tokenize_credit_card` — PAN/CVV só em memória, nunca persistidos/logados), clientes, cobranças (Pix e cartão), QR code Pix, emissão de invoice/NFS-e.
- Configuração fiscal extensa em `config.py`: código de serviço municipal, CNAE, NBS, alíquotas ISS/PIS/COFINS/CSLL/INSS/IR, certificado (arquivo + senha), série/número RPS.
- Webhook de confirmação de pagamento: autenticado por segredo compartilhado (`asaas_webhook_auth_token`) + allowlist de IP (`asaas_webhook_allowed_ips`) — mesmo padrão adotado pelo `lumos-api` para seus próprios webhooks (não HMAC).
- Consumido por `app/services/payment_service.py` (pagamento) e `app/services/fiscal_service.py` + `fiscal_scheduler.py` (fiscal).

## Dependências

- Depende de disponibilidade do Asaas para todo o checkout — sem fallback de provedor documentado.
- O `lumos-api` (produto irmão) também integra Asaas de forma independente para o domínio LumosMed — são integrações separadas, não compartilhadas entre os dois produtos. Ver [[Asaas_LumosMed]].

## Ver também

- [[2026-07-12-restringir-checkout-pix-cartao]], [[2026-07-12-tokenizacao-cartao-real-asaas]] e [[2026-07-12-pagamentos-pix-cartao-via-asaas]] — cadeia de decisões que levou a esta integração.
- [[padrao-autenticacao-webhook-segredo-e-ip-allowlist]] — padrão do webhook de confirmação de pagamento.
- [[idempotencia-sem-persistencia]] — risco de duplo processamento de cobrança/webhook.

## Atualizações

- 2026-07-19: nota criada.
