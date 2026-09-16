# Popular conteúdo de demo (banner, marcas em destaque, ofertas do dia)

## Quando usar

Sempre que precisar preparar um ambiente (local, `lumos-dev`, ou uma futura demo em produção)
com banner promocional, marcas em destaque e ofertas do dia já configurados — ex: antes de uma
apresentação a investidor/cliente. Reaproveita `farmaura-api/scripts/populate_demo_content.py`,
que fala só HTTP com a API já rodando (não mexe em banco direto) — ver
[[../00_Decisoes/2026-08-05-populate-demo-content-via-api-e-reset-v2-com-farmaura|ADR de design]].

Desde 2026-08-29, o seed determinístico local (`scripts/seed.py`) já grava as três coisas
sozinho — banner, marcas em destaque (mesmos 6 logos placeholder) e ofertas do dia (ver
[[resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] e
[[../00_Decisoes/2026-08-29-seed-banner-home-hero-e-limite-do-sanitizador|ADR do banner de
seed]]) — rodar este script continua valendo a pena quando o objetivo é especificamente a
variante promocional de demo/investidor (copy diferente, "Até 30% OFF...") ou quando não há
acesso direto ao banco (`lumos-dev`).

## Passos

1. Ter a API alvo já no ar (local: `docker compose up`; `lumos-dev`: stack já publicada — ver
   [[publicar-staging-lumos-dev|publicar-staging-lumos-dev]]) e um usuário admin válido nela.
2. Rodar, de dentro de `farmaura-api/`:
   ```
   uv run scripts/populate_demo_content.py \
     --base-url http://localhost:8080/api/v1 \
     --email adriana.lima@farmaura.com.br \
     --password 'Farmaura@123'
   ```
   Local (seed determinístico) já usa esses valores como default — rodar sem argumento nenhum
   funciona. Para outro ambiente, sobrescrever `--base-url`/`--email`/`--password` (ou as
   variáveis `POPULATE_BASE_URL`/`POPULATE_ADMIN_EMAIL`/`POPULATE_ADMIN_PASSWORD`) com as
   credenciais reais daquele ambiente.
3. Flags `--skip-banner`/`--skip-brands`/`--skip-deal-of-the-day` pulam qualquer uma das três
   partes; `--deal-limit N` muda quantos produtos mais vendidos entram em "ofertas do dia"
   (padrão 6). `--deal-mode scheduled` (padrão continua `manual`) troca a curadoria de "ofertas
   do dia" para o modo agendado (ver [[../00_Decisoes/2026-08-15-ofertas-do-dia-modo-agendado-e-offers-reaproveitada|ADR do modo agendado]]),
   criando uma entrada de calendário por dia a partir de hoje via `--scheduled-days N` (padrão
   7) — útil para testar manualmente o calendário/countdown sem esperar a virada real dos dias,
   já que a entrada de hoje fica ativa imediatamente e as seguintes já aparecem na UI do console.
4. Conferir o resultado: `GET /portal/marketplace/public-bootstrap` (sem autenticação) deve
   trazer `home_banner.mode="image"`, `home_brands.circles` com os nomes fictícios, e
   `deal_of_the_day.mode="manual"` (ou `"scheduled"`, com `schedule_entries` preenchido, se usado
   `--deal-mode scheduled`) com os `product_refs` escolhidos.

## O que este script deliberadamente NÃO faz

Não cria nem altera nenhum usuário/credencial — só conteúdo de merchandising (banner, marcas,
ofertas). Uma conta demo específica continua sendo uma ação manual, feita direto via
`POST /team/members` quando necessário num ambiente pontual, nunca dentro de um script pensado
para eventualmente rodar contra produção. Ver a decisão completa linkada acima.

## Responsável

Qualquer desenvolvedor preparando um ambiente para demonstração. Antes de rodar contra qualquer
ambiente que não seja local, confirmar que o conteúdo (textos, marcas fictícias) é apropriado
para aquele ambiente — em produção de verdade, revisar o texto do banner antes, não usar o texto
de demo/investidor como está.

## Riscos se pulado

Nenhum — este processo é aditivo e opcional (só reconfigura settings de merchandising, sempre
sobrescrevíveis de novo pelo console interno ou por uma nova rodada do script).

## Ver também

- [[../00_Decisoes/2026-08-05-populate-demo-content-via-api-e-reset-v2-com-farmaura|ADR de design]] — por que HTTP e não acesso direto a banco, por que nunca cria usuário.
- [[../05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev|Ambiente_Staging_Lumos_Dev]] — ambiente onde isso já foi usado pela primeira vez.
- [[resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] — POP equivalente para o seed determinístico de base (produtos/clientes/pedidos), que este processo complementa.

## Atualizações

- 2026-08-29 (2): `scripts/seed.py` passou a gravar "Marcas em destaque" também — as três seções
  agora nascem prontas do seed de base; este script deixou de ser obrigatório pra qualquer uma
  delas, só continua útil pra variante promocional/investidor ou ambiente sem banco direto.
- 2026-08-29: `scripts/seed.py` passou a gravar um banner/ofertas do dia básicos sozinho — este
  script deixou de ser obrigatório pra a home ter hero, continua sendo o caminho pra marcas em
  destaque e pra variante promocional/investidor do banner. Ver ADR linkado acima.
- 2026-08-27: rodado pela primeira vez contra o ambiente local (`docker compose`) nesta máquina — até então só tinha sido usado em `lumos-dev`. Confirmado via `GET /portal/marketplace/public-bootstrap`: banner real, 6 marcas fictícias, ofertas do dia agendadas (7 dias). Sem esse passo, a home local ficava sem hero/banner e sem a faixa "Marcas em destaque" — real gap encontrado numa verificação de fidelidade visual/funcional completa do marketplace.
- 2026-08-22: adicionadas as flags `--deal-mode scheduled`/`--scheduled-days N`, para seedar o
  modo agendado (calendário) de "ofertas do dia" com uma entrada por dia e testar manualmente
  sem esperar a virada de data real.
- 2026-08-05: nota criada.
