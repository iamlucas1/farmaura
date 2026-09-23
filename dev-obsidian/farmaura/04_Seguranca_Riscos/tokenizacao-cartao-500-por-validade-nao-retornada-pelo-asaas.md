---
cssclasses: ia-nota
---

# Tokenização de cartão quebrava com 500 — validade nunca vem no retorno do Asaas

**Tipo:** Runbook de incidente
**Severidade:** Baixa
**Status:** Resolvido
**Data de identificação:** 2026-09-23

## Descrição

`POST /api/v1/customers/me/payment-methods/tokenize-card` respondia 500 genérico ("Ocorreu um
erro inesperado no servidor") em toda tentativa de salvar cartão no sandbox do Asaas em
`lumos-dev`. Causa: `CustomerService.tokenize_and_save_card`
(`app/services/customer_service.py`, então linhas 547-556) construía `expiration_month`/
`expiration_year` a partir do retorno de `POST /v3/creditCard/tokenizeCreditCard` do Asaas —
mas esse endpoint nunca devolve validade (só token, bandeira e final do cartão, conforme
[[../05_Integracoes_Infra/Asaas|Asaas]]/`docs/asaas/ASAAS.md`). `tokenized.get(...)` sempre
vinha `None` → caía no fallback `""` → `CustomerPaymentMethodCreateRequest` (que exige `MM`/
`AAAA` via regex) levantava `pydantic.ValidationError` não capturado (o `try/except` ali só
tratava `AsaasError`), subindo crua até o handler genérico de exceção
(`handle_unexpected_error`, `app/core/exceptions.py`).

Descoberto lendo `docker logs farmaura_api` em `lumos-dev` (evento `unhandled_exception`, 3
ocorrências no mesmo teste manual do usuário).

## Impacto

Nenhum cliente conseguia salvar cartão via sandbox Asaas em nenhum ambiente onde a
tokenização real chegasse a ser chamada — bloqueava por completo o teste ponta a ponta descrito
em [[../06_Pendencias/asaas-desabilitado-localmente-bloqueia-teste-de-cobranca|pendência
relacionada]]. Mensagem genérica ao cliente não expôs detalhe sensível (comportamento correto
do handler), mas também não indicava a causa real.

## Mitigação / Tratamento

Corrigido usando os valores já validados do `payload` da própria requisição (`holder_name`,
`expiration_month`, `expiration_year`) em vez de tentar extraí-los do retorno do Asaas — esses
três campos já chegam validados pelo schema de request (`CustomerPaymentMethodCreateRequest`
correspondente em `app/schemas/customers.py`, mesmo padrão `MM`/`AAAA`), então são a fonte
correta; `brand_name`/`last_four_digits` continuam vindo do Asaas, que é quem de fato valida o
PAN. Nenhuma migration nem mudança de schema — só a origem do dado dentro do service.

## Referências

Pendência relacionada:
[[../06_Pendencias/asaas-desabilitado-localmente-bloqueia-teste-de-cobranca|asaas-desabilitado-localmente-bloqueia-teste-de-cobranca]].
Integração: [[../05_Integracoes_Infra/Asaas|Asaas]].

## Atualizações

- 2026-09-23: nota criada, incidente já corrigido no mesmo commit.
