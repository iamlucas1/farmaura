# Padrão: como adicionar uma nova página/rota autenticada do portal

**Tipo:** Padrão técnico

## Descrição

Toda rota autenticada do portal LumosMed (páginas de shell SPA em `routes/web.php` e endpoints `/app/*` BFF) segue o mesmo empilhamento de middleware:

1. `EnsurePortalSessionIsAuthenticated` — exige sessão Laravel válida; redireciona HTML (302 para login) ou retorna 401 JSON para chamadas `/app/*`.
2. `portal.page:{view}` (`EnsurePortalPageAccess`) — autorização por página específica, além de estar autenticado.
3. `PreventSensitiveResponseCache` — headers no-store em toda rota sensível.
4. Em rotas de escrita: `throttle:portal-write` (ou `throttle:portal-billing-write` para faturamento) + `duplicate.request:N` (`PreventConcurrentRequestReplay`, anti-duplo-submit).

Se a página envolve dado do domínio LumosMed (não só a casca da SPA), o controller correspondente deve chamar `lumos-api` através do `LumosApiClient` ([[Lumos_Api_Cliente_Interno]]), nunca acessar dado de domínio diretamente do banco do Laravel.

## Motivo

Padroniza a autorização por página e evita que uma nova rota fique acidentalmente sem o gate de sessão, sem proteção contra replay em escrita, ou com resposta sensível cacheável.

## Exceções conhecidas

Rotas públicas (site institucional, blog, autenticação em si) não usam este empilhamento — usam apenas `PreventSensitiveResponseCache` + `throttle:*` conforme o caso.

## Ver também

- [[2026-03-22-adotar-padrao-bff-laravel]] — decisão que estabelece o BFF do qual este empilhamento de middleware é consequência direta.
- [[prontuario-sem-criptografia-em-nivel-de-campo]] — cita este padrão como parte do controle de acesso à página "prontuário".

## Atualizações

- 2026-07-19: nota criada.
