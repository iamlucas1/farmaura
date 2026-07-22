# Padrão: ataques comuns a defender, controles defensivos obrigatórios e limites seguros de teste

**Tipo:** Padrão técnico genérico (política de segurança)

## Aplica-se a

Qualquer stack deste ecossistema que aceite input externo ou exponha rota pública/autenticada.

## Descrição

Consolida em um só lugar (1) contra que ataques defender, (2) que controle defensivo é obrigatório para cada um, e (3) os limites para **testar** isso sem causar dano real — algo que não existia em nenhum lugar do cofre ou do `claude.md`/`agent.md` antes de 2026-07-20. Não duplica regra estática já escrita: cada item linka para onde a regra já vive (seção do `claude.md`/`agent.md`, skill, ADR) ou, se for lacuna real, diz isso explicitamente.

### Ataques a defender

| Ataque | Defesa exigida | Onde já está aplicado / referência |
|---|---|---|
| SQL injection | ORM parametrizado (SQLAlchemy), nunca SQL string concatenada com input do usuário | `claude.md` "Injection and Output Safety" |
| XSS | Output escapado por padrão (JSX/Blade), CSP via gateway, nunca `dangerouslySetInnerHTML`/`{!! !!}` com input não sanitizado | `claude.md` "Browser and HTTP Security" (CSP), `secure-service-communication` |
| CSRF | Token CSRF em rota que muda estado, cookie `SameSite`, validação de `Origin`/`Referer` | `claude.md` "Authentication, Session, and JWT Rules"; skill [[../Skills/secure-auth-rbac-jwt|secure-auth-rbac-jwt]] |
| DDoS / spam de requisição | Rate limit por rota, timeout, limite de body, `lumos-gateway` como única borda pública | `claude.md` "Availability and Abuse Controls"; infra real sobre Valkey (`core/rate_limit.py`) — ver [[../../farmaura/05_Integracoes_Infra/Valkey|Valkey]] |
| Brute force (login) | Bloqueio exponencial por conta + rate limit por IP | ADR [[../../farmaura/00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|2026-07-20-rate-limit-e-bloqueio-exponencial]] |
| Race condition | Idempotency key, constraint única, lock transacional em fluxo sensível (pagamento, estoque, pedido) | `claude.md` "Concurrency and Idempotency" — **lacuna real aberta**: [[../../farmaura/04_Seguranca_Riscos/idempotencia-sem-persistencia|idempotencia-sem-persistencia]] valida só formato da chave, sem proteção real contra replay |
| Supply chain | Versão travada, lockfile commitado, sem `latest`, revisão antes de adotar dependência | `claude.md` "Supply Chain Requirements"; Composer e demais stacks: [[padrao-supply-chain-multi-stack]] |

### Controles defensivos obrigatórios

- **CSRF token** — já exigido em rota com cookie/sessão, ver tabela acima.
- **CAPTCHA** — obrigatório em formulário público de alto risco (cadastro, reset de senha, checkout anônimo) após tentativas suspeitas repetidas — regra nova em `claude.md`/`agent.md` "Availability and Abuse Controls"/"Abuse Resistance and Availability" (2026-07-20), ainda **não implementada no código**.
- **MFA** — obrigatório para papel staff/admin e operação de privilégio elevado; infraestrutura de token de desafio MFA já existe (`core/jwt.py`), a regra que a torna obrigatória (não só disponível) é nova em `claude.md`/`agent.md` (2026-07-20).
- **Senha forte** — já é política aplicada, ver ADR [[../../farmaura/00_Decisoes/2026-07-20-politica-de-senha-forte|2026-07-20-politica-de-senha-forte]].
- **Mensagem de erro genérica** — já existia para negação de acesso ao portal interno; regra nova em `claude.md`/`agent.md` (2026-07-20) estende o mesmo princípio a login, pedido de reset de senha e qualquer fluxo de lookup de usuário, para nunca revelar se um identificador existe.
- **Aviso anti-phishing ao usuário** — regra nova em `claude.md`/`agent.md` (2026-07-20): notificação de segurança de conta (alerta de tentativa de login, e-mail de reset, aviso de bloqueio) deve incluir aviso padrão de que a empresa nunca liga/manda mensagem pedindo senha, OTP ou dado de cartão completo.
- **HTTPS obrigatório** — já estrutural: `lumos-gateway` faz terminação TLS e redirect HTTP→HTTPS (`claude.md` "Existing Gateway Constraint"); nível de aplicação usa cookie `Secure`/`HttpOnly`/`SameSite` (já coberto em "Authentication, Session, and JWT Rules").

### Limites seguros de teste

Esta parte não existia em lugar nenhum antes desta nota — vale tanto para teste manual quanto para as skills [[../Skills/security-vulnerability-testing|security-vulnerability-testing]] e [[../Skills/qa-functional-review|qa-functional-review]]:

- **Nunca testar contra domínio público ou produção real** — só contra container local do próprio `docker-compose` do projeto (ver [[../Skills/project-test-orientation|project-test-orientation]] para porta/container de cada stack).
- **Nunca imprimir, logar ou commitar segredo real durante teste** — usar valor de `.env.example`/placeholder; se um teste exigir simular um segredo real (chave de webhook, token), gerar um valor de teste, nunca reusar o de produção.
- **Nunca varrer porta fora da rede Docker do próprio projeto** — sem `nmap`/scanner de porta contra host externo ao ambiente local sob controle de quem está testando.
- **Cuidado redobrado com `lumos-gateway`** — é a borda pública real (`80`/`443` de verdade). Não fazer fuzzing/scan agressivo contra o container do gateway; testar sempre pela porta local do serviço de origem (ex: `farmaura-api` em `127.0.0.1:8080`), não pelo domínio público que o gateway expõe. Nunca mexer em `/etc/letsencrypt` ou material de certificado como parte de um teste.
- Teste de resistência a brute force/DDoS/spam deve rodar contra o ambiente local, com volume limitado — não é um teste de carga de produção.

## Motivo

Sem uma lista explícita, fica implícito demais o que testar e como testar com segurança — risco de um teste de segurança bem-intencionado virar ele mesmo um incidente (varrer porta de produção, vazar chave real, sobrecarregar o gateway público).

## Exceções conhecidas

Nenhuma até 2026-07-20.

## Ver também

- [[padrao-supply-chain-multi-stack]] — detalhe completo de travamento de versão por stack.
- [[../Skills/security-vulnerability-testing|Skills/security-vulnerability-testing]], [[../Skills/qa-functional-review|Skills/qa-functional-review]], [[../Skills/project-test-orientation|Skills/project-test-orientation]] — skills que aplicam ativamente esta política.
- `claude.md`/`agent.md` — texto completo das regras estáticas referenciadas na tabela acima.

## Atualizações

- 2026-07-20: nota criada.
