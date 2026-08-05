# Ambiente de staging/teste em lumos-dev

**Tipo:** Infraestrutura (hospedagem)

## Propósito

Segunda cópia da stack Farmaura, para testar mudanças (inclusive código ainda não commitado/mesclado
em `main`) fora do banco de produção, com dados de seed em vez de dado real. Criada em 2026-08-03/04.

## Contrato

- Servidor: `lumos-dev` (`195.35.19.8`, acesso via `ssh lumos-dev`) — **não é um sandbox isolado**: é o
  mesmo servidor compartilhado que já hospeda michele, thamara, lumosneon, lumosanalytics,
  lumosmed-dev, lumos-api e lumos-horizon atrás do [[Lumos_Gateway|lumos-gateway]] deste host (gateway
  próprio, independente do de `lumos-prd`).
- Link público: `https://dev.drogariafarmaura.com.br` — segue o mesmo padrão de subdomínio `dev.` já
  usado pelos outros projetos neste servidor específico (o gateway roda com `ENVIRONMENT=development`,
  então `scripts/domain_context.sh` prefixa `dev.` automaticamente em qualquer `<PROJETO>_*_DOMAIN_BASE`
  configurado — não é uma convenção exclusiva do Farmaura).
- Código: `/opt/farmaura` neste servidor é um `git clone` da branch `staging/lumos-dev` (não `main`) —
  branch dedicada para publicar o estado de trabalho em andamento sem depender de commit/push
  definitivo em `main`. Ver [[../07_POPs_Processos/publicar-staging-lumos-dev|POP de publicação]].
- `APP_ENV=staging` (nunca `production`) — decisão deliberada: `scripts/bootstrap_database.py`
  decide entre o seed fictício completo (`scripts/seed.py`) e a criação de um único admin real
  (`scripts/production_admin.py`) checando exatamente essa string; qualquer valor diferente de
  `"production"` cai no seed. Banco nasce vazio a cada `docker compose down -v` + `up`, então o seed
  roda de novo automaticamente.
- Integrações desligadas por padrão nesta cópia: `APP_AI_ENABLED=false`, `APP_SMTP_ENABLED=false`,
  `APP_ASAAS_ENABLED=false` — decisão consciente para não consumir cota compartilhada de IA nem
  depender de credenciais reais de pagamento/e-mail num ambiente de teste. `.env` próprio, só no
  servidor, nunca commitado — segredo de JWT gerado especificamente para este ambiente (distinto do
  de produção e do de dev local).
- `farmaura-api/docker-compose.staging.yml` (commitado no repo) é o overlay usado — só sobrescreve
  `APP_ENV`/`APP_BASE_URL`/`APP_MARKETPLACE_BASE_URL`/`APP_ALLOWED_ORIGINS` para
  `dev.drogariafarmaura.com.br`; banco/Valkey seguem as credenciais internas já hardcoded no
  `docker-compose.yml` base (mesma postura do dev local — nunca expostas fora da rede
  `farmaura_private`).
- Gateway deste servidor ganhou a integração `FARMAURA_*` (antes só existia em `lumos-prd`) — mesma
  receita: `.env` (`FARMAURA_PRIMARY_DOMAIN_BASE`/`FARMAURA_DOMAINS_BASE`), `scripts/domain_context.sh`
  (`DOMAIN_PROJECTS`, `load_project_context "FARMAURA"`, binding em `get_ssl_conf_bindings`),
  `entrypoint.sh` (`VARS`, arquivos de log), `nginx/conf.d/10-http-redirect.conf.template`
  (`server_name`), novo `nginx/conf.d/90-farmaura.conf.template` (cópia literal do já validado em
  `lumos-prd`) + bind mount correspondente e `FARMAURA_UPSTREAM: farmaura` no `docker-compose.yml` do
  próprio gateway (arquivos fora deste repositório git, editados direto no servidor — mesmo padrão de
  drift já documentado em [[Lumos_Gateway]] para a integração equivalente em produção).

## Bug real encontrado e corrigido durante a integração no gateway

