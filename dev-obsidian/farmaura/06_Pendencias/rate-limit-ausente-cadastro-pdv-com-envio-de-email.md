---
cssclasses: ia-nota
---

# Rate limit ausente em `POST /crm/customers`, agora que o cadastro dispara e-mail real

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-12

## Descrição

`POST /crm/customers` (cadastro de cliente pelo PDV, farmacêutico ou caixa) não tem nenhuma
dependency de `rate_limit(...)`, diferente das rotas de auth/reset de senha/públicas já cobertas
em [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]]. Isso já era
assim antes, mas até agora só criava um registro de CRM — sem consequência de abuso muito séria.

Desde [[../00_Decisoes/2026-09-12-cadastro-pdv-provisiona-acesso-marketplace|esta decisão]], todo
cadastro (inclusive re-cadastro de um CPF/e-mail já existente) passa por
`provision_first_access`, que **pode disparar um e-mail real** (limitado pelo próprio
`must_change_password`, mas não por taxa de requisição).

## Contexto

Rota autenticada — só farmacêutico/caixa (papel interno) conseguem chamá-la, não é pública. O
risco não é um atacante anônimo, é: uma sessão de staff comprometida, ou um bug de retry no
frontend, gerando chamadas repetidas que resultam em e-mails repetidos para o mesmo cliente (spam
incômodo, não um vazamento de dado). Prioridade média por isso — não é um risco crítico, mas é uma
lacuna real que faz sentido fechar com o mesmo padrão já usado em `/auth/*` e
`/portal/marketplace/first-access` (que already tem `PASSWORD_RESET_RATE_LIMIT`).

## Como resolver

Aplicar `Depends(rate_limit(<política>))` na rota `POST /crm/customers`
(`app/api/v1/crm.py`), escolhendo uma janela adequada para um fluxo de balcão (mais permissiva que
`AUTH_RATE_LIMIT`, já que um farmacêutico legitimamente cadastra vários clientes por turno — não é
o mesmo perfil de uso de login).

## Ver também

- [[../00_Decisoes/2026-09-12-cadastro-pdv-provisiona-acesso-marketplace|ADR que introduziu o envio de e-mail neste endpoint]]
- [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]]