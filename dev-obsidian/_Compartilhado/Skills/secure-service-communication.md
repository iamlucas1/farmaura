# Skill: secure-service-communication

**Arquivo fonte:** `dev-obsidian/_Compartilhado/Skills/secure-service-communication/SKILL.md`

## Propósito

Padrão para qualquer chamada de rede entre duas partes do repositório: `farmaura` (React) → `farmaura-api`, `lumosmed` (Laravel) → `lumos-api`, qualquer serviço → outro serviço, ou qualquer um deles através do `lumos-gateway`.

## Implementação de referência já existente no repositório

`lumosmed/app/Services/LumosApi/InternalRequestTokenFactory.php` (assina um JWT RS256 amarrado a método + path + hash de query + hash de body) verificado por `lumos-api/security/internal_requests.py` (checagem de issuer/audience/subject/exp/nbf, verificação de binding da requisição, proteção contra replay via Redis). **Reaproveitar este padrão** para qualquer nova chamada interna — não inventar um mais fraco. Documentado como ADR em `../../lumosmed/00_Decisoes/2026-03-27-autenticacao-interna-rs256-assinada.md`.

## Checklist para chamada nova ou alterada entre stacks

1. **Transporte**: HTTPS obrigatório fora de ambiente local; fallback inseguro só atrás de gate explícito de ambiente (ver `lumosmed/app/Services/LumosApi/LumosApiClient.php::resolveBaseUrlAndTls()`). Tratar hop interno como "rede confiável, não transporte confiável" — exigir token/assinatura mesmo em HTTP interno.
2. **Base URL**: nunca hardcodar host/porta/protocolo como fallback; se a config estiver faltando, falhar alto (raise/throw), nunca cair silenciosamente para uma origem HTTP adivinhada.
3. **Autenticação**: chamada usuário→API usa bearer JWT curto + refresh rotativo (ver skill `secure-auth-rbac-jwt`). Chamada serviço→serviço com privilégio elevado usa token interno assinado com TTL curto e proteção contra replay — nunca segredo estático ou API key de vida longa.
4. **Armazenamento de token no cliente**: preferir cookie `HttpOnly`+`Secure`+`SameSite` para refresh token; se usar Web Storage, compensar com CSP estrita e TTL curto de access token.
5. **CORS**: allowlist explícita de origem, nunca `*` com credenciais.
6. **Integridade de wiring do gateway**: confirmar que o serviço de destino realmente expõe o nome/porta/listener que o `lumos-gateway` espera; nunca publicar porta do backend direto no host além de entrar na rede do gateway sem razão documentada.

## Anti-padrões

Fallback `http://` hardcoded; cliente que funciona igual em HTTP e HTTPS sem guarda de ambiente; rota interna/privilegiada alcançável só com bearer genérico quando rotas irmãs exigem token assinado; container que publica porta no host **e** entra na rede do gateway; CSRF ausente com cookie em jogo (ou módulo de CSRF desnecessário num stack bearer-only); definição de upstream no gateway que referencia nome/porta que o serviço alvo não expõe de fato.

## Teste mínimo

Rejeição por assinatura/JWT ausente, expirado ou repetido (lado serviço-a-serviço); rejeição por `Origin` fora da allowlist; fallback inseguro permanece desligado fora de local/dev/test; smoke check de integração gateway/serviço sempre que a config de roteamento do gateway mudar.

## Atualizações
- 2026-07-20: definição operacional movida para o diretório da skill neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-18: nota criada.
