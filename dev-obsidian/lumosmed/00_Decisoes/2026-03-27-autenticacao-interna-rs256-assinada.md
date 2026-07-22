# 2026-03-27 — Autenticação interna Laravel↔lumos-api via JWT RS256 assinado por request

## Contexto

Chamadas privilegiadas do BFF Laravel para `lumos-api` (registro, Google register, forgot password, registro de novo lumosmed) precisavam de mais garantia do que "o Laravel está na rede interna" — a skill [[secure-service-communication]] (ver `_Compartilhado/Skills/`) exige request signing para esse tipo de chamada, não um segredo estático.

## Alternativas consideradas

- **Segredo compartilhado estático (API key fixa)** — descartado; vulnerável a replay e não amarra o token a uma requisição específica.
- **mTLS entre os serviços** — não há evidência de ter sido avaliado; a solução adotada resolve o problema no nível da aplicação, sem exigir gestão de certificado cliente-servidor.

## Decisão

Toda chamada interna privilegiada carrega um JWT RS256 de curta duração, assinado pelo Laravel (`app/Services/LumosApi/InternalRequestTokenFactory.php`, chave privada) e verificado pela API Python (`lumos-api/security/internal_requests.py`, chave pública). O token amarra `method` + `path` + hash da query + hash do body à requisição exata, exige `iss`/`aud`/`sub`/`iat`/`nbf`/`exp`/`jti`, e tem proteção contra replay via armazenamento de `jti` já usados (`MemoryReplayStore` ou `RedisReplayStore`). Enviado no header `X-Portal-Internal-Token`. Commits `9c0ba56` (lumosmed) / `fc22aae` (lumos-api), "Ajuste comunicação interna".

## Consequências

- Este é o padrão de referência do repositório para comunicação serviço-a-serviço — a skill [[secure-service-communication]] instrui explicitamente a reaproveitar este padrão em vez de inventar um mais fraco.
- Toda rota interna/privilegiada deve exigir essa checagem; uma rota que fique de fora (exceto o ponto de entrada público genuíno) é um desvio a ser documentado e justificado, não silenciado.
- Depende de um backend de replay (`memory`/`redis`/`auto`, configurável) — confirmar qual está ativo em cada ambiente antes de assumir proteção contra replay distribuída entre múltiplas instâncias.

## Ver também

- [[2026-03-22-adotar-padrao-bff-laravel]] — decisão anterior que centralizou as chamadas HTTP e possibilitou esta.
- [[Lumos_Api_Cliente_Interno]] — client Laravel que assina o token descrito aqui.
- [[Google_SignIn]] — uma das rotas privilegiadas que exige este token.
- [[chaves-privadas-tls-expostas-no-historico-git]] — verificar que a chave RSA usada aqui não é uma das chaves comprometidas.
- [[padrao-rls-multitenant-via-session-guc]] (`_Compartilhado/Padroes_Politicas/`) — outro padrão de segurança transversal do mesmo ecossistema.