`scripts/domain_context.sh::get_ssl_conf_bindings()` fechava a lista `printf` no item `80-horizon`
sem `\` de continuação de linha (era o último item da lista original). Ao inserir o item
`90-farmaura` depois dele sem adicionar essa barra, o shell interpretava a nova linha como um comando
solto (`"90-farmaura:dev.drogariafarmaura.com.br": not found`) em vez de mais um argumento do mesmo
`printf` — `disable_if_missing` nunca era chamada para o Farmaura, e o `nginx -t` falhava porque o
vhost carregava um certificado que ainda não existia. Descoberto rodando a validação isolada (container
descartável com `nginx -t`, nunca a instância real) **antes** de recriar o `gateway_nginx` de verdade —
exatamente o motivo de nunca pular essa etapa num gateway que também serve outros tenants ao vivo.
Corrigido adicionando o `\` faltante.

## Achado não relacionado (pré-existente, não corrigido aqui)

`certbot/issue-all.sh` roda com `set -eu` e itera todos os projetos em sequência — `dev.asdxyz.com.br`
(LumosNeon) está com DNS quebrado (NXDOMAIN) neste servidor, e a falha de `certbot` para esse domínio
aborta o script inteiro por causa do `set -e`, antes de chegar nos itens seguintes da lista (Michele,
Thamara, Adcrdf, Horizon, agora também Farmaura). Contornado emitindo o certificado do Farmaura direto
via `docker exec ... /issue.sh <domínio> <domínio>`, sem depender do lote. Não corrigido porque é dado
de outro projeto/cliente, fora do escopo desta tarefa — mas vale registrar: qualquer novo projeto
adicionado a este gateway específico vai precisar do mesmo contorno manual até o DNS do LumosNeon ser
corrigido ou o script ganhar tratamento de erro por item.

## Reset completo do ambiente (`/opt/reset_v2.sh`)

O servidor `lumos-dev` tem um script de reset compartilhado (`/opt/reset_v2.sh`, fora deste
repositório git — infraestrutura própria do host) que derruba/sobe todas as stacks nele hospedadas
de uma vez. Farmaura foi incluído nele em 2026-08-05 — ver
[[../00_Decisoes/2026-08-05-populate-demo-content-via-api-e-reset-v2-com-farmaura|ADR]] para o
detalhe técnico (Farmaura usa 3 arquivos compose, diferente do modelo de arquivo único das outras
stacks, exigiu um caso especial em `compose_file_for_dir()`). Como este host roda em modo
destrutivo (`DESTRUCTIVE_RESET=1`, automático por IP), rodar esse script apaga **o Postgres do
Farmaura também** — aceitável aqui (dado de demo, não produção), banco reconstruído do zero
(schema + RLS + seed) no próximo `up`. Backup do script original antes da edição em
`/opt/reset_v2.sh.bak-<timestamp>`.

**Importante**: `reset_v2.sh` reseta *todas* as stacks do host, não só o Farmaura — michele, thamara,
lumosneon, lumosmed-dev, lumos-api e adcrdf também perdem dado nesse processo. Rodar só quando
isso for realmente a intenção.

## Popular conteúdo de demo

Depois de um reset (ou de qualquer `up` com banco vazio), banner/marcas em destaque/ofertas do dia
não vêm preenchidos pelo seed determinístico — usar
[[../07_POPs_Processos/popular-conteudo-demo|popular-conteudo-demo]]
(`farmaura-api/scripts/populate_demo_content.py`) para reconfigurá-los.

## Dependências

- [[Lumos_Gateway]] — mesma infraestrutura de gateway, aqui descrita do lado de produção; a integração
  do Farmaura neste servidor (`lumos-dev`) segue a mesma receita.
- [[Docker_Compose]] — `docker-compose.staging.yml`, overlay commitado usado por este ambiente.
- [[PostgreSQL_RLS]] — schema/RLS aplicados do zero pelo `bootstrap_database.py` neste banco novo.

## Atualizações

- 2026-08-05: Farmaura incluído no `/opt/reset_v2.sh` compartilhado do host (down/up/validação de
  rede, no mesmo fluxo das outras 8 stacks) e criado `scripts/populate_demo_content.py` para
  repopular banner/marcas/ofertas do dia depois de qualquer reset — ver
  [[../00_Decisoes/2026-08-05-populate-demo-content-via-api-e-reset-v2-com-farmaura|ADR]].
- 2026-08-04: nota criada, junto com a publicação inicial deste ambiente.
