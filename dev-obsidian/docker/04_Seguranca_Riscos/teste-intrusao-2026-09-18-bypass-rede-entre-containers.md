---
cssclasses: ia-nota
---

# Teste de intrusão 2026-09-18 — bypass de rede: qualquer container do host alcança `farmaura-api` direto, ignorando o nginx

**Tipo:** Vulnerabilidade (confirmada por teste ativo, não só leitura de config)
**Status:** CONFIRMADO — testado ao vivo, reproduzido de duas redes Docker diferentes
**Severidade:** MÉDIO-ALTO
**Sistema afetado:** `farmaura-api` (e, por extensão de padrão, qualquer serviço do ecossistema que publique porta em `127.0.0.1` para conveniência de dev)
**Categoria:** Segmentação de rede / isolamento entre containers e entre projetos
**Data do teste:** 2026-09-18

## Descrição

`farmaura-api/docker-compose.yml` publica a API em `127.0.0.1:8080:8080` só para conveniência de debug local (documentado no `README.md` do projeto). A suposição implícita era que "127.0.0.1" limita o alcance a quem tem acesso à própria máquina. **Isso é falso para outros containers do mesmo host** — a restrição de `127.0.0.1` só vale para tráfego que entra pelas interfaces de rede do host (outra máquina na LAN, por exemplo); ela não impede que **qualquer outro container Docker no mesmo host**, em **qualquer rede Docker**, alcance o container pelo IP interno dele na rede bridge à qual pertence.

Na prática: um container comprometido de **qualquer outro projeto** rodando no mesmo host (`lumosmed`, `lumos-api`, `lumos-gateway`, qualquer outro tenant do servidor de produção) — ou até um container qualquer que um atacante consiga rodar no host por qualquer outro meio — alcança `farmaura-api` inteiro pelo IP do container, **sem passar pelo nginx** (`docker/web/nginx.conf`) que deveria ser o único caminho e que só faz proxy de `/api/v1/`+`/static/`. Isso inclui rotas que o roteamento do nginx nunca expõe: `/docs`, `/redoc`, `/openapi.json` — o schema completo da API fica público para qualquer container do host.

Este achado **confirma e eleva a severidade** de um risco já registrado como teórico em [[../../farmaura/04_Seguranca_Riscos/hardening-baixo-docker-e-gateway-diversos|hardening-baixo-docker-e-gateway-diversos]] item 4 (`/docs`/`/redoc`/`/openapi.json` não desabilitados no FastAPI) — aquela nota dizia "a proteção existe, mas é incidental... se o backend for exposto por outro caminho, o schema ficaria público" como cenário hipotético. **Não é hipotético: é o comportamento padrão do Docker hoje, sem precisar de nenhuma reconfiguração adicional.**

## Evidência (reproduzida passo a passo)

Ambiente: stack `farmaura-api` de dev subida localmente (`docker compose up --build -d`), sem overlay de gateway.

1. IP interno de `farmaura_api` na rede `farmaura_private`: `172.18.0.5`.
2. Container "atacante" isolado, `curlimages/curl`, rodado **na rede `bridge` padrão** (nada em comum com `farmaura_private`):
   ```
   docker run --rm --network bridge curlimages/curl:latest \
     curl -s -o /dev/null -w "HTTP %{http_code}\n" http://172.18.0.5:8080/openapi.json
   → HTTP 200, corpo com o schema OpenAPI completo
   ```
   Repetido para `/docs` (200) e `/redoc` (200).
3. Reproduzido também a partir de uma rede Docker **dedicada, recém-criada** (`docker network create attacker_test_network`), simulando o container de um projeto totalmente diferente — mesmo resultado: `HTTP 200` em `/openapi.json`.
4. **Contraste controlado**: o mesmo container atacante tentou `farmaura_postgres:5432` e `farmaura_valkey:6379` (que **não** têm `ports:` publicado, só `expose:`) — as duas tentativas deram *connection timed out*. Confirma que o vetor é especificamente a publicação de porta (`ports:` no compose), não uma falha geral de isolamento de rede.

## Causa raiz

Mecanismo de rede do Docker: ao publicar uma porta de container (`ports: "127.0.0.1:8080:8080"`), o Docker adiciona uma regra de `ACCEPT` na chain `DOCKER` do iptables para aquele IP:porta do container, que **não é restrita à interface de origem** — ela aceita tráfego encaminhado de qualquer rede bridge do host, não só do `127.0.0.1` do host. A restrição de `127.0.0.1` no mapeamento só controla o DNAT feito a partir das interfaces do próprio host; não existe (por padrão) isolamento adicional entre redes bridge diferentes no mesmo host Docker.

