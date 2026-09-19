---
name: contexto
description: Carrega o contexto necessário para começar a programar num projeto deste repositório — arquitetura, decisões, padrões, riscos e pendências do dev-obsidian, cruzados com os arquivos de código reais do escopo pedido. Suporta variações por argumento — geral, só documentação, por projeto (farmaura/lumosmed), por área (frontend/backend/full) ou por módulo específico. Use quando o usuário digitar "/contexto", pedir "puxa o contexto", "me dá o contexto de X" ou for começar a implementar/alterar algo e ainda não tiver contexto carregado na conversa.
---

# Contexto (para começar a programar)

Objetivo desta skill: deixar a próxima etapa ser **escrever código com segurança**, não só informar. Ao final, deve ficar claro: o que já existe, quais regras/convenções valem para esse escopo, o que já é pendência/risco conhecido ali, e quais arquivos de código reais são o ponto de entrada para a mudança.

Skill somente leitura: reúne o que já existe em `dev-obsidian/` e no código-fonte do escopo pedido, e devolve um resumo direto — sem repetir levantamento manual toda vez. Nunca cria, edita ou apaga nada no cofre nem no código; isso é o trabalho normal que vem *depois*, não desta skill. `01_Contexto_Usuario/` pode ser lido aqui (é só escrita que é proibida para IA).

Antes de aplicar qualquer mudança de código depois desta skill, as regras de `dev-obsidian/CLAUDE.md` → "Regras Operacionais Gerais" continuam valendo integralmente (escopo de escrita restrito a este repositório, nunca editar cache de pacote, deploy só sob pedido explícito via `ssh lumos-prd`, documentar tudo).

## Como interpretar `args`

`args` é texto livre, com até três pedaços independentes, em qualquer ordem:

- **projeto**: `farmaura` | `lumosmed` — se omitido, cobrir os dois projetos, de forma mais enxuta cada um.
- **área**: `docs` | `frontend` | `backend` | `full` (default) — ver "Modos" abaixo.
- **módulo**: qualquer outra palavra, ou `modulo:<nome>` / `módulo <nome>` — casar por aproximação com os arquivos `Modulo_*.md` de `farmaura/02_Documentacao/` (ex: `pdv` → `Modulo_PDV.md`, `estoque` → `Modulo_Estoque.md`). Em `lumosmed`, que não tem `Modulo_*.md` próprio, casar com as áreas funcionais listadas no `Hub.md` (Agenda, Pacientes, Usuários, WhatsApp, Configurações da clínica, IA/Luna, Faturamento, Autenticação, Prontuário) e tratar como busca por palavra-chave nas categorias, não como arquivo único.

Exemplos de invocação e o que cada um dispara:

| Comando | Efeito |
|---|---|
| `/contexto` | Modo geral, os dois projetos |
| `/contexto docs` | Só documentação (`02_Documentacao/`), os dois projetos |
| `/contexto farmaura` | Contexto completo do projeto farmaura |
| `/contexto lumosmed docs` | Só documentação do lumosmed |
| `/contexto farmaura frontend` | Farmaura, recortado para front-end |
| `/contexto farmaura backend` | Farmaura, recortado para backend |
| `/contexto farmaura pdv` | Farmaura, módulo PDV especificamente |
| `/contexto lumosmed faturamento` | Lumosmed, área funcional de faturamento |

Se `args` vier ambíguo (ex: uma palavra que não bate com projeto, área nem módulo conhecido), assumir que é tentativa de nome de módulo e buscar por aproximação; se não achar nada relevante, avisar e cair no modo geral do projeto mais próximo (ou geral dos dois, se também não achar projeto).

## Passo 0 (sempre)

Confirmar que `dev-obsidian/CLAUDE.md` já é conhecido (governança do cofre) — não precisa reler se já estiver no contexto da sessão. Projetos existentes hoje: `farmaura/` e `lumosmed/` (mais `_Compartilhado/`, que não é projeto).

Ler também `_Compartilhado/Padroes_Politicas/` inteiro (exceto `_Template.md`), em todo modo e independente do projeto — são padrões técnicos genéricos (segurança/ataques, auth de webhook, RLS multi-tenant, supply chain) que valem para qualquer stack do ecossistema, não só para o projeto em escopo. É pequeno (poucos arquivos), então ler sempre, sem precisar de grep por palavra-chave.

Ler também `~/.claude/settings.json` e `.claude/settings.json` deste repositório (allow lists global e do projeto) antes de rodar qualquer comando via Bash nesta skill — isso vale para **todo modo** (`docs`, geral, `frontend`/`backend`, módulo específico), não é passo condicional a nenhum deles. Ao precisar de grep/busca de arquivo durante a skill, usar os padrões já cobertos por essas allow lists (ex.: `grep -ril "<termo>" <caminho>` e `find <caminho> -iname "<padrão>"`, já liberados via `Bash(grep *)`/`Bash(find *)` na allow list global) em vez de variações não cobertas (`rg`, `ag`, flags incomuns) que disparariam prompt de autorização à toa.

