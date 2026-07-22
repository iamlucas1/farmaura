# Google Sign-In

**Tipo:** API de terceiro

## Propósito

Login/cadastro via conta Google no portal do LumosMed, alternativa a login/senha tradicional.

## Contrato

- Lado Python: `lumos-api/domains/identity/services/google_identity.py`, config `GOOGLE_CLIENT_ID`.
- Lado Laravel: `Auth/PortalGoogleController.php` (rotas `redirect`/`callback`/`complete`).
- Rota de registro via Google está na lista de rotas internas privilegiadas (`INTERNAL_ONLY_V1_PATHS` em `lumos-api/main.py`), exigindo o token interno assinado — ver [[2026-03-27-autenticacao-interna-rs256-assinada]].

## Dependências

- Depende do `GOOGLE_CLIENT_ID`/segredo OAuth configurado (não documentar valor real aqui).

## Atualizações

- 2026-07-19: nota criada.
