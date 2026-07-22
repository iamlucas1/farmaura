# 2026-07-12 — Tokenização real de cartão via Asaas

## Contexto

O checkout usava um token de cartão gerado no próprio cliente (fake), o que não protege PAN/CVV nem é aceito por um processador de pagamento real.

## Alternativas consideradas

- **Continuar com token client-side** — descartado; não oferece nenhuma garantia de segurança real e bloqueia o processamento real de pagamentos.
- **Implementar tokenização própria (PCI in-house)** — descartado implicitamente; delegar a tokenização ao Asaas evita que o backend precise lidar com escopo PCI-DSS de dados de cartão.

## Decisão

Tokenização de cartão passa a ser feita via `AsaasClient.tokenize_credit_card` (`farmaura-api/app/services/asaas_client.py`). Commit `edca24e`.

## Consequências

- PAN/CVV ficam em memória apenas durante a chamada ao Asaas e nunca são persistidos ou logados (documentado explicitamente no cliente).
- Reduz a responsabilidade de conformidade PCI do backend Farmaura, transferindo-a ao provedor.
- Base necessária para o processamento real de pagamento (`45bb58f`), que depende de um token válido do Asaas.
- Ver [[secure-auth-rbac-jwt]] e [[secure-service-communication]] (`_Compartilhado/Skills/`) para os padrões de segurança aplicáveis a dados sensíveis nesse tipo de fluxo.

## Ver também

- [[2026-07-12-restringir-checkout-pix-cartao]] — decisão de escopo que precede esta.
- [[2026-07-12-pagamentos-pix-cartao-via-asaas]] — decisão seguinte, depende do token gerado aqui.
- [[Asaas]] — contrato completo da integração.