### Política de permissões (allow/ask) — vale para toda sessão, não só para esta skill

`settings.json` é lido de verdade pelo Claude Code e governa se um comando roda direto ou pede confirmação — quando o usuário aprova algo com "sempre permitir", a IA adiciona a regra à allow list automaticamente. A política combinada, hoje distribuída em `~/.claude/settings.json` (global) e `.claude/settings.json` deste repositório (versionado, compartilhado com o time), é:

- **Pode ir para "allow" (liberar sem perguntar de novo)**: leitura, navegação e comandos idempotentes — `cd`, `ls`, `pwd`, `cat`, `head`/`tail`, `grep`, `find`, `wc`, `file`, `git status`/`diff`/`log`/`show`/`branch` (sem args destrutivos), instalação de dependências, build/test (`npm`, `pytest`, `vite build`), `docker ps`/`logs`/`images`/`inspect`/`compose logs`/`compose ps`. Comandos novos que o usuário for aprovando manualmente entram aqui, **exceto** se caírem na categoria abaixo.
- **Fica sempre em "ask" (nunca vira allow permanente, mesmo se aprovado uma vez)**: qualquer comando que remove/descarta algo — local, no servidor, no Docker ou no Git. Isso inclui `rm`, `sudo`/`su`, `chmod`/`chown`, `kill -9`/`pkill`, `git push --force`/`-f`, `git reset --hard`, `git clean -f`, `git checkout`/`git switch` (podem descartar alterações não commitadas), `git branch -D`/`-m`, `git rebase`, `git rm`, `docker rm`/`rmi`/`volume rm`/`network rm`/`*prune`. Nunca promover essas regras para "allow" — se o usuário aprovar uma execução pontual, isso não deve virar liberação permanente, só a aprovação daquela vez.
- Ao editar `settings.json` (deste repositório ou o `~/.claude/settings.json` global) para adicionar uma allow rule nova, sempre checar se ela não é mais ampla que uma regra já existente em "ask" (ex.: `Bash(git checkout *)` em allow sobrepõe `Bash(git checkout -- *)` em ask — quem decide é a regra de "allow", então um allow amplo demais anula a proteção do ask). Prefira o padrão mais específico possível.

## Modos

### Geral (sem argumento, ou só um projeto sem área/módulo → aqui é o "full")

Para cada projeto em escopo:

1. Ler `<projeto>/Hub.md` inteiro.
2. Ler tudo em `<projeto>/01_Contexto_Usuario/` (exceto `_LEIA-ME_IA.md` se for só instrução de formato).
3. Ler as notas mais recentes de `<projeto>/00_Decisoes/` (nome do arquivo é `AAAA-MM-DD-...`, pegar as ~5 mais recentes por data).
4. Ler tudo em `<projeto>/06_Pendencias/` (exceto `_Template.md`).
5. Ler `<projeto>/02_Documentacao/Visao_Geral.md`.

Se o modo for `full` explícito para um projeto (ex: `/contexto farmaura full`), além do acima, também abrir `03_Padroes_Politicas/`, `04_Seguranca_Riscos/` e `05_Integracoes_Infra/` inteiros daquele projeto.

### `docs`

Ler somente `<projeto>/02_Documentacao/` inteiro (todos os `Modulo_*.md` além de `Visao_Geral.md`, exceto `_Template.md`). Não ler decisões, pendências nem segurança neste modo — é propositalmente mais estreito e rápido na parte do cofre.

Isso não dispensa a seção "Código real" abaixo: mesmo em modo `docs`, a resposta tem que terminar pronta para escrever, não só para explicar a arquitetura. Se `docs` vier combinado com um módulo (ex: `/contexto farmaura pdv docs`), resolver os arquivos de código desse módulo como na seção "Módulo específico". Se vier sem módulo (`/contexto docs` ou `/contexto farmaura docs`), mapear e citar os arquivos de entrada prováveis de cada domínio/tela documentado, no nível raso descrito em "Código real", sem ler cada um a fundo.

### `frontend` / `backend`

Base: sempre ler `<projeto>/Hub.md`, `01_Contexto_Usuario/` e `02_Documentacao/Visao_Geral.md` primeiro (contexto mínimo).

Depois, dentro de `00_Decisoes/`, `03_Padroes_Politicas/`, `04_Seguranca_Riscos/`, `05_Integracoes_Infra/`, `06_Pendencias/`, `07_POPs_Processos/` do projeto **e** de `_Compartilhado/POPs_Processos/` (o `_Compartilhado/Padroes_Politicas/` já foi lido inteiro no Passo 0), usar `grep -ril` (ignorando `_Template.md`) por palavras-chave e abrir só o que bater:

