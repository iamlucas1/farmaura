---
cssclasses: ia-nota
---

# Testar pagamento e nota no Asaas SANDBOX

## Quando usar

Para exercitar de ponta a ponta o checkout online (Pix e cartão), a confirmação por webhook e a geração da nota, sem cobrar nada de verdade. Contexto: [[../05_Integracoes_Infra/Asaas|Asaas]], [[../00_Decisoes/2026-09-20-asaas-sandbox-guarda-remoteip-e-nota-no-formato-real|ADR]], pendência [[../06_Pendencias/asaas-desabilitado-localmente-bloqueia-teste-de-cobranca|Asaas desabilitado localmente]].

## Pré-requisitos (só você pode fazer)

1. Conta no **sandbox** do Asaas (`sandbox.asaas.com`) e a **chave de API do sandbox** (Integrações → Chave de API; começa com `$aact_hmlg_`). Nunca usar chave de produção: em qualquer `APP_ENV` diferente de `production` o cliente **recusa** `api.asaas.com`.
2. No sandbox, configurar as **informações fiscais** da conta (Notas fiscais → Configurações) se for testar a nota.
3. Um **segredo de webhook** de 32–255 caracteres: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## Passo a passo

1. No `farmaura-api/.env` (ignorado pelo git), preencher o bloco "Asaas" do `.env.example`: `APP_ASAAS_ENABLED=true`, `APP_ASAAS_BASE_URL=https://api-sandbox.asaas.com`, `APP_ASAAS_ACCESS_TOKEN`, `APP_ASAAS_WEBHOOK_AUTH_TOKEN`. Para a nota: `APP_ASAAS_INVOICE_ENABLED=true` + serviço municipal (passo 4). Para não esperar 7 dias: `APP_FISCAL_ISSUANCE_DELAY_DAYS=0` (**só sandbox/dev**). Reiniciar a API.
2. **Verificar**: `docker compose run --rm --no-deps --entrypoint uv farmaura-api run python scripts/asaas_sandbox_check.py` → confere config, chave e webhooks. Recusa qualquer coisa que não seja sandbox.
3. **Webhook** (o Asaas precisa alcançar uma URL **https pública**; `localhost` não serve):
   - *Staging*: `--register-webhook https://dev.drogariafarmaura.com.br/api/v1/payments/asaas/webhook` (o staging precisa ter as mesmas variáveis; o GeoIP/rate-limit do `lumos-gateway` não pode bloquear o Asaas), **ou**
   - *Túnel* (cloudflared/ngrok) apontando para `127.0.0.1:8080`, e usar a URL do túnel no mesmo comando, **ou**
   - *Sem URL pública*: pular o webhook e usar `scripts/asaas_simulate_webhook.py --payment-id pay_…` (só contra localhost).
4. **Nota**: `scripts/asaas_sandbox_check.py --services "texto"` lista os serviços municipais; copiar o `id` para `APP_ASAAS_INVOICE_MUNICIPAL_SERVICE_ID` e o nome para `..._SERVICE_NAME`; ajustar alíquotas.
5. **Cobranças de teste**: `--charge pix`, `--charge card`, `--charge card-decline` (cartão recusado documentado pelo Asaas). O script usa o código real do `PaymentService`.
6. **Confirmar o Pix**: no sandbox **não existe API** para isso. No painel sandbox → Cobranças → *Confirmar pagamento*. O webhook `PAYMENT_CONFIRMED` chega e o pedido vira `approved`. Cartão aprovado confirma sozinho.
7. **Fluxo pelo marketplace**: cadastrar um cliente com **CPF válido** (o Asaas valida os dígitos; os CPFs do seed são inválidos — [[../06_Pendencias/cpfs-do-seed-invalidos-impedem-salvar-perfil|pendência]]), CEP e telefone; salvar um cartão de teste; fazer o pedido.
8. **Nota**: com pagamento confirmado e `APP_FISCAL_ISSUANCE_DELAY_DAYS=0`, o agendador (a cada 15 min) ou `scripts/asaas_sandbox_check.py --run-fiscal-tick` cria o documento e agenda a nota no Asaas. Ou, direto numa cobrança paga: `--invoice pay_…`. Acompanhar `INVOICE_AUTHORIZED` (a emissão leva até ~15 min) e os logs `asaas invoice …`.

## Cartões de teste (docs.asaas.com, "Testando pagamento com cartão de crédito")

Qualquer número **fictício válido (Luhn)** é aprovado, validade futura, CVV qualquer de 3 dígitos. **Recusados**: Mastercard `5184019740373151` e Visa `4916561358240741`.

## O que esperar / problemas comuns

| Sintoma | Causa provável |
|---|---|
| 503 "Asaas de produção só pode ser usado com APP_ENV=production" | `APP_ASAAS_BASE_URL` aponta para `api.asaas.com` fora de produção |
| 400 `remoteIp` / `dueDate` | Corrigido neste ciclo; se voltar, ver o log da chamada |
| 400 CPF inválido | Cliente com CPF do seed |
| Pix não confirma | Webhook não alcança a API, token diferente, ou faltou clicar em Confirmar pagamento |
| 401 no webhook | `APP_ASAAS_WEBHOOK_AUTH_TOKEN` diferente do cadastrado no Asaas |
| Nota não aparece | Ver log `asaas invoice skipped/failed …` (agora visível): falta serviço municipal, conta sem configuração fiscal, ou pedido sem `gateway_payment_id` |

## Riscos se pulado

Cobrar cartão real por engano (agora bloqueado por código), e "validar" o checkout sem nunca ter exercitado o caminho de sucesso.

## Atualizações

- 2026-09-20: POP criado ao preparar o sandbox.
