# Chaves privadas TLS expostas no histórico git do lumos-gateway

**Tipo:** Vulnerabilidade
**Severidade:** Crítica
**Status:** Aberto
**Data de identificação:** 2026-07-18

## Descrição

O repositório `lumos-gateway` (compartilhado entre Farmaura e Lumos, incluindo LumosMed) tem chaves privadas TLS (`privkey.pem`) commitadas em pelo menos dois pontos do histórico git, alcançáveis a partir de **ambas** as branches `master` e `desenv`:

- **Commit `7d97757`** (2025-08-10, "Primeiro commit do gateway") — adiciona `certs/live/**/privkey.pem` e `certs/archive/**/privkey.pem` de vários domínios: `api.lumosanalytics.com.br`, `dev.adcrdf.com.br`, `dev.api.lumosanalytics.com.br`, `dev.cursocompany.app.br`, `dev.drathamaravasconcelos.com.br`, `dev.lumosmed.com.br`, `dev.whatsapp.lumosanalytics.com.br`, `lumosmed.com.br`, `adcrdf.com.br`, `portal.lumosanalytics.com.br`, `whatsapp.lumosanalytics.com.br`.
- Houve uma remoção posterior (`2606920`, "Removendo pasta certs") seguida de um endurecimento de segurança (`5ccb336` "Harden gateway security and enable country/IP controls", múltiplos PRs "review-security-measures").
- **Mas as chaves foram re-commitadas depois da remoção**: commit **`296e260`** (2026-03-28, "chore: atualizações gerais") volta a adicionar `privkey.pem` de `api.lumosanalytics.com.br`, `dev.lumosmed.com.br`, `dev.api.lumosanalytics.com.br`, `dev.whatsapp.lumosanalytics.com.br`, entre outros.

O próprio repositório já contém um runbook para esse cenário exato — `lumos-gateway/RUNBOOK-TLS-ROTATION.md` — o que indica que o incidente já foi identificado internamente em algum momento, mas o commit `296e260` (mais recente que a remoção registrada) sugere que a exposição **recorreu** ou que a limpeza de histórico (`git filter-repo`/BFG + force-push, descrita no runbook) não chegou a ser concluída — ou não cobriu essa reintrodução.

**Hoje a pasta `certs/` não está na árvore de trabalho atual** (`git ls-files` não lista nenhum `.pem`/`.key` sob controle de versão no HEAD corrente), mas os commits acima continuam alcançáveis pelo histórico normal (`git log`, `git show`), então as chaves seguem recuperáveis por qualquer um com acesso de leitura ao repositório (clone, fork, ou o remoto no GitHub) — a menos que o histórico do **remoto** já tenha sido reescrito separadamente, o que não foi possível confirmar só a partir do clone local.

Nenhum conteúdo de chave foi lido ou exibido durante esta investigação — apenas nomes de arquivo via `git log --name-only`.

## Impacto

Chave privada TLS comprometida permite que um atacante decifre tráfego capturado ou personifique o domínio (man-in-the-middle) para os domínios listados, incluindo **`dev.lumosmed.com.br`** — ambiente do LumosMed. Também expõe potencialmente as chaves de conta ACME (`certs/accounts/.../private_key.json`) vistas no commit `7d97757`.

## Mitigação / Tratamento

Nenhuma confirmada até 2026-07-18. O próprio `lumos-gateway/RUNBOOK-TLS-ROTATION.md` já descreve o procedimento completo:

1. Revogar os certificados expostos via Let's Encrypt (`certbot revoke --reason keyCompromise`) para cada domínio afetado.
2. Emitir certificados novos.
3. Limpar o histórico do git (o runbook sugere BFG Repo Cleaner ou `git-filter-repo`) e fazer `push --force` no remoto — todos os colaboradores precisam clonar de novo depois.
4. Rotacionar segredos derivados, se as chaves expostas também foram usadas para mTLS ou assinatura de JWT interno (ex: `PORTAL_PUBLIC_KEY` usado pela autenticação interna RS256 — ver [[2026-03-27-autenticacao-interna-rs256-assinada]]; **confirmar que a chave usada nesse padrão não é uma das expostas aqui**).
5. Confirmar que o `.gitignore` atual do `lumos-gateway` (já bloqueia `*.pem`/`*.key`/`certs/`) está de fato em vigor e que nada foi commitado desde `296e260` que reintroduza o problema.

## Referências

- `lumos-gateway/RUNBOOK-TLS-ROTATION.md` (runbook completo, já existente no repositório).
- Ver também [[2026-03-27-autenticacao-interna-rs256-assinada]] para o uso de chave RSA na autenticação interna, caso haja sobreposição.
- Como `lumos-gateway` é infraestrutura compartilhada com o Farmaura ([[Lumos_Gateway]]), a exposição de qualquer domínio de produção nesse repositório é relevante para os dois produtos, não só o LumosMed.
- POP de resposta generalizado: [[resposta-a-chave-tls-exposta-em-git]] (`_Compartilhado/POPs_Processos/`).
- [[Lumos_Gateway_Roteamento]] — mapa de roteamento do mesmo gateway comprometido.

## Atualizações

- 2026-07-19: nota criada.
