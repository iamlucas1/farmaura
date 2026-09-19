---
cssclasses: ia-nota
---

# Asaas desabilitado localmente impede testar cobrança de verdade ponta a ponta

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-02

## Descrição

`asaas_enabled` (`app/core/config.py`) vem `False` por padrão e nenhum `.env` deste repositório —
nem o local, nem `.env.production` — liga a integração real (`.env.production` inclusive comenta
"Pagamento real (Asaas) desligado neste primeiro deploy"). Toda chamada real ao Asaas
(`AsaasClient.assert_configured()`, chamado por `tokenize_credit_card`, `create_payment`, etc.)
levanta `AsaasError("asaas_disabled", ...)` → HTTP 503 "A integração fiscal com o Asaas não está
habilitada." — em qualquer ambiente disponível hoje, local ou produção.

Na prática, isso significa que **nenhum fluxo que efetivamente cobra um cartão ou gera Pix** (checkout
online com `credit_card`/`debit_card`/`pix`, e agora também a cobrança automática na retirada de
receita física — ver [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR
(Oitava rodada)]]) pode ser testado de ponta a ponta gerando uma cobrança real hoje. Os cartões
salvos usados em teste (ex: o cartão Visa de `mariana.souza@cliente.farmaura.com.br`) vêm de dado
semeado (`provider_name = 'seed-gateway'`, token `tok_seed_mariana_visa`) — nunca passaram pela
tokenização real do Asaas, só simulam o formato de um cartão já tokenizado.

## Contexto

Encontrado ao verificar a cobrança automática na retirada (Oitava rodada do ADR acima): o pedido de
receita física avançou corretamente até `READY`, o farmacêutico confirmou a retirada com o código
certo, o código chamou `PaymentService.charge_card` no momento certo — e recebeu 503 por causa
disso, não por um bug na lógica nova. Confirmado que a transação inteira é descartada nesse caso
(nenhum `commit()` acontece antes da cobrança), então o pedido fica intacto em `READY`/
`pending_pickup`, pronto pra nova tentativa assim que o Asaas estiver disponível — mas isso também
significa que **o caminho de sucesso** (cobrança aprovada, `payment_status` virando `approved`,
`gateway_payment_id` gravado) nunca foi de fato exercitado, nem para este fluxo novo nem para o
fluxo de cartão/Pix online pré-existente.

Não corrigido nesta sessão: ligar o Asaas de verdade (mesmo em sandbox) exige credenciais reais e é
uma decisão de infraestrutura/negócio, fora do escopo de uma sessão de desenvolvimento de feature —
registrado aqui para quando o time decidir habilitar a integração (nesse momento, vale re-testar
ponta a ponta os três fluxos de cobrança citados acima, não só assumir que "já foi testado antes").