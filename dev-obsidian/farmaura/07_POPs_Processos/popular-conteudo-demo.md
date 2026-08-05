# Popular conteúdo de demo (banner, marcas em destaque, ofertas do dia)

## Quando usar

Sempre que precisar preparar um ambiente (local, `lumos-dev`, ou uma futura demo em produção)
com banner promocional, marcas em destaque e ofertas do dia já configurados — ex: antes de uma
apresentação a investidor/cliente. Reaproveita `farmaura-api/scripts/populate_demo_content.py`,
que fala só HTTP com a API já rodando (não mexe em banco direto) — ver
[[../00_Decisoes/2026-08-05-populate-demo-content-via-api-e-reset-v2-com-farmaura|ADR de design]].

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
   (padrão 6).
4. Conferir o resultado: `GET /portal/marketplace/public-bootstrap` (sem autenticação) deve
   trazer `home_banner.mode="image"`, `home_brands.circles` com os nomes fictícios, e
   `deal_of_the_day.mode="manual"` com os `product_refs` escolhidos.

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

- 2026-08-05: nota criada.
