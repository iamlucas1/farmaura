---
cssclasses: ia-nota
---

# CSP ausente em todos os 10 templates de vhost (HSTS está presente e correto, CSP não)

**Tipo:** Vulnerabilidade (ausência de security header / defesa contra XSS)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** `lumos-gateway`
**Categoria:** Security headers
**Data de identificação:** 2026-08-19

## Descrição

Nenhum dos 10 templates de vhost (`15-https-default`, `20-lumosanalytics-site`, `21-lumos-api`, `30-lumosmed`, `40-lumosneon`, `50-michele`, `60-thamara`, `70-adcrdf`, `80-horizon`, `90-farmaura`) declara `Content-Security-Policy`. Todos declaram corretamente `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection`, `X-Permitted-Cross-Domain-Policies` **e `Strict-Transport-Security`** (`max-age=31536000; includeSubDomains; preload`, confirmado presente e consistente em todos — uma rodada anterior desta auditoria havia concluído erroneamente que HSTS também estava ausente, corrigido em `dev-obsidian/farmaura/04_Seguranca_Riscos/hardening-baixo-docker-e-gateway-diversos.md`, item 5).

Este achado estende, para todo o gateway, o que já havia sido documentado só para o vhost do Farmaura (ver [[../../farmaura/04_Seguranca_Riscos/csp-ausente-nas-paginas-html-de-producao|csp-ausente-nas-paginas-html-de-producao]]) — não é peculiaridade de nenhum produto específico, é a configuração base do gateway.

## Evidência

`grep -rn "Content-Security-Policy" nginx/` sem resultado em nenhum arquivo. `grep -rn "Strict-Transport-Security" nginx/` confirma presença em todos os 10 templates HTTPS.

## Cenário de risco

Se qualquer vetor de XSS existir em qualquer um dos produtos atrás deste gateway, não há CSP na camada de borda para conter `script-src`/`connect-src` e impedir exfiltração de token/sessão — última linha de defesa que faltaria mesmo que o vetor de XSS específico não exista hoje em nenhum produto conhecido.

## Impacto

Clickjacking já mitigado (`X-Frame-Options`). O gap é especificamente ausência de contenção de XSS via CSP, em todos os produtos, não só um.

## Pré-condições

Existência de um vetor de XSS em qualquer produto atrás do gateway — não confirmado nesta auditoria para nenhum produto além do já avaliado no Farmaura (onde o único ponto de risco real, sanitização de banner HTML, já está corrigido).

## Escopo afetado

Todos os 10 templates em `nginx/conf.d/*.conf.template`.

## Causa raiz

CSP nunca foi incluída no conjunto de headers de segurança padrão aplicado a todos os vhosts — diferente dos outros 6 headers e do HSTS, que são consistentes desde a criação de cada template.

## Correção sugerida para análise futura

Adicionar `Content-Security-Policy` de forma centralizada, se a estrutura do Nginx permitir reuso entre vhosts (`include` de um snippet comum), ou por vhost caso cada produto precise de uma política diferente (origens de CDN/analytics diferem por produto). Começar em modo `Content-Security-Policy-Report-Only` antes de aplicar em modo bloqueante, para não quebrar recursos legítimos de cada produto sem aviso.

## Dependências da correção

Nenhuma migration. Exige levantar as origens externas legítimas de cada um dos 8 produtos (fontes, analytics, CDNs) antes de definir a política — trabalho por produto, não só um patch único.

## Riscos de regressão

Médio — uma CSP mal calibrada pode quebrar recursos legítimos de qualquer um dos produtos (fontes, scripts de terceiro, mapas). Testar em modo report-only por produto antes de bloquear.

## Como validar futuramente que a correção funcionou

Inspecionar headers de resposta de cada domínio em produção/staging e confirmar presença de CSP sem quebrar nenhum recurso visual/funcional, produto por produto.

## Referências

- [[../../farmaura/04_Seguranca_Riscos/csp-ausente-nas-paginas-html-de-producao|csp-ausente-nas-paginas-html-de-producao]] — achado original, específico do Farmaura, agora estendido.
- [[../../farmaura/04_Seguranca_Riscos/hardening-baixo-docker-e-gateway-diversos|hardening-baixo-docker-e-gateway-diversos]] — onde o falso positivo de HSTS foi corrigido.

## Atualizações

- 2026-08-19: achado registrado, estendendo o achado já existente do Farmaura para todo o gateway; confirmado que HSTS (diferente de CSP) já está corretamente presente em todos os vhosts.