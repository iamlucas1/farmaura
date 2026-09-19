---
cssclasses: ia-nota
---

# Comparação não constant-time do hash de refresh token; entropia pequena no código de retirada de pedido

**Tipo:** Vulnerabilidade (timing attack teórico + entropia insuficiente)
**Status:** CONFIRMADO
**Severidade:** BAIXO
**Sistema afetado:** `farmaura-api`
**Categoria:** Criptografia / geração de token
**Data de identificação:** 2026-08-19 (varredura dedicada de criptografia, parte da auditoria completa de segurança)

Nota consolidada — dois achados pequenos de criptografia, complementares aos já documentados em [[webhook-asaas-comparacao-token-nao-constant-time]] e [[achados-baixos-diversos-auditoria-2026-08-17]] (item 4, código de retirada).

## 1. Comparação não constant-time do hash do refresh token

**Localização:** `app/services/auth_service.py:327` (refresh) e `:386` (logout).

```python
if refresh_record.token_hash != presented_hash:
```

**Descrição:** o fingerprint SHA-256 do refresh token (`hash_refresh_token`, em si corretamente implementado — hash determinístico é apropriado aqui porque o token já tem alta entropia própria, é um JWT assinado) é comparado com `!=` padrão, não constant-time. É um terceiro ponto desse anti-padrão no codebase, além dos dois já documentados (webhook Asaas, código de retirada) — o padrão correto (`hmac.compare_digest`) já existe em `core/two_factor.py:75`.
**Cenário de risco:** exploração prática é de viabilidade muito baixa — o registro é localizado primeiro por `jti` (que exige um JWT com assinatura válida do servidor, algo que um atacante não pode gerar sem a chave privada), então não há como "testar" hashes diferentes de forma barata.
**Correção sugerida:** trocar por `not hmac.compare_digest(refresh_record.token_hash, presented_hash)`.

## 2. Espaço de entropia pequeno no `pickup_code`

**Localização:** `app/services/order_service.py:1090` — `pickup_code='R-' + uuid4().hex[:4].upper()`.

**Descrição:** a fonte de aleatoriedade é `uuid4()` (CSPRNG, correta), mas a truncagem para 4 caracteres hex resulta em só 65.536 combinações possíveis (~16 bits de entropia). Combinado com o achado já conhecido de comparação não constant-time nesse mesmo código (`order_service.py:549`), um espaço de 65 mil valores é pequeno o suficiente para preocupar em teoria — mitigado na prática porque `confirm_internal_pickup` exige um `subject` interno autenticado e um `order_id` específico já conhecido, não é um endpoint público anônimo.
**Correção sugerida:** aumentar o código para 6-8 caracteres, mantendo `hmac.compare_digest` na verificação.

Observação: `prescription_code`/`thread_code` usam o mesmo padrão de truncagem, mas são só identificadores legíveis exibidos ao usuário — nenhum endpoint faz lookup público por eles como controle de acesso, então não constituem achado.

## Referências

- [[webhook-asaas-comparacao-token-nao-constant-time]], [[achados-baixos-diversos-auditoria-2026-08-17]] — outros dois pontos do mesmo anti-padrão.

## Atualizações

- 2026-08-19: nota criada.