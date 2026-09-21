---
cssclasses: ia-nota
---

# 2026-09-20 — Asaas pronto para sandbox: trava contra produção, `remoteIp`/`dueDate` e nota no formato real

## Contexto

Pedido do usuário: preparar o Asaas para o sandbox, para testar pagamento e geração de nota. A integração nunca tinha sido exercitada ponta a ponta ([[../06_Pendencias/asaas-desabilitado-localmente-bloqueia-teste-de-cobranca|pendência]]) e o `.env.example` não tinha nenhuma variável de Asaas. Ao conferir o código contra a documentação oficial (docs.asaas.com, 2026-09-20) apareceram defeitos que quebrariam o teste.

## O que a documentação exige e o código não fazia

- **Cartão**: `remoteIp` (IP do dispositivo do pagador) obrigatório na tokenização e na cobrança com token; `dueDate` obrigatório em `POST /v3/payments`. Não eram enviados.
- **Nota (`POST /v3/invoices`)**: `payment` é o **id da cobrança Asaas** (`pay_…`) — o código enviava o código do pedido; `customer` é um id (o código enviava um objeto); faltavam `municipalServiceName`, `deductions` e `taxes`. Falhas eram engolidas em silêncio.
- **Sandbox não tem API para confirmar pagamento**: Pix/boleto se confirmam pelo botão do painel; cartão aprovado confirma sozinho.

## Alternativas consideradas

- **Só documentar** o que faltava — descartada: o teste falharia no primeiro cartão.
- **Confiar em `X-Forwarded-For` para o `remoteIp`** — descartada aqui: exige política de proxies confiáveis (decisão de deploy). Usa-se o mesmo `request.client.host` do resto do app; fora de requisição o campo é **omitido**, nunca inventado.
- **Endpoint interno para "confirmar" pedidos em dev** — descartado: um botão que aprova pagamento é risco em qualquer ambiente. Ficou um script que só fala com `localhost`.

## Decisão

- **Trava**: `AsaasClient.assert_configured()` recusa `api.asaas.com` quando `APP_ENV != production` (código `asaas_production_blocked`). Staging com chave real cobraria cartão de verdade.
- `remoteIp` + `dueDate` nas cobranças/tokenização; payload da nota num único lugar (`build_invoice_payload`), ligado à cobrança; **falhas de nota agora vão para o log** (`asaas invoice skipped/failed …`), sem quebrar o pedido.
- `APP_FISCAL_ISSUANCE_DELAY_DAYS` (padrão 7 = janela do CDC) permite testar a nota sem esperar; **só sandbox/dev**.
- Scripts: `scripts/asaas_sandbox_check.py` (sandbox-only) e `scripts/asaas_simulate_webhook.py` (só localhost). Procedimento: [[../07_POPs_Processos/testar-asaas-sandbox|POP]].

## Consequências

- **Não executado de ponta a ponta**: faltam a chave do sandbox e o webhook alcançável; 24 testes cobrem os payloads, a trava e a autenticação do webhook, mas nenhuma chamada de cobrança real foi feita. Ver [[../06_Pendencias/asaas-sandbox-pendencias-apos-preparacao|pendências]].
- O Asaas emite **NFS-e (serviço)**; para mercadoria o correto é NFC-e/NF-e ([[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|módulo NFC-e]]). O teste valida o mecanismo, não a adequação fiscal.
