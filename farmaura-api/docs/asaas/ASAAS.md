# Asaas — pagamentos e nota de serviço (Farmaura)

Integração com o Asaas para **cobrar** (Pix e cartão) e para **agendar nota de serviço (NFS-e)** dos pedidos do
marketplace. **Estado atual: preparada para o sandbox; nenhuma cobrança real foi criada** — faltam a chave do
sandbox e um webhook alcançável (ver §7). Para a nota fiscal do **balcão** (NFC-e, SEFAZ) veja
[`docs/fiscal/NFCE.md`](../fiscal/NFCE.md): são mecanismos diferentes (§8).

## 1. O que o Asaas faz aqui

| Uso | Onde | Como |
|---|---|---|
| Cobrança Pix do checkout | `PaymentService.charge_pix` | `POST /v3/payments` (PIX) + `GET /pixQrCode` |
| Cobrança cartão (salvo) do checkout e do PDV `marketplace_card` | `PaymentService.charge_card` | `POST /v3/payments` com `creditCardToken` |
| Tokenizar cartão | `CustomerService` (salvar cartão) | `POST /v3/creditCard/tokenizeCreditCard` |
| Assinatura recorrente | `PaymentService.charge_recurring_subscription` | `POST /v3/subscriptions` (o Asaas cobra todo mês) |
| Confirmação de pagamento | `POST /api/v1/payments/asaas/webhook` | webhook autenticado por token |
| Nota de serviço (NFS-e) | `FiscalService._schedule_asaas_invoice` | `POST /v3/invoices` ligada à cobrança |

Cliente HTTP: `app/services/asaas_client.py` (`urllib`, timeout 20 s). Cartão (PAN/CVV) só existe em memória durante
a chamada; o Farmaura guarda apenas token, bandeira e final.

## 2. Variáveis (todas em `.env.example`, sem valores)

| Variável | Função |
|---|---|
| `APP_ASAAS_ENABLED` | Liga a integração. `false` = qualquer chamada devolve 503 "não habilitada". |
| `APP_ASAAS_BASE_URL` | `https://api-sandbox.asaas.com` (padrão) ou `https://api.asaas.com` (só produção). |
| `APP_ASAAS_ACCESS_TOKEN` | Chave de API. Sandbox começa com `$aact_hmlg_`. **Nunca versionar.** |
| `APP_ASAAS_WEBHOOK_AUTH_TOKEN` | Segredo do webhook, 32–255 caracteres. É o `authToken` cadastrado no Asaas. |
| `APP_ASAAS_WEBHOOK_ALLOWED_IPS` | Opcional: IPs/CIDRs de origem (vazio = só o token). Ver §9. |
| `APP_ASAAS_INVOICE_ENABLED` | Liga o agendamento da nota de serviço. |
| `APP_ASAAS_INVOICE_MUNICIPAL_SERVICE_ID` / `_CODE` / `_NAME` | Serviço municipal: **ID ou código**, e o nome (sempre). |
| `APP_ASAAS_INVOICE_ISS/PIS/COFINS/CSLL/INSS/IR`, `_RETAIN_ISS`, `_OBSERVATIONS` | Alíquotas e observações da nota. |
| `APP_FISCAL_ISSUANCE_DELAY_DAYS` | Dias entre pagamento confirmado e emissão da nota do pedido online (padrão **7**, janela do CDC). `0` só em sandbox/dev. |

### Trava sandbox × produção
`AsaasClient.assert_configured()` recusa `api.asaas.com` quando `APP_ENV` não é `production` (erro
`asaas_production_blocked`, HTTP 503). Em dev, docker e staging **só o sandbox** funciona: uma chave real nesses
ambientes cobraria cartão de verdade.

## 3. Fluxos

### Checkout online (marketplace)
1. Pedido criado; se o cashback cobre tudo → `approved` sem chamar o Asaas.
2. **Pix**: `charge_pix` cria a cobrança e devolve QR Code + copia-e-cola. O pedido fica `pending`; o webhook
   `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` o torna `approved` e grava `payment_confirmed_at`.
3. **Cartão salvo**: `charge_card` captura na hora (`dueDate` não agenda a captura). Status `CONFIRMED` → `approved`.
4. **Receita física** (`pickup_cash`): nada é cobrado agora; o cartão salvo é cobrado quando o farmacêutico confirma a retirada.
5. `gateway_payment_id` (`pay_…`) fica no pedido: é a ligação com webhook e com a nota.

Campos que a API do Asaas **exige** (verificado em docs.asaas.com, 2026-09-20): `dueDate` em toda cobrança;
`remoteIp` (IP do pagador) na tokenização e na cobrança com token. O app envia `dueDate` sempre e `remoteIp` quando
há requisição; fora dela o campo é omitido, nunca inventado.

