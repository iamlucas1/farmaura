# Padrão: autenticação de webhook externo via segredo compartilhado + allowlist de IP

**Tipo:** Padrão técnico genérico

## Aplica-se a

Qualquer integração que receba webhook de um provedor externo (pagamento, mensageria, etc.) neste ecossistema.

## Descrição

Farmaura e lumos-api implementam, cada um de forma independente, o mesmo padrão para autenticar webhooks do **Asaas**: segredo compartilhado enviado pelo provedor (comparado no servidor) **mais** allowlist de IP de origem — não HMAC de corpo da requisição.

- Farmaura: `asaas_webhook_auth_token` + `asaas_webhook_allowed_ips` (`app/core/config.py`), consumido por `payment_service.py`. O contexto de RLS do webhook (`apply_webhook_context`) restringe o acesso a exatamente o pedido referenciado (`current_webhook_payment_id`) depois da validação — ver [[../../farmaura/05_Integracoes_Infra/Asaas|Asaas]].
- lumos-api: mesmo padrão de segredo + IP para seus próprios webhooks (billing do LumosMed) — ver [[../../lumosmed/05_Integracoes_Infra/Asaas_LumosMed|Asaas_LumosMed]].

## Motivo

Simplicidade: não depende do provedor suportar assinatura HMAC de corpo. Suficiente quando combinado com **dois** fatores (segredo + IP), não um só — e, no lado da aplicação, com escopo de acesso restrito ao recurso exato referenciado no payload (nunca um "modo sistema" amplo liberado só pelo header do webhook).

## Exceções conhecidas

Se um provedor futuro (novo integrador de pagamento, WhatsApp, etc.) **suportar** assinatura HMAC de corpo, preferir HMAC a este padrão de segredo+IP — é mais forte porque amarra a autenticidade ao conteúdo exato da requisição, não só à origem. Documentar a escolha como ADR no projeto correspondente se decidir por HMAC ou por manter segredo+IP.

## Ver também

- [[../../farmaura/00_Decisoes/2026-07-12-pagamentos-pix-cartao-via-asaas|2026-07-12-pagamentos-pix-cartao-via-asaas]] — decisão que introduziu o webhook Farmaura.
- [[secure-service-communication]] — padrão irmão para chamadas internas serviço-a-serviço (assinatura de request, não webhook externo).

## Atualizações

- 2026-07-19: nota criada.