- **frontend**: `react`, `jsx`, `vite`, `blade`, `laravel` (só a camada de view/BFF do lumosmed, não o domínio Python), `design-system`, `frontend`, `front-end`, `ui`, `css`.
- **backend**: `fastapi`, `sqlalchemy`, `flask`, `service`, `repository`, `endpoint`, `api/v1`, `domains/`, `model`, `schema`, `migration`, `alembic`, `rls`, `postgres`, `valkey`.

Também incluir os `Modulo_*.md` de `02_Documentacao/` cujo conteúdo bater com essas palavras (um módulo geralmente cobre os dois lados — citar qual parte é relevante ao resumir).

### Módulo específico

1. Resolver o nome do módulo por aproximação (case-insensitive, aceita parcial: `pdv`, `PDV`, `ponto de venda` → `Modulo_PDV.md`).
2. Farmaura: ler `<projeto>/02_Documentacao/Modulo_<Nome>.md` inteiro.
3. Depois, `grep -ril "<nome-do-modulo>"` (e variações de capitalização/nome de arquivo/rota conhecida, ex: `pdv.py`, `pdv_service.py`) em `00_Decisoes/`, `03_Padroes_Politicas/`, `04_Seguranca_Riscos/`, `05_Integracoes_Infra/`, `06_Pendencias/` do projeto e em `_Compartilhado/POPs_Processos/` — abrir só o que bater (`_Compartilhado/Padroes_Politicas/` já foi lido inteiro no Passo 0).
4. Lumosmed (sem `Modulo_*.md` próprio): tratar o nome como área funcional do `Hub.md` (ex: "faturamento" → `PortalBillingApiController`/`billing.py`) e fazer o mesmo grep por esse nome e pelos nomes de arquivo/controller citados no `Hub.md` para essa área.

## Código real (sempre, em todo modo — inclusive `docs`)

O objetivo é programar em seguida, então nenhum modo para na documentação — resolver e abrir também os arquivos de código de verdade do escopo, para chegar na implementação já orientado:

- **Farmaura backend**: usar a tabela "Domínios de Negócio (backend)" do `farmaura/Hub.md` para mapear módulo/área → arquivos em `farmaura-api/app/api/v1/`, `app/services/`, `app/repositories/`, `app/models/`, `app/schemas/`. Abrir pelo menos a rota e o serviço do domínio em escopo (ler, não editar).
- **Farmaura frontend**: localizar a(s) tela(s)/componente(s) relevantes em `farmaura/react/marketplace/` e/ou `farmaura/react/internal/` (grep pelo nome do módulo/domínio nos dois), mais o que for compartilhado em `farmaura/react/shared/` que a tela usa (API client, controle de acesso).
- **Lumosmed backend**: usar a tabela de controllers do `lumosmed/Hub.md` para mapear área funcional → `lumos-api/domains/lumosmed/api/routes/<arquivo>.py` e `services/<arquivo>.py`.
- **Lumosmed frontend/BFF**: o controller Laravel correspondente em `lumosmed/app/Http/Controllers/Portal/` e a view/rota associada.
- Se o escopo for `full`/geral (sem área definida): não é preciso abrir código de verdade em profundidade — mapear e citar os arquivos de entrada prováveis basta, sem ler todos.
- Se não achar arquivo de código correspondente ao módulo/área pedido (nome mudou, módulo não existe ainda), dizer isso explicitamente em vez de inventar um caminho.

## Como responder

Não despejar o conteúdo bruto dos arquivos lidos. Sintetizar em texto corrido/bullets curtos, terminando num estado "pronto para programar":

1. O que é o projeto/módulo/área em 1-3 frases.
2. Pontos de arquitetura relevantes ao escopo pedido (padrões/convenções que a mudança precisa respeitar).
3. Pendências e riscos de segurança abertos relevantes ao escopo (link do arquivo, não o conteúdo inteiro).
4. Decisões recentes relevantes.
5. **Arquivos de código para começar** — lista explícita dos arquivos reais (rota/serviço/repositório/modelo no backend; tela/componente no frontend) que são o ponto de entrada da mudança, não só a nota que os descreve.
6. Fechar perguntando o que exatamente implementar/alterar, a menos que o usuário já tenha dito — não abrir mais arquivos por conta própria além dos já listados até saber o que vai ser feito.

## Ver também

- `dev-obsidian/CLAUDE.md` → seção "Regras Operacionais Gerais" (por que ler contexto de front-end antes de mexer é regra, não sugestão).
- `dev-obsidian/_Compartilhado/Skills/contexto.md` — nota humana desta mesma skill.
