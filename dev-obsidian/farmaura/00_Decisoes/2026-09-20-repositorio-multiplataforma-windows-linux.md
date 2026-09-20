---
cssclasses: ia-nota
---

# 2026-09-20 — Repositório que roda igual em Windows e Linux (trocar de máquina sem ajuste)

## Contexto

O desenvolvimento passou a alternar entre um computador Linux e um Windows (clone novo em `C:\Users\maria\OneDrive\Documentos\Farmaura`, Docker Desktop, `uv`/Node via `winget`). Pedido do usuário: que tudo rode nos dois sistemas, para trocar de computador sem maiores problemas. Auditoria do que dependia de sistema:

- **Código de produto** (`farmaura-api/`, `farmaura/`, `farmaura-pdv-bridge/`): nenhuma dependência de SO — sem `fcntl`/`resource`/`os.getuid`, sem caminhos absolutos, `vite.config.js` só com `node:path`, `package.json` sem sintaxe de shell POSIX, `docker-compose.yml` só com volumes nomeados e contextos relativos, a suíte importa e roda no Windows.
- **Fim de linha:** sem `.gitattributes`; o repositório estava todo em LF só porque *esta* máquina tem `core.autocrlf=input`. Um clone Windows com o padrão (`autocrlf=true`) reescreveria `farmaura-api/docker/entrypoint.sh` (copiado para a imagem Linux) com CRLF e o container da API falharia ao subir.
- **Scripts:** `docker_up.sh`/`docker_rebuild_web.sh` não rodam direto no PowerShell (o `sh` do Git Bash não está no `PATH` do Windows). O Windows vinha contornando com comandos `docker compose` avulsos autorizados em `.claude/settings.json`.
- **`.claude/settings.local.json`:** só ficava fora do git por um `.gitignore` *global* do usuário no Linux; no Windows aparecia como arquivo novo, com ~25 aprovações de `winget`/`PowerShell` e caminhos `C:\Users\...`.
- **Mailhog:** o comentário do compose mandava usar `APP_SMTP_HOST=host.docker.internal`, que só resolve no Docker Desktop, não no Docker Engine do Linux. (Nenhum `.env` atual define SMTP, então nada estava quebrado hoje.)

## Alternativas consideradas

- **Só documentar `git config core.autocrlf input`** — descartada: é configuração por máquina; esquecê-la numa máquina nova reintroduz o problema em silêncio.
- **Trocar os `.sh` por um único script Python/Node** — descartada: para dois wrappers de `docker compose` de 1–3 linhas, um runtime extra é mais complexidade que dois arquivos gêmeos; e os `docker compose` puros já servem como denominador comum.
- **Mover as regras `PowerShell(...)` de `settings.json` para `settings.local.json`** — não feito por conta própria (são aprovações do usuário em arquivo de permissões); as entradas são só adições inofensivas no Linux. Fica como sugestão.
- **Deixar de versionar `settings.local.json` só documentando** — descartada em favor de ignorá-lo no `.gitignore` do repositório, que vale em todas as máquinas.

## Decisão

- `.gitattributes` na raiz: `* text=auto eol=lf` (mais `.sh`, `.ps1` e `Dockerfile` explícitos e uma lista de binários). Verificado que **não altera nenhum arquivo existente** (todos os 1410 arquivos de texto já eram LF no índice) — só protege os próximos clones e commits.
- Cada `.sh` de `farmaura-api/scripts/` ganhou um `.ps1` gêmeo com o mesmo comportamento (`docker_up.ps1`, `docker_rebuild_web.ps1`), só ASCII e LF, repassando argumentos e o código de saída. Testado no Windows: parse sem erros, `docker_up.ps1 --help` repassa o argumento ao `docker compose`, e o `.sh` também roda pelo Git Bash. Regra daqui pra frente: mudar um do par exige mudar o outro.
- `.claude/settings.local.json` entrou no `.gitignore` do repositório (aprovações do agente são por máquina).
- Comentário do compose corrigido: Mailhog via `APP_SMTP_HOST=farmaura-mailhog` / `APP_SMTP_PORT=1025`, que funciona nos dois sistemas.
- Documentação: `farmaura-api/README.md` (comandos nos dois sistemas + política de execução do PowerShell) e o POP [[../../_Compartilhado/POPs_Processos/replicar-ambiente-de-desenvolvimento-em-nova-maquina|replicar ambiente]] (seção "Windows e Linux").

## Consequências

- Um clone limpo em qualquer sistema produz os mesmos bytes; `entrypoint.sh` nunca chega com CRLF à imagem.
- **Não foi testado num Linux real** (a verificação foi feita no Windows): `docker compose config` valida o compose, mas o caminho Linux dos `.ps1` é irrelevante e o dos `.sh` já existia. O que vale reconfirmar na máquina Linux é `git status` limpo depois do `pull` e um `docker compose up --build` completo.
- O bit de executável dos `.sh` (`100755`) está no índice, mas o Git no Windows (`core.fileMode=false`) não o mantém sozinho: qualquer `.sh` **novo** criado no Windows entra como `100644` e não roda com `./` no Linux — usar `git update-index --chmod=+x <arquivo>` ao adicioná-lo.
- Em pasta sincronizada pelo OneDrive, `.git`/`node_modules`/`.venv` podem sofrer com travas e sincronização parcial — o clone atual está dentro do OneDrive; risco operacional, não corrigido aqui (mover o clone para fora é decisão do usuário).
- A regra "toda alteração de código fica em `~/Documentos/desenvolvimento/dev/`" do `dev-obsidian/CLAUDE.md` cita o caminho da máquina Linux; no Windows a mesma regra vale para a raiz do clone. Texto de governança, não alterado sem pedido.
- `.claude/settings.json` (compartilhado) mantém 3 regras `PowerShell(...)` do Windows: inofensivas no Linux, mas ruído — candidatas a migrar para `settings.local.json`.

## Ver também

- [[../../_Compartilhado/POPs_Processos/replicar-ambiente-de-desenvolvimento-em-nova-maquina|replicar-ambiente-de-desenvolvimento-em-nova-maquina]]
- [[2026-09-19-versionar-config-de-agentes-e-caches-de-ferramentas|Versionar config de agentes]] — decisão anterior que já tratava `settings.local.json` como fora do git, então via gitignore global do usuário.
