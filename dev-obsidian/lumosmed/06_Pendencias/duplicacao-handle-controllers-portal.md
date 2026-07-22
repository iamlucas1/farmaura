# Método `handle()` idêntico copiado em 6 controllers do portal

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-07-19

## Descrição

`PortalPatientApiController`, `PortalAgendaApiController`, `PortalAiApiController`, `PortalClinicSettingsApiController`, `PortalUserApiController` e `PortalBillingApiController` definem cada um um método privado `handle(Request $request, callable $callback): JsonResponse` **com corpo md5-idêntico** (mesmo mapeamento de `PortalSessionExpiredException`/`LumosApiUnavailableException`/`LumosApiException` para 401/503/erro).

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19 (confirmado via hash do corpo do método em cada arquivo). Candidato claro para uma trait compartilhada ou um `PortalApiController` base — `Controller.php` já existe como pai comum e não é usado para isso.

## Ver também

- [[Lumos_Api_Cliente_Interno]] — exceções (`PortalSessionExpiredException`/`LumosApiUnavailableException`/`LumosApiException`) mapeadas de forma idêntica em cada `handle()`.
- [[duplicacao-helpers-validacao-patients-users-bug-mensagem]] — mesmo padrão de duplicação, do lado Python do domínio.
