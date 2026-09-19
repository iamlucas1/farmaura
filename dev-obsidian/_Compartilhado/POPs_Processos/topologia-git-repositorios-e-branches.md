---
cssclasses: ia-nota
---

# Topologia de repositórios Git e convenção de branches (todos os projetos)

> Como usar: referência de "onde cada pasta versiona e para qual branch subir" — antes de commitar ou dar push em qualquer parte do ecossistema, confirmar aqui qual repositório real aquela pasta pertence e qual branch é a convencionada. Se um projeto novo entrar no ecossistema, adicionar uma seção aqui e, se relevante, um link a partir do `Hub.md` do projeto.

## Quando usar

Antes de `git add`/`git commit`/`git push` em qualquer pasta deste ecossistema — para não misturar código de projetos diferentes num commit, nem publicar num repositório/branch errado. Também ao integrar um projeto novo: decidir aqui a convenção de branch antes de abrir o primeiro PR.

## Visão geral: um diretório de trabalho, vários repositórios independentes

`~/Documentos/desenvolvimento/dev` (a raiz onde tudo isso vive no disco) **não é um único repositório Git** — é um diretório de trabalho que hospeda o repositório do Farmaura na raiz e, dentro dele, os repositórios do LumosMed/lumos-api/lumos-gateway como pastas **totalmente independentes**, cada uma com seu próprio `.git`, remoto e histórico. O `.gitignore` da raiz declara isso explicitamente (`/lumos-api/`, `/lumos-gateway/`, `/lumosmed/` — "sibling projects have their own independent git repos"), então nada dentro dessas três pastas nunca entra num commit do repositório do Farmaura, mesmo com `git add` amplo.

`dev-obsidian/` (o cofre de conhecimento, com pastas para `farmaura/`, `lumosmed/` e `_Compartilhado/`) vive dentro do repositório do **Farmaura** — é por isso que documentação sobre o LumosMed também é versionada ali, embora o código do LumosMed em si esteja num repositório à parte. O diretório de trabalho local foi renomeado de `Farmaura` para `dev` justamente para refletir que hoje hospeda mais de um produto, mesmo o remoto Git continuando a se chamar `farmaura`.

## Farmaura (`farmaura/` + `farmaura-api/` + `dev-obsidian/`, na raiz deste diretório)

- **Repositório**: `git@github.com:iamlucas1/farmaura.git` — é o próprio diretório raiz (`~/Documentos/desenvolvimento/dev`), não uma subpasta.
- **`main`** — branch de produção. Deploy real em `lumos-prd` (`/opt/farmaura`, `drogariafarmaura.com.br`) só acontece mediante pedido explícito do usuário — nunca por iniciativa própria da IA (ver `dev-obsidian/CLAUDE.md` → "Regras de deploy").
- **`staging/lumos-dev`** — branch de desenvolvimento/staging corrente. É onde o trabalho de sessão se acumula antes de ir para `main`, e é também o que fica publicado em `https://dev.drogariafarmaura.com.br` (ambiente real, dados de seed) — ver [[../../farmaura/07_POPs_Processos/publicar-staging-lumos-dev|publicar-staging-lumos-dev]] para o passo a passo completo de publicação/atualização desse ambiente.
- Convenção de commit ao acumular trabalho de sessão como backup: `git add` só os arquivos de código/documentação relevantes do projeto em pauta, nunca as pastas dos projetos-irmãos acima. **Exceção decidida em 2026-09-16**: a pasta `exemplo/` (planilhas de tabela de preço de fornecedor) passou a ser incluída por decisão explícita do usuário, mesmo contendo dado comercial, não código — supersede a orientação anterior de excluí-la sempre.
- **Reversão em 2026-09-19**: a orientação original desta nota dizia "nunca pastas de estado local de ferramenta de IA (`.claude/`, `.agent/`, `.codex/`, `.gemini/`, `.impeccable/`, `.vite/`)" — isso deixou de valer. Por decisão explícita do usuário, todas essas pastas passaram a ser versionadas (allow-lists de permissão, skills instaladas, cache de críticas de design do Impeccable, cache de pre-bundle do Vite), justamente para que uma máquina nova já herde o mesmo ambiente de agente de IA calibrado ao clonar o repositório. Ver [[../../farmaura/00_Decisoes/2026-09-19-versionar-config-de-agentes-e-caches-de-ferramentas|ADR desta decisão]] e [[replicar-ambiente-de-desenvolvimento-em-nova-maquina|POP de replicação de ambiente]] que depende dela. Continuam fora, por serem estritamente locais (não por essa convenção, mas por exclusão própria da ferramenta/do usuário): `hook.cache.json`/`hook.pending.json`/`config.local.json` do Impeccable (via `.git/info/exclude`) e `.claude/settings.local.json` (via `.gitignore` global do usuário).

## LumosMed (`lumosmed/`)

- **Repositório**: `git@github.com:iamlucas1/lumosmed.git`.
- **`master`** — branch principal, local e remota (`origin/master`).
- **`origin/desenv`** — branch de desenvolvimento no remoto (sem checkout local no momento deste levantamento).
- Branches de feature também aparecem no remoto com prefixo `codex/` (ex.: `codex/corrigir-erro-404-nas-rotas`) — indicam trabalho de agente aberto em paralelo, não necessariamente mergeado ainda.

## lumos-api (`lumos-api/`)

- **Repositório**: `git@github.com:iamlucas1/lumos-api.git`.
- **`master`** — branch principal, local e remota.
- **`origin/desenv`** — branch de desenvolvimento no remoto.
- **`origin/database`** — branch adicional no remoto (provável trabalho de schema/migração isolado — confirmar propósito antes de basear trabalho nela, não documentado até agora).

## lumos-gateway (`lumos-gateway/`)

- **Repositório**: `git@github.com:iamlucas1/lumos-gateway.git`.
- **`desenv`** — branch atualmente com checkout local ativo.
- **`master`** — branch principal, existe local e remota.
- Branches de feature `codex/*` também presentes no remoto (ex.: `codex/update-nginx-template-for-url-routing`).
- Ver [[../../farmaura/05_Integracoes_Infra/Lumos_Gateway|Lumos_Gateway]] para o papel de infraestrutura compartilhada deste repositório (serve múltiplos tenants, não só Farmaura).

## Ver também

- [[resposta-a-chave-tls-exposta-em-git]] — POP de incidente relacionado a Git, mesma pasta.
- [[../../farmaura/07_POPs_Processos/publicar-staging-lumos-dev|publicar-staging-lumos-dev]] — fluxo de publicação que depende diretamente da branch `staging/lumos-dev` documentada aqui.
- `dev-obsidian/CLAUDE.md` → "Regras de deploy" — política de quando a IA pode/não pode agir em produção.

## Atualizações

- 2026-09-19: revertida a orientação de nunca commitar pastas de estado de ferramenta de IA (`.claude/`, `.agent/`, `.agents/`, `.codex/`, `.gemini/`, `.impeccable/`, `.vite/`) — por decisão explícita do usuário, todas passaram a ser versionadas (ver seção "Farmaura" acima e [[../../farmaura/00_Decisoes/2026-09-19-versionar-config-de-agentes-e-caches-de-ferramentas|ADR]]).
- 2026-09-16: nota criada, junto com o primeiro backup consolidado do trabalho pendente do Farmaura (`staging/lumos-dev`) — levantamento feito por inspeção direta (`git remote -v`, `git branch -a`) de cada repositório.