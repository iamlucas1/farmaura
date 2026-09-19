---
cssclasses: ia-nota
---

# Teste de intrusão 2026-09-18 — nginx do Farmaura (`docker/web/nginx.conf`)

**Tipo:** Vulnerabilidade/hardening (testado ao vivo contra o container `farmaura` local, `127.0.0.1:3000`)
**Status:** CONFIRMADO (achados 1-2) / CONTROLE OK, sem achado (itens 3-5, documentados como cobertura testada)
**Severidade:** BAIXO (item 1) / MÉDIO, por composição com achado já registrado (item 2)
**Sistema afetado:** `farmaura` (container web/nginx, `docker/web/Dockerfile` + `docker/web/nginx.conf`)
**Categoria:** Hardening de nginx / segmentação de rede
**Data do teste:** 2026-09-18

Teste seguiu `dev-obsidian/_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md` — testado contra a porta local do próprio projeto (`127.0.0.1:3000`), sem tocar em `lumos-gateway` além de um punhado de checagens leves e não-agressivas (ver nota separada em [[../../lumos-gateway/04_Seguranca_Riscos/teste-roteamento-2026-09-18|lumos-gateway/teste-roteamento-2026-09-18]]).

## 1. Versão do nginx exposta no header `Server`

**Localização:** `docker/web/nginx.conf` — nenhuma diretiva `server_tokens off;`.
**Evidência:** `curl -sD - http://127.0.0.1:3000/healthz` → `Server: nginx/1.29.1`.
**Cenário de risco:** facilita reconhecimento de atacante (versão exata já usada para cruzar CVEs conhecidas em [[cve-imagens-base-docker-farmaura|cve-imagens-base-docker-farmaura]]) — baixo risco isolado, mas sem motivo para manter.
**Correção sugerida:** adicionar `server_tokens off;` no bloco `server` (ou `http`, se for global).

## 2. Nenhum header de segurança (CSP/X-Frame-Options/HSTS) na resposta deste nginx — compõe com o bypass de rede já registrado

**Localização:** `docker/web/nginx.conf` inteiro — só define `Cache-Control`/`Pragma`/`Expires`, nenhum header de segurança.
**Por design, não é uma falha isolada:** os headers de segurança (CSP, HSTS etc.) são adicionados pelo `lumos-gateway` para tráfego público real — este nginx local nunca precisou deles porque, em teoria, nunca é alcançado diretamente.
**Por que agora é relevante:** o teste de intrusão anterior ([[../../docker/04_Seguranca_Riscos/teste-intrusao-2026-09-18-bypass-rede-entre-containers|docker/teste-intrusao-2026-09-18-bypass-rede-entre-containers]]) confirmou que **qualquer container de qualquer outro projeto no mesmo host alcança o container `farmaura` direto pelo IP** (`HTTP 200` em `/healthz` via IP interno, fora de qualquer rede compartilhada) — o mesmo bypass já confirmado contra `farmaura-api`. Um cliente que chegue por esse caminho recebe a página sem nenhuma das proteções que o gateway normalmente adiciona.
**Correção sugerida:** mesma da nota de rede linkada acima (não publicar a porta em ambientes multi-tenant, ou aplicar os headers também neste nginx como defesa em profundidade, já que é barato).

## 3. Path traversal — testado, sem achado

`GET /../../../etc/passwd`, `%2e%2e` codificado, e `/api/v1/../../etc/passwd` — nenhum retornou o arquivo real. `%2e%2e` explícito (não normalizado pelo cliente) → `HTTP 400` (nginx rejeita). Os demais caíram no fallback SPA (`try_files $uri /farmaura/marketplace.html`) — confirmado comparando bytes da resposta (`/.env`, `/nginx.conf` e uma rota aleatória inexistente retornam exatamente os mesmos 2351 bytes do shell HTML, não o arquivo real).

## 4. Exposição de arquivo oculto/controle (`.env`, `.git/config`, `nginx.conf`) — testado, sem achado

`HTTP 200` para todos, mas confirmado (item 3) que é sempre o mesmo shell HTML de fallback do SPA, nunca o arquivo real — a imagem nem contém esses arquivos (`docker/web/Dockerfile` só copia `dist/` compilado, ver [[Docker_Compose]]).

## 5. Métodos HTTP perigosos — testado, sem achado

`TRACE` e `PUT` → `HTTP 405` nos dois casos. Comportamento padrão correto do nginx (só aceita os métodos que a config declara).

## Observação — separação Marketplace/Internal é só por caminho obscuro, sem enforcement no nginx

`location = /miaura` (console interno, ver decisão já registrada em [[../00_Decisoes/2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes]]) serve o shell HTML sem qualquer checagem de autenticação neste nginx — a obscuridade do caminho não é controle de acesso. Não é um achado novo (decisão já documentada, e o enforcement real é esperado na API/JWT, fora do escopo deste teste de nginx) — registrado aqui só para deixar explícito que, na camada nginx, `/miaura` é tão acessível quanto `/`.

## Referências

- [[../../docker/04_Seguranca_Riscos/teste-intrusao-2026-09-18-bypass-rede-entre-containers|docker/teste-intrusao-2026-09-18-bypass-rede-entre-containers]] — o bypass de rede que torna o achado 2 relevante.
- [[cve-imagens-base-docker-farmaura]] — CVEs já mapeados para `nginx:1.29.1-alpine`.
- [[../../lumos-gateway/04_Seguranca_Riscos/teste-roteamento-2026-09-18|lumos-gateway/teste-roteamento-2026-09-18]] — checagens leves feitas no gateway real (headers de segurança que complementam este nginx em produção).

## Atualizações

- 2026-09-18: nota criada a partir de teste de intrusão ativo pedido explicitamente pelo usuário.
