# `PortalCheckoutRequest.php`: métodos de validação duplicados, e um deles morto

**Status:** Aberto
**Prioridade:** Alta (é um bug funcional, não só estilo)
**Registrado em:** 2026-07-19

## Descrição

O arquivo define métodos privados locais `isValidCpf`, `isValidCnpj`, `isValidCpfCnpj`, `passesLuhn`, `cardIsExpired` (linhas 333–444) que duplicam os helpers estáticos já importados de `App\Support\PortalIdentityInput` (usado no mesmo arquivo para `isValidEmail`, `isValidState`, `isValidPostalCode`).

- `passesLuhn` e `cardIsExpired` locais são **código morto** — as chamadas reais (linhas 576/580) usam `PortalIdentityInput::passesLuhn(...)`/`::cardIsExpired(...)`.
- `isValidCpfCnpj` local, porém, **é usado de fato** (linhas 516, 538) — ou seja, o arquivo usa a versão duplicada local para um caso e a versão compartilhada para outro, inconsistentemente.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19 (confirmado via grep dos call sites). Prioridade alta porque ter duas implementações de CPF/CNPJ ativas ao mesmo tempo no mesmo arquivo é risco real de divergência de comportamento (correção de bug numa não se propaga pra outra). Ação: remover os métodos locais mortos e migrar `isValidCpfCnpj` para usar `PortalIdentityInput` também, se essa função existir lá — senão promovê-la para `PortalIdentityInput`.

## Ver também

- [[padrao-bff-validacao-minima-laravel]] — padrão do qual `PortalCheckoutRequest.php` é a exceção documentada.
- [[duplicacao-helpers-validacao-patients-users-bug-mensagem]] — mesmo tipo de achado (duplicação com bug) no lado Python do domínio.
