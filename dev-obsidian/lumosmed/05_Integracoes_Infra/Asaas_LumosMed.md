# Asaas (faturamento/billing do LumosMed)

**Tipo:** API de terceiro

## Propósito

Provedor de pagamento/faturamento para planos, assinatura e pacotes de token do LumosMed — cobrança recorrente de clínica, não pagamento de paciente.

## Contrato

- Cliente: `lumos-api/domains/lumosmed/services/asaas_client.py` (30KB).
- `ASAAS_BASE_URL` padrão sandbox (`https://api-sandbox.asaas.com`).
- Config fiscal extensa (mesmo padrão do Farmaura, integração independente): CNAE, alíquotas ISS/PIS/COFINS/CSLL/INSS/IR, código de serviço municipal, série RPS, certificado.
- Lado Laravel: `Portal/PortalBillingApiController.php` (BFF) e `Portal/PortalBillingController.php` (páginas de plano/checkout/pacote de token — maior controller do repositório, ~30KB).
- Serviço Python correspondente é o maior arquivo do domínio lumosmed: `portal_billing.py` (~202KB).

## Dependências

- **Integração separada da usada pelo Farmaura** ([[Asaas]]) — mesma empresa provedora, credenciais e fluxo de negócio independentes, não compartilhar configuração entre os dois produtos.
- Idempotência de cobrança tratada em `billing_idempotency.py` e segurança específica em `billing_security.py` (lumos-api) — não confundir com [[idempotencia-sem-persistencia|a lacuna de idempotência identificada no Farmaura]].

## Ver também

- [[padrao-autenticacao-webhook-segredo-e-ip-allowlist]] (`_Compartilhado/Padroes_Politicas/`) — mesmo padrão de autenticação de webhook usado aqui.
- [[decompor-portal-billing]] — pendência sobre o maior arquivo de serviço desta integração (`portal_billing.py`).
- [[padrao-services-funcoes-planas-python]] — convenção seguida por `portal_billing.py`.

## Atualizações

- 2026-07-19: nota criada.
