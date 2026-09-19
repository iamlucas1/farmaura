---
cssclasses: ia-nota
---

# CSP forte aplicada só às respostas JSON da API — páginas HTML reais (marketplace/internal) não recebem nenhuma CSP em produção

**Tipo:** Vulnerabilidade (ausência de security header / defesa contra XSS)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** `farmaura` (servido via `lumos-gateway`) + `farmaura-api` (middleware, cobre só a API)
**Categoria:** Security headers / defesa em profundidade contra XSS
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

`SecurityHeadersMiddleware` do FastAPI define uma CSP restritiva (`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`) — mas essa política só se aplica a respostas que passam pelo próprio processo `farmaura-api` (`/api/v1/*`, `/static/*`). As páginas HTML reais (`marketplace.html`, `internal.html`) são servidas como arquivos estáticos pelo nginx do container `farmaura`/`lumos-gateway`, que não passam pelo middleware do backend. O template de nginx do `lumos-gateway` que serve produção define `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` — mas **nenhum `Content-Security-Policy`**.

## Evidência

`grep -in "content-security-policy" lumos-gateway/nginx/nginx.conf.template` sem resultado. Comentário no próprio `app/api/middleware/security_headers.py`: "CSP can be tightened further once frontend origins are finalized" — a CSP restritiva foi pensada só para a API, nunca propagada para o HTML real.

## Cenário de risco

Autenticação no marketplace/console é 100% via Bearer token (`Authorization` header), armazenado em `localStorage`/`sessionStorage` (não em cookie `HttpOnly`) — se qualquer vetor de XSS existir no bundle React (refletido ou armazenado, não exaustivamente auditado nesta rodada), não há CSP na página real para conter `script-src`/`connect-src` e impedir a exfiltração do token.

## Impacto

Clickjacking já está mitigado (`X-Frame-Options: SAMEORIGIN` no gateway). O gap real é: um XSS hipotético teria caminho livre para executar script arbitrário e exfiltrar o token Bearer armazenado em `localStorage`, assumindo a sessão do usuário.

## Pré-condições

Existência de um vetor de XSS refletido/armazenado em algum lugar da SPA — não confirmado nesta auditoria (o único ponto de risco real, o banner HTML customizável do marketplace, já é sanitizado corretamente com `nh3`, ver nota de auditoria correspondente). Este achado é sobre a ausência da camada de contenção, não sobre um XSS confirmado.

## Escopo afetado

`lumos-gateway/nginx/nginx.conf.template`, `farmaura-api/app/api/middleware/security_headers.py`. **Atualização 2026-08-19**: confirmado que a ausência de CSP não é peculiaridade do Farmaura — nenhum dos 10 templates de vhost do `lumos-gateway` declara `Content-Security-Policy` (verificado por leitura direta de todos), afetando igualmente LumosMed, lumos-api, LumosAnalytics, Michele, Thamara, LumosNeon, Horizon e ADCRDF. Ver [[../../lumos-gateway/04_Seguranca_Riscos/csp-ausente-em-todos-os-vhosts|nota equivalente no projeto lumos-gateway]] para o achado tratado do ponto de vista do gateway como um todo.

## Causa raiz

A CSP restritiva foi implementada pensando apenas na API; nunca foi propagada para o nginx/gateway que serve o HTML real das duas superfícies.

## Correção sugerida para análise futura

Adicionar `Content-Security-Policy` no bloco `location /`/`location /farmaura/` do gateway (ou via `<meta http-equiv>` no próprio HTML) com algo como `default-src 'self'; script-src 'self'; style-src 'self' fonts.googleapis.com 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://www.googletagmanager.com; frame-ancestors 'self'` — ajustado às origens reais usadas (Google Fonts, Google Analytics, já documentado em [[../05_Integracoes_Infra/Google_Analytics|Google_Analytics]]). `Strict-Transport-Security` **já está presente** em todos os vhosts do gateway (confirmado em 2026-08-19, ver [[hardening-baixo-docker-e-gateway-diversos]] — item retratado) — não é um achado a complementar, só a CSP falta mesmo.

## Dependências da correção

Nenhuma migration. Mudança de configuração no `lumos-gateway` — repositório separado (`~/Documentos/desenvolvimento-lumos`), documentado brevemente aqui mas a edição real fica fora do escopo de escrita deste repositório (ver regra de escopo de escrita em `dev-obsidian/CLAUDE.md`).

## Riscos de regressão

Médio — uma CSP mal calibrada pode quebrar recursos legítimos (fontes, analytics, mapas Leaflet via CDN, ver [[../05_Integracoes_Infra/Mapas_Frontend|Mapas_Frontend]]). Recomendado testar em modo `Content-Security-Policy-Report-Only` primeiro antes de aplicar em modo bloqueante.

## Como validar futuramente que a correção funcionou

Inspecionar os headers de resposta de `GET /` (marketplace) e `GET /internal` (console) em produção/staging e confirmar presença de `Content-Security-Policy` sem quebrar nenhum recurso visualmente (fontes, ícones, mapas, analytics) — testar as duas superfícies (marketplace e internal) separadamente, já que podem precisar de diretivas ligeiramente diferentes.

## Referências

- [[../05_Integracoes_Infra/Google_Analytics|Google_Analytics]], [[../05_Integracoes_Infra/Mapas_Frontend|Mapas_Frontend]] — origens externas que a CSP precisa permitir.
- [[hardening-baixo-docker-e-gateway-diversos]] — inclui achado de HSTS ausente, mesmo template de gateway.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.