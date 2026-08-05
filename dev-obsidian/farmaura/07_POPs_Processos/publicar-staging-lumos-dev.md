# Publicar/atualizar o ambiente de staging em lumos-dev

## Quando usar

Sempre que quiser testar o estado atual do trabalho (inclusive código ainda não commitado em `main`)
num ambiente real, acessível por link (`https://dev.drogariafarmaura.com.br`), com dados de seed em
vez de dado de produção — sem tocar em `lumos-prd`. Ver [[../05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev|Ambiente_Staging_Lumos_Dev]] para o contrato completo desse ambiente.

## Passos (primeira publicação)

1. Criar/atualizar a branch `staging/lumos-dev` a partir do estado local (`git checkout -b
   staging/lumos-dev`, `git add` só os arquivos de código relevantes — nunca scratch/pessoal como
   `.claude/`, `.vite/`, `exemplo/` — `git commit`, `git push -u origin staging/lumos-dev`), depois
   `git checkout main` de volta.
2. No servidor: `git clone --branch staging/lumos-dev --single-branch
   git@github.com:iamlucas1/farmaura.git /opt/farmaura` (lumos-dev já autentica como `iamlucas1` no
   GitHub — testar com `git ls-remote` se algum dia parar de funcionar).
3. Criar `/opt/farmaura/farmaura-api/.env` a partir de `.env.example`, com `APP_ENV=staging` (nunca
   `production` — é o que decide entre seed fictício e admin único real, ver
   `scripts/bootstrap_database.py`), segredo de JWT novo (`openssl rand -base64 48`, gerado direto no
   servidor), e `APP_AI_ENABLED`/`APP_SMTP_ENABLED`/`APP_ASAAS_ENABLED=false` a menos que decidido o
   contrário.
4. Subir a stack:
   ```
   cd /opt/farmaura/farmaura-api
   docker compose -f docker-compose.yml -f docker-compose.gateway.yml -f docker-compose.staging.yml up -d --build
   ```
5. Se o Farmaura ainda não existir no `lumos-gateway` deste servidor (`grep -i farmaura
   /opt/lumos-gateway/.env` vazio): replicar a integração já validada em `lumos-prd` — ver a seção
   "Contrato" de [[../05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev|Ambiente_Staging_Lumos_Dev]] para
   a lista exata de arquivos (`.env`, `scripts/domain_context.sh`, `entrypoint.sh`,
   `10-http-redirect.conf.template`, novo `90-farmaura.conf.template` + bind mount + `FARMAURA_UPSTREAM`
   no `docker-compose.yml` do gateway). **Sempre fazer backup dos arquivos do gateway antes de editar**
   (`cp -a` para um diretório datado) — esse gateway também serve outros clientes ao vivo.
6. **Validar antes de reiniciar o gateway de verdade**: rodar a mesma renderização de templates num
   container descartável terminando em `nginx -t`, nunca só confiar e recriar direto:
   ```
   cp entrypoint.sh /tmp/entrypoint.test.sh
   sed -i 's/^exec nginx -g "daemon off;"$/nginx -t/' /tmp/entrypoint.test.sh
   docker compose run --rm -v /tmp/entrypoint.test.sh:/entrypoint.sh:ro --entrypoint /entrypoint.sh gateway_nginx
   ```
   Só seguir se a saída terminar em `syntax is ok` / `test is successful`.
7. Recriar só o nginx do gateway: `docker compose up -d --no-deps gateway_nginx` (dentro de
   `/opt/lumos-gateway`).
8. Emitir o certificado direto para o domínio novo, sem depender do lote (`issue-all.sh` roda com
   `set -eu` e aborta inteiro se qualquer domínio da lista falhar — ver achado documentado em
   [[../05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev|Ambiente_Staging_Lumos_Dev]]):
   ```
   docker exec lumos_gateway_certbot /issue.sh dev.drogariafarmaura.com.br dev.drogariafarmaura.com.br
   ```
   `enable_ssl_when_ready.sh`, já rodando em background dentro do `gateway_nginx`, detecta o certificado
   novo e habilita/recarrega automaticamente — não precisa de passo manual extra depois disso.
9. Verificar: `curl -sk https://127.0.0.1/api/v1/health -H 'Host: dev.drogariafarmaura.com.br'` (de
   dentro do servidor — testar por fora do servidor pode bater em bloqueio de GeoIP do próprio gateway,
   que não tem relação com o deploy), login real com um usuário do seed, e confirmar que os outros
   tenants do mesmo gateway continuam respondendo.

## Passos (atualizações seguintes, gateway já integrado)

Só os passos 1–4 e 9 — a integração do gateway (passos 5–8) é feita uma única vez por servidor.
Para atualizar o código: `git -C /opt/farmaura fetch && git -C /opt/farmaura reset --hard
origin/staging/lumos-dev`, depois repetir o `up -d --build` do passo 4.

## Responsável

Quem tem acesso a `lumos-dev` — a IA pode executar todos os passos, mas confirma com o usuário antes
de qualquer mudança no gateway compartilhado (afeta outros tenants) e antes de recriar/reiniciar
containers que servem outros clientes.

## Riscos se pulado

- Pular a validação isolada (`nginx -t` num container descartável) antes de recriar o `gateway_nginx`
  real pode derrubar o gateway inteiro — e com ele michele, thamara, lumosneon, lumosanalytics,
  lumosmed-dev e lumos-api, não só o Farmaura.
- Usar `APP_ENV=production` neste ambiente por engano faz o bootstrap criar só 1 admin real em vez do
  seed fictício completo — parece "funcionar" (a stack sobe normalmente) mas fica sem os dados de
  teste esperados.
- Rodar `issue-all.sh` sem saber do bug do LumosNeon pode fazer parecer que a emissão "não fez nada"
  para o Farmaura, quando na verdade o script abortou antes de chegar nele.

## Ver também

- [[../05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev|Ambiente_Staging_Lumos_Dev]] — contrato completo
  do ambiente.
- [[../05_Integracoes_Infra/Lumos_Gateway|Lumos_Gateway]] — mesma integração de gateway, do lado de
  produção.
- [[resetar-e-re-semear-dados-locais]] — mesma lógica de seed (`bootstrap_database.py`), aqui aplicada
  num servidor remoto em vez do Docker local.

## Atualizações

- 2026-08-04: nota criada, junto com a primeira publicação deste ambiente.
