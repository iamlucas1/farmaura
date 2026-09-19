---
cssclasses: ia-nota
---

# Replicar o ambiente de desenvolvimento (Farmaura + ecossistema) numa máquina nova

> Como usar: checklist e referência para configurar de novo uma máquina de desenvolvimento (pessoal ou de outra pessoa do time) a partir do zero, puxando tudo do Git — código, documentação e configuração de agentes de IA — e só então tratando separadamente do que **não** pode ir para o Git (segredos reais). Ver [[topologia-git-repositorios-e-branches|topologia-git-repositorios-e-branches]] antes de qualquer `git clone`/`push`, para não confundir qual pasta pertence a qual repositório.

## Quando usar

Ao preparar uma máquina nova (ou reinstalar) para continuar o desenvolvimento do Farmaura (ou de qualquer outro projeto deste ecossistema) — inclusive quando a intenção é que uma IA (Claude Code) trabalhe nessa máquina nova com o mesmo contexto e as mesmas permissões já calibradas nesta.

## Visão geral: o que vem de graça pelo Git vs. o que não vai para o Git nunca

Desde a decisão de 2026-09-19 (ver [[../../farmaura/00_Decisoes/2026-09-19-versionar-config-de-agentes-e-caches-de-ferramentas|ADR]]), o repositório `dev`/`farmaura` já versiona **tudo que uma máquina nova precisa para reproduzir o ambiente de trabalho com IA**, sem passo manual extra:

- Código de produto: `farmaura-api/`, `farmaura/`, `farmaura-pdv-bridge/`, infra própria (`docker/`).
- Toda a documentação viva: `dev-obsidian/` (este cofre).
- Configuração/skills de agentes de IA: `.claude/` (allow-lists de permissão + skills instaladas), `.agents/`, `.agent/`, `.codex/`, `.gemini/` (skills espelhadas para cada ferramenta) e `.impeccable/` (config + histórico de críticas de design, nas três cópias: raiz, `farmaura-api/`, `farmaura/`).
- `.vite/` — cache de pre-bundle de dependências do frontend (`farmaura/`). É só cache de build; se algo parecer desatualizado depois do clone, apagar a pasta e deixar o Vite recriar sozinho no próximo `dev`/`build` não tem custo nem risco.

**O que nunca vai para o Git, em nenhuma hipótese, mesmo que peçam explicitamente**: valores reais de `.env` (senhas, chaves de API, segredos de assinatura JWT, credenciais SMTP/pagamento). Isso é regra do próprio cofre (`dev-obsidian/CLAUDE.md` → "Regra de Segurança do Cofre": *"Nunca gravar segredos, chaves, tokens ou valores reais de `.env` em nenhuma nota"*) e vale para qualquer arquivo versionado, não só para notas do Obsidian — histórico de Git é permanente e este mesmo cofre já documentou um incidente real de chave TLS exposta em commit (ver [[resposta-a-chave-tls-exposta-em-git|resposta-a-chave-tls-exposta-em-git]]). Por isso esta nota documenta **onde** cada segredo mora e **como transferi-lo com segurança**, nunca o valor em si.

## Pré-requisitos de software na máquina nova

- `git`, com uma chave SSH cadastrada no GitHub (`iamlucas1`) com acesso aos repositórios privados.
- Docker (qualquer uma das duas variantes documentadas em [[../../docker/05_Integracoes_Infra/Ambiente_Docker_Local|Ambiente_Docker_Local]] — nativo via pacote ou Docker Desktop; numa máquina nova, normalmente só uma das duas existirá, o que evita a confusão de contexto documentada ali) com `docker compose` v2.
- Node.js (versão compatível com Vite 7, usado por `farmaura/package.json`) e Python 3.13.13 + `uv`, **somente se for rodar a API fora do Docker** — o fluxo Docker (recomendado, ver abaixo) não exige nenhum dos dois instalados no host.

## Passo 1 — clonar o(s) repositório(s) certo(s), na branch certa

Consultar [[topologia-git-repositorios-e-branches|topologia-git-repositorios-e-branches]] para a lista completa e atualizada; resumo para continuar o desenvolvimento do Farmaura especificamente:

```bash
git clone git@github.com:iamlucas1/farmaura.git dev
cd dev
git checkout staging/lumos-dev   # branch de desenvolvimento corrente — não main (produção)
```

O diretório local se chama `dev` por convenção (o remoto continua `farmaura.git`) — usar esse mesmo nome de pasta na máquina nova só por consistência com o resto desta documentação (todos os caminhos relativos aqui assumem essa raiz); não é um requisito técnico do Git.

Só clonar os repositórios-irmãos (`lumosmed/`, `lumos-api/`, `lumos-gateway/`) **dentro** dessa mesma pasta `dev/` se o trabalho na máquina nova também incluir esses produtos — são repositórios Git totalmente independentes, cada um com seu próprio remoto/branch (ver a mesma nota de topologia). Para continuar só o Farmaura, não são necessários.

## Passo 2 — segredos: onde ficam e como transferir de verdade

Nenhum `.env` real está no Git (confirmar com `git check-ignore -v farmaura-api/.env` — deve apontar para a regra `.env`/`.env.*` do `.gitignore` da raiz). O que **está** versionado é o template `farmaura-api/.env.example`, com todas as variáveis nomeadas e vazias/placeholder.