## Teste do remédio óbvio (`internal: true`) — e por que ele não serve sozinho aqui

Testado: criar uma rede com `--internal` (que adiciona uma regra de `DROP` para tráfego externo àquela rede) resolve o bypass — confirmado que um container em outra rede não alcança mais o alvo. **Mas** também testado e confirmado: **o Docker recusa silenciosamente publicar a porta no host quando a rede é `internal: true`** (`docker port` não mostra nenhum mapeamento, `127.0.0.1:<porta>` fica inacessível mesmo a partir do próprio host). Ou seja, marcar `farmaura_private` como `internal: true` fecharia o bypass, mas também quebraria o acesso direto `127.0.0.1:8080` que o time usa deliberadamente para debug local (documentado no `README.md` do `farmaura-api`) — as duas coisas são mutuamente exclusivas no modelo de rede padrão do Docker.

## Impacto

- Confidencialidade: exposição do schema completo da API (`/openapi.json`) e das UIs de documentação (`/docs`, `/redoc`) a qualquer container do host — facilita reconhecimento para um atacante que já tenha comprometido *qualquer* container em *qualquer* projeto do mesmo servidor.
- Não confirmado (fora do escopo deste teste) se rotas de negócio protegidas por autenticação ficam de fato protegidas mesmo por esse caminho direto — a autenticação da aplicação (JWT/sessão) provavelmente continua sendo exigida pelo FastAPI independente da rota de acesso, então isso não é um bypass de autenticação por si só, é um bypass do **perímetro de rede** que a arquitetura assume como camada de defesa (documentado em `app/main.py`/middlewares como suposição explícita — ver [[../../farmaura/05_Integracoes_Infra/Lumos_Gateway|farmaura/Lumos_Gateway]]).
- Relevante principalmente no servidor de produção compartilhado (`lumos-prd`), onde múltiplos projetos/tenants realmente coexistem no mesmo host Docker — em dev local isso exige que o próprio desenvolvedor já tenha algo malicioso rodando na própria máquina, risco bem menor.

## Correção sugerida para análise futura

Sem solução trivial de "ligar uma flag" — exige decisão de trade-off:

1. **Remover `ports: "127.0.0.1:8080:8080"` do compose de produção/staging**, mantendo só em um overlay de desenvolvimento local (`docker-compose.dev.yml` ou similar) — quem precisar debugar localmente usa `docker compose exec farmaura-api ...` ou reativa o mapeamento manualmente. Reduz a superfície só nos ambientes onde múltiplos tenants realmente coexistem.
2. Desabilitar `/docs`/`/redoc`/`/openapi.json` explicitamente em produção no FastAPI (`docs_url=None` etc. quando `settings.environment == "production"`) — já sugerido na nota original, continua válido e é independente da correção de rede (defesa em profundidade: mesmo que a rede vaze, a rota nem existe).
3. Considerar migrar a rede de produção para algo com política de rede real (Docker Swarm com overlay + `encrypted`, ou um host com regras de `iptables`/`nftables` explícitas restringindo tráfego inter-bridge por padrão) se o modelo "vários projetos no mesmo host Docker" for permanente — fora do escopo de uma mudança pontual de compose.

## Como validar futuramente que a correção funcionou

Repetir o teste 2 do bloco "Evidência" (`docker run --rm --network bridge curlimages/curl:latest curl ... http://<ip-do-container>:8080/openapi.json`) após aplicar a correção — deve retornar timeout/connection refused, não `HTTP 200`.

## Referências

- [[../../farmaura/04_Seguranca_Riscos/hardening-baixo-docker-e-gateway-diversos|hardening-baixo-docker-e-gateway-diversos]] — item 4, achado original tratado como teórico, agora confirmado ativo por este teste.
- [[../../farmaura/05_Integracoes_Infra/Docker_Compose|farmaura/Docker_Compose]] — contrato do compose testado.
- [[hardening-diversos-teste-intrusao-2026-09-18|hardening-diversos-teste-intrusao-2026-09-18]] — demais achados do mesmo teste (recursos sem limite, confiança flat dentro da rede privada).

## Atualizações

- 2026-09-18: nota criada a partir de teste de intrusão ativo pedido explicitamente pelo usuário.