### Webhook
Cabeçalho `asaas-access-token` = `APP_ASAAS_WEBHOOK_AUTH_TOKEN` (senão 401; segredo não configurado → 503,
nunca aberto). Idempotente por `(evento, id da cobrança)`. Eventos tratados: `PAYMENT_CONFIRMED/RECEIVED/RECEIVED_IN_CASH`
(aprova), `PAYMENT_OVERDUE`, `PAYMENT_DELETED/REFUNDED` (estorna). Eventos `INVOICE_*` chegam e são ignorados sem erro.

### Nota de serviço (marketplace)
`fiscal_scheduler` (a cada 15 min) pega pedidos `approved` com `payment_confirmed_at` mais antigo que
`APP_FISCAL_ISSUANCE_DELAY_DAYS`, cria o documento e agenda a nota:
```json
POST /v3/invoices
{ "payment": "pay_…", "serviceDescription": "…", "observations": "…", "value": 50.0, "deductions": 0,
  "effectiveDate": "AAAA-MM-DD", "municipalServiceId": "…", "municipalServiceName": "…",
  "taxes": { "retainIss": false, "iss": 0, "cofins": 0, "csll": 0, "inss": 0, "ir": 0, "pis": 0 } }
```
O cliente sai da cobrança (`payment`), não do corpo. Sem `municipalServiceId` usa `municipalServiceCode`. Se faltar
configuração, o pedido **não falha**: o motivo vai para o log (`asaas invoice skipped/failed …`).

## 4. Testar no sandbox

Roteiro completo no cofre (POP "testar-asaas-sandbox"). Resumo:

```bash
docker compose run --rm --no-deps --entrypoint uv farmaura-api run python scripts/asaas_sandbox_check.py
... asaas_sandbox_check.py --services "texto"                                   # id do serviço municipal
... asaas_sandbox_check.py --register-webhook https://<url-publica>/api/v1/payments/asaas/webhook
... asaas_sandbox_check.py --charge pix | card | card-decline
... asaas_sandbox_check.py --invoice pay_XXXX                                    # nota numa cobrança paga
... asaas_sandbox_check.py --run-fiscal-tick                                     # com DELAY_DAYS=0
... asaas_simulate_webhook.py --payment-id pay_XXXX                              # só contra localhost
```
- **Pix**: no sandbox **não há API** para confirmar; clique em *Confirmar pagamento* no painel. Cartão aprovado confirma sozinho.
- **Cartões**: qualquer número fictício válido (Luhn) aprova; **recusados**: `5184019740373151` (Mastercard) e `4916561358240741` (Visa).
- O webhook exige **URL https pública** (staging ou túnel); `localhost` não é alcançável pelo Asaas.
- Cliente de teste precisa de **CPF válido**: o Asaas valida os dígitos (os CPFs do seed são inválidos).

## 5. Erros comuns

| Sintoma | Causa provável |
|---|---|
| 503 "Asaas de produção só pode ser usado com APP_ENV=production" | `APP_ASAAS_BASE_URL` = `api.asaas.com` fora de produção |
| 503 "integração … não está habilitada" | `APP_ASAAS_ENABLED=false` |
| 401 do Asaas "chave de API inválida" | Chave errada ou de outro ambiente |
| 400 CPF/CNPJ inválido | Cliente do seed |
| 401 no webhook | Segredo diferente do cadastrado no Asaas |
| Pix não confirma | Webhook não alcança a API ou faltou *Confirmar pagamento* |
| Nota não é criada | Ver log `asaas invoice …`: serviço municipal ausente, conta sem configuração fiscal, ou pedido sem `gateway_payment_id` |

## 6. Segurança

- Chave e segredo só no `.env` (ignorado pelo git). Nenhum aparece em log, resposta ou o próprio script.
- Webhook fail-closed; PAN/CVV nunca persistidos nem logados.
- O simulador de webhook recusa qualquer host que não seja loopback (forjar confirmação de pagamento é o risco).

## 7. Ainda não feito / a decidir

Ver a pendência "Asaas sandbox: o que ainda depende de credenciais, decisão fiscal e deploy" no cofre:
teste real (chave + webhook público), `remoteIp` atrás do gateway (é o IP do gateway), e-mail da nota sem acesso do
cliente, valor da nota × cashback, e a allowlist do webhook.

## 8. Asaas (NFS-e) × NFC-e — qual nota é qual

| | Nota de serviço (Asaas) | NFC-e (SEFAZ) |
|---|---|---|
| Documento | NFS-e (ISS, município) | NFC-e modelo 65 (ICMS, SEFAZ-DF/SVRS) |
| Vendas | Pedido online (diferido) | Balcão / PDV (na hora) |
| Quem emite | Asaas, a partir da cobrança `pay_…` | Farmaura, direto na SEFAZ (certificado A1) |
| Estado | Preparado p/ sandbox, não testado | Testado offline; homologação pendente |
| Adequação | **Nota de serviço não é o documento de uma venda de mercadoria** — validar com o contador | Documento correto para varejo de mercadoria |

Hoje o pedido online também cria um documento fiscal **simulado** (`LEGACY_SIMULATED`); decisão pendente no cofre
("marketplace ainda gera documento fiscal simulado").