1. `cp farmaura-api/.env.example farmaura-api/.env`.
2. Para **desenvolvimento local via Docker** (fluxo recomendado, Passo 3), a maioria das variáveis já funciona com os valores de exemplo/placeholder — o compose local aponta banco/cache para os próprios containers (`farmaura-postgres`, `farmaura-valkey`) com credenciais de desenvolvimento já fixas no `docker-compose.yml` (não são segredos reais, são credenciais triviais de container isolado). As únicas que exigem um valor real da máquina antiga, e só se essas features forem usadas localmente:
   - `APP_AI_GEMINI_API_KEY` / `APP_AI_OPENAI_API_KEY` — só necessárias para os recursos de IA de estoque/orçamentos; sem elas, o resto do sistema funciona normalmente.
   - `APP_SMTP_*` — em dev, o Mailhog (`http://127.0.0.1:8025`) já captura e-mails sem autenticação nenhuma; só preencher se for testar contra um SMTP real.
   - `APP_INITIAL_ADMIN_EMAIL`/`APP_INITIAL_ADMIN_PASSWORD` — só usados em `APP_ENV=production` com banco vazio; em dev, o seed determinístico já cria os usuários de teste (ver [[../../farmaura/07_POPs_Processos/resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] — inclusive a senha padrão de todos os usuários semeados, `Farmaura@123`, já documentada ali, não é segredo real).
3. Se algum desses valores reais precisar mesmo ser levado de uma máquina para a outra (ex: uma chave de API paga que você quer reaproveitar), transferir por um canal **fora do Git e fora do chat com a IA**: um gerenciador de senhas compartilhado (1Password/Bitwarden), ou copiar o `.env` direto entre as duas máquinas (`scp usuario@maquina-antiga:~/Documentos/desenvolvimento/dev/farmaura-api/.env ./farmaura-api/.env`, via SSH). Nunca colar o valor real numa mensagem para a IA nem pedir para ela escrever o valor em qualquer arquivo do cofre ou do repositório — a IA deve recusar esse pedido especificamente, mesmo se solicitado, precisamente pela regra citada na seção anterior.
4. `farmaura-api/.env.production` segue a mesma regra (gitignored, nunca documentado com valor real) — só existe no servidor de produção (`lumos-prd`), nunca deveria precisar ser replicado numa máquina de desenvolvimento.

## Passo 3 — subir a stack via Docker

Passo a passo completo e comandos operacionais já documentados em `farmaura-api/README.md` (arquivo real do repositório, não nota do cofre) — resumo:

```bash
cd farmaura-api
./scripts/docker_up.sh   # equivalente a: docker compose up --build
```

Isso sobe `farmaura` (nginx + build do frontend, `127.0.0.1:3000`), `farmaura-api` (`127.0.0.1:8080`), `farmaura-postgres`, `farmaura-valkey` e `farmaura-mailhog` (`127.0.0.1:8025`). No primeiro boot, com o banco vazio, `bootstrap_database.py` cria o schema, aplica RLS e roda o seed determinístico automaticamente — nenhum passo manual de seed é necessário (ver [[../../farmaura/07_POPs_Processos/resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] para os detalhes e para como forçar um reset depois).

Acessar `http://127.0.0.1:3000/marketplace` e `http://127.0.0.1:3000/internal` para confirmar. **Nunca testar contra a porta 5173** (`vite --host` direto, fora do Docker) para verificação visual — bug real e já documentado de `<base href>` deixa essa porta em branco; usar sempre a build servida pelo Nginx na porta 3000 (ver memória de sessão `feedback_farmaura_visual_verification`).

## Passo 4 — orientar a IA (Claude Code) na máquina nova

Depois do clone, antes de qualquer mudança de código:

1. A IA deve ler `dev-obsidian/CLAUDE.md` (governança do cofre) e a raiz `claude.md`/`agent.md` (convenções estáticas do repositório) — chegam prontos pelo clone, não precisam ser recriados.
2. Rodar a skill `/contexto farmaura` (ou `/contexto <projeto>` para outro produto) antes de começar a programar — ela já automatiza a leitura do `Hub.md`, decisões recentes, pendências e riscos relevantes ao escopo pedido.
3. Confirmar a branch corrente (`git branch --show-current` deve mostrar `staging/lumos-dev` para trabalho de desenvolvimento, nunca `main` sem pedido explícito de deploy).
4. As permissões de Bash já calibradas nesta máquina (allow-list de comandos seguros, comandos destrutivos sempre em "ask") vêm prontas via `.claude/settings.json`, já versionado — não é preciso reconstruir essa lista na mão na máquina nova. `.claude/settings.local.json` (aprovações específicas desta sessão/máquina) fica de fora por convenção do próprio Claude Code (gitignore global do usuário), então a IA vai pedir confirmação de novo para ações ainda não cobertas pelo `settings.json` compartilhado — esperado, não é regressão.

## Ver também

- [[topologia-git-repositorios-e-branches|topologia-git-repositorios-e-branches]] — qual pasta pertence a qual repositório/branch; ler antes do clone.
- [[../../docker/05_Integracoes_Infra/Ambiente_Docker_Local|Ambiente_Docker_Local]] — particularidades de engine Docker desta máquina especificamente; numa máquina nova, mais simples (só uma engine).
- [[../../farmaura/07_POPs_Processos/resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] — o que o seed automático já cobre e como forçar um reset.
- `farmaura-api/README.md` — comandos operacionais completos de execução local/Docker (arquivo real, fora do cofre).
- [[resposta-a-chave-tls-exposta-em-git|resposta-a-chave-tls-exposta-em-git]] — por que segredo real nunca entra em nenhum arquivo versionado, nem em nota de documentação.

## Atualizações

- 2026-09-19: nota criada, junto com a decisão de versionar `.claude/`, `.agents/`, `.agent/`, `.codex/`, `.gemini/`, `.impeccable/` e `.vite/` no repositório (ver [[topologia-git-repositorios-e-branches|topologia-git-repositorios-e-branches]], seção atualizada na mesma data).
