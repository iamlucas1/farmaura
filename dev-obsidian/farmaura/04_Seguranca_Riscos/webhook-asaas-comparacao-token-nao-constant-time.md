# Webhook Asaas: comparação do token de autenticação não é constant-time

**Tipo:** Vulnerabilidade (timing attack teórico)
**Status:** CONFIRMADO (achado de forma independente por dois agentes)
**Severidade:** MÉDIO (exploração prática remota é difícil — jitter de rede normalmente dificulta bastante — mas é um desvio claro de boa prática criptográfica)
**Sistema afetado:** `farmaura-api`
**Categoria:** Timing attack / uso incorreto de comparação de segredo
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

A validação do segredo compartilhado do webhook Asaas usa comparação de string padrão do Python, que não é constant-time:

```python
# app/services/payment_service.py:189
if received_token != expected_token:
```

O padrão correto (`hmac.compare_digest`/`secrets.compare_digest`) já é usado corretamente em outro ponto do mesmo sistema (`app/core/two_factor.py:75`), mostrando que o padrão certo é conhecido no codebase, só não foi aplicado aqui.

## Evidência

`app/services/payment_service.py:189` (`!=` ingênuo) vs `app/core/two_factor.py:75` (`hmac.compare_digest`, correto).

## Cenário de risco

Atacante com acesso de rede à rota pública do webhook (`/api/v1/payments/asaas/webhook`, exposta via `/api/v1/` no nginx, sem rate limit próprio na rota) tenta inferir `asaas_webhook_auth_token` caractere a caractere via análise estatística de tempo de resposta.

## Impacto

Na prática, jitter de rede/HTTP normalmente dificulta bastante a exploração remota real deste tipo de ataque — mas é um desvio claro de boa prática já documentada como padrão do ecossistema (comparação de segredo no servidor). Some a isso o fato de a rota não ter rate limit próprio, o que facilitaria repetição de tentativas se o ataque fosse viável.

## Pré-condições

Acesso de rede à rota pública do webhook + capacidade de fazer um número muito grande de requisições cronometradas com precisão (mitigado por jitter de rede real).

## Escopo afetado

`app/services/payment_service.py` (`_verify_webhook_auth` ou função equivalente que compara o token).

## Causa raiz

Comparação de string ingênua (`!=`) em vez de `secrets.compare_digest`/`hmac.compare_digest`, apesar do padrão correto já existir em outro módulo do mesmo sistema.

## Correção sugerida para análise futura

Trocar `received_token != expected_token` por `not secrets.compare_digest(received_token, expected_token)`.

## Dependências da correção

Nenhuma — mudança de uma linha, sem dependência nova (`secrets` é módulo padrão do Python).

## Riscos de regressão

Nenhum — comportamento funcional idêntico, só a forma de comparação muda.

## Como validar futuramente que a correção funcionou

Revisar o código após a mudança e confirmar que o webhook continua autenticando corretamente com o token real (teste funcional simples) — não há forma prática de "testar" resistência a timing attack em CI, a validação aqui é de revisão de código.

## Referências

- [[webhook-asaas-ip-allowlist-valida-ip-interno-errado]] — outro achado no mesmo endpoint.
- [[../../_Compartilhado/Padroes_Politicas/padrao-autenticacao-webhook-segredo-e-ip-allowlist|padrao-autenticacao-webhook-segredo-e-ip-allowlist]].
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.
