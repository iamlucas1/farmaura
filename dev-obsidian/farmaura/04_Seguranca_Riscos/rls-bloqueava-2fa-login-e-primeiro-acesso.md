# RLS bloqueava login com 2FA e conclusão de primeiro acesso (contexto aplicado tarde demais)

**Tipo:** Risco identificado (correção de disponibilidade/autenticação)
**Severidade:** Alta
**Status:** Corrigido em ambiente local — **não implantado em produção ainda**
**Data de identificação:** 2026-09-13

## Descrição

`AuthService.verify_two_factor()` e `AuthService.complete_password_reset()` buscavam o usuário por id (`UserRepository.get_by_id`) **antes** de aplicar qualquer contexto de RLS (`apply_authenticated_context`). A política de RLS da tabela `users` não tem nenhuma via de acesso para "busca por id sem GUC nenhum setado" — só libera por e-mail de login/primeiro acesso, ou por `tenant_id` + `id` já combinados a um contexto já aplicado. Resultado: a consulta sempre devolvia zero linhas, mesmo com o usuário existindo e a senha/código corretos, e o código tratava isso como "Invalid credentials" — indistinguível de uma credencial realmente errada.

Confirmado diretamente no Postgres, conectando como o role de runtime (`farmaura_app`, sem `BYPASSRLS`) sem nenhum GUC setado: `SELECT id, email FROM users WHERE id = '<id existente>'` devolve 0 linhas.

## Impacto

- **Conclusão de primeiro acesso** (`POST /auth/complete-first-access`, usado pelo fluxo de senha temporária — ver [[../00_Decisoes/2026-09-12-cadastro-pdv-provisiona-acesso-marketplace|ADR de primeiro acesso via PDV]]) — sempre falhava com 401, para qualquer conta.
- **Login com segundo fator (2FA)** (`POST /auth/verify-2fa`) — `verify_two_factor` nunca chamava `apply_authenticated_context` em nenhum ponto do método, então tinha exatamente o mesmo problema. **Esse código já existia antes desta sessão** — não foi introduzido agora, só descoberto agora ao investigar o sintoma do primeiro acesso. Qualquer conta real em produção com `two_factor_enabled=true` provavelmente não consegue completar login desde que esse código foi escrito.

## Mitigação / Tratamento

Corrigido localmente em 2026-09-13: `apply_authenticated_context(session, tenant_id=..., user_id=...)` passou a ser chamado logo após decodificar o challenge token (usando os claims `tenant_id`/`sub` do próprio JWT, já verificado por assinatura nesse ponto), **antes** de `get_by_id`. Ver detalhe técnico e diff em [[../00_Decisoes/2026-09-13-rls-bloqueava-2fa-e-conclusao-do-primeiro-acesso|ADR]].

**Ainda não implantado em produção** — só corrigido no ambiente local, por política de não fazer deploy sem pedido explícito do usuário. Se alguma conta real em produção tem 2FA ativo, ela está impedida de logar até este fix subir.

## Referências

Skill [[../../_Compartilhado/Skills/secure-auth-rbac-jwt|secure-auth-rbac-jwt]] — controles de autenticação/RLS. `_Compartilhado/Padroes_Politicas/padrao-rls-multitenant-via-session-guc.md` — padrão de RLS via GUC que este bug violava na ordem de aplicação (contexto tem que ser aplicado *antes* da query que ele protege, não depois).

## Ver também

- [[../00_Decisoes/2026-09-13-rls-bloqueava-2fa-e-conclusao-do-primeiro-acesso|ADR da correção]]
- [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]]
- [[rls-pos-commit-quatro-servicos-nao-corrigidos]] — outro achado de timing de contexto RLS na mesma família de causa raiz (contexto de sessão que não acompanha o momento exato da query).

## Atualizações

- 2026-09-13: nota criada.
