# lumos-api (integração interna Laravel → Python)

**Tipo:** Integração interna

## Propósito

Único ponto de acesso do BFF Laravel ao serviço Python `lumos-api`, que hospeda todo o domínio de negócio do LumosMed (agenda, pacientes, faturamento, WhatsApp, IA, configurações da clínica).

## Contrato

- Cliente centralizado: `lumosmed/app/Services/LumosApi/LumosApiClient.php` (Laravel `Http` facade) — um método por operação (login, signup, CRUD de agenda/pacientes/usuários, WhatsApp, configurações da clínica, IA, faturamento/checkout/pacotes de token).
- Configuração: `lumosmed/config/lumos_api.php` — `base_url` (pública, HTTPS) vs `internal_base_url` (endereço na rede Docker, ex: `http://lumos-api:8000`, só em local/dev). HTTPS obrigatório fora de local (`allow_insecure_internal_transport` precisa ser setado explicitamente para permitir HTTP).
- Autenticação end-user: bearer token guardado na sessão Laravel (`withToken()`).
- Autenticação interna privilegiada: JWT RS256 assinado por request — ver [[2026-03-27-autenticacao-interna-rs256-assinada]].
- `LumosApiClient::bodyPreview()` redige número de cartão/CVV antes de logar.

## Dependências

- Toda a superfície funcional do portal depende deste cliente estar disponível; não há fallback caso `lumos-api` fique indisponível.
- `resolveBaseUrlAndTls()` é o padrão de referência citado pela skill [[secure-service-communication]] para decidir HTTP vs HTTPS conforme o ambiente.

## Ver também

- [[2026-03-22-adotar-padrao-bff-laravel]] — decisão que originou este client centralizado.
- [[padrao-nova-pagina-portal-autenticado]] — toda página nova do portal passa por este client.

## Atualizações

- 2026-07-19: nota criada.
