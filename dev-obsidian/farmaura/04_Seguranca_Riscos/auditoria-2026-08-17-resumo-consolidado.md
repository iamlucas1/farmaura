# Auditoria completa de segurança 2026-08-17 — resumo consolidado

**Tipo:** Índice / visão consolidada de auditoria (não é, em si, um achado)
**Status:** Concluída (observacional — nenhuma correção aplicada)
**Data:** 2026-08-17
**Executada via:** [[../08_Skills_Agentes_Prompts/auditoria-completa-seguranca|prompt de auditoria completa de segurança]]

## O que foi feito

Auditoria read-only e observacional de `farmaura` (frontend), `farmaura-api` (backend), infraestrutura Docker/Nginx associada, histórico Git completo (55 commits, branches `main`/`staging/lumos-dev`) e supply chain — nenhuma correção foi aplicada em nenhum sistema como parte deste trabalho, só investigação e documentação, conforme a regra do prompt que originou esta auditoria. Sete frentes de investigação rodaram em paralelo (autenticação/multi-tenancy, injeções/SSRF, contrato frontend↔backend, uploads/IA/dados sensíveis, banco de dados/concorrência, infraestrutura, supply chain/legado/testes), mais um escaneamento manual do histórico Git por segredos.

Este repositório não tem CI/CD (`.github/workflows/` ou equivalente) — ver [[gap-testes-e2e-autorizacao-cross-tenant]].

## Achado mais crítico — priorizar primeiro

**[[cashback-wallet-vazamento-cross-tenant-via-pdv]] (CRÍTICO)** — qualquer usuário interno de PDV autenticado (qualquer papel, qualquer tenant) pode ler e mutar o saldo de cashback de um cliente de **outro** tenant, desde que conheça o UUID do cliente. Verificado manualmente contra o código (não só relatado por agente). É a primeira vulnerabilidade cross-tenant ativa e confirmada encontrada no produto desde o lançamento.

## Histórico Git e segredos — resultado

**Nenhum segredo encontrado**, no HEAD atual nem no histórico completo (55 commits, ambas as branches). Escaneamento manual (sem ferramenta automatizada — `gitleaks`/`trufflehog`/`detect-secrets` não estavam disponíveis no ambiente) por: nomes de arquivo sensíveis (`.env`, `.pem`, `.key`, `credentials`, `service_account`, `id_rsa` etc. — nenhum jamais commitado); padrões de chave de provedores conhecidos (AWS `AKIA`, Google `AIza`, OpenAI `sk-`/`sk-proj-`, GitHub `ghp_`/`gho_`/`github_pat_`, Slack `xox*`, blocos PEM `BEGIN PRIVATE KEY`/`BEGIN CERTIFICATE`) — nenhuma ocorrência; connection strings com credencial embutida (`postgres://user:pass@...` etc.) — nenhuma; padrões `.env`-style (`KEY=valor`) em diffs adicionados — nenhum; tokens JWT hardcoded (`eyJ...`) — nenhum; headers `Authorization: Bearer` hardcoded — nenhum. `farmaura-api/.env.example` (o único `.env*` versionado) só contém placeholders (`change-me`, campos vazios).

Limitação registrada: o escaneamento foi por padrão regex manual, não por ferramenta dedicada — reduz mas não elimina falsos negativos para formatos de segredo não previstos nos padrões testados.

## Todos os achados, por severidade

### CRÍTICO
- [[cashback-wallet-vazamento-cross-tenant-via-pdv]] — leitura/escrita cross-tenant de saldo financeiro via PDV.

### ALTO
- [[webhook-asaas-ip-allowlist-valida-ip-interno-errado]] — segunda camada do webhook de pagamento está quebrada (dormant hoje, ativa-se ao configurar a allowlist).
- [[importacao-xlsx-docx-bloqueia-worker-sem-limite-de-descompressao]] — DoS de processo inteiro via planilha/documento malicioso.
- [[rejeicao-prescricao-duplicavel-credita-estoque-em-dobro]] — dupla execução credita estoque duas vezes.
- [[pdv-complete-sale-sem-guarda-estado]] — dupla finalização de venda duplica cashback/cupom/fiscal.
- [[cupom-pdv-bypass-limite-uso-fluxo-duas-fases]] — limite de uso de cupom pode ser ultrapassado de forma determinística.
- [[bootstrap-vaza-dados-financeiros-para-cliente-e-caixa]] — **(2026-08-19)** bootstrap autenticado vaza comissão/taxa/margem para clientes e financeiro/cupons/promoções para CASHIER.
- [[cve-pypdf-multiplas-vulnerabilidades-dos]] — **(2026-08-19)** `pypdf==5.1.0` tem ~35 CVEs (2 HIGH), usado ativamente para parsear PDF de fornecedor não confiável.

### MÉDIO
- [[rls-pos-commit-quatro-servicos-nao-corrigidos]] — bug de classe já conhecido (RLS limpa após commit), 4 métodos novos afetados.
- [[csp-ausente-nas-paginas-html-de-producao]] — sem CSP nas páginas reais, só na API (estendido para todo o gateway, ver `lumos-gateway`).
- [[valkey-sem-autenticacao]] — Valkey sem senha em toda a infra.
- [[review-publica-expoe-email-do-cliente]] — e-mail exposto publicamente como nome de avaliador.
- [[prompt-injection-indireta-documentos-fornecedor]] — sem sanity-check server-side pós-IA em importação de orçamento/nota fiscal.
- [[dados-saude-prescricao-sem-criptografia-de-campo]] — dado de saúde sem proteção além de RLS por tenant.
- [[endpoints-ia-sem-rate-limit-e-proxy-irrestrito]] — `/ai/execute` é proxy de LLM sem rate limit.
- [[containers-docker-rodando-como-root]] — sem `USER` não-root nos Dockerfiles.
- [[webhook-asaas-comparacao-token-nao-constant-time]] — timing attack teórico na comparação do segredo do webhook.
- [[validacao-input-arrays-e-campos-sem-limite-superior]] — arrays sem `max_length` em 3 schemas.
- [[cache-portal-nao-limpo-no-logout]] — **(2026-08-19)** `FA_PORTAL_CACHE` (PII de vendas PDV, chat, dado financeiro) não é limpo no logout.
- [[leaflet-cdn-sem-sri]] — **(2026-08-19)** Leaflet via CDN sem Subresource Integrity.
- [[cve-react-router-dom-open-redirect-xss]] — **(2026-08-19)** `react-router-dom==6.30.4` dentro da faixa afetada por CVE de open redirect/XSS.

### BAIXO / INFORMATIVO
- [[hardening-baixo-docker-e-gateway-diversos]] — hardening de imagem/gateway (multi-stage, `.dockerignore`, HEALTHCHECK, `/docs` exposto, rate limit de delivery-coverage). **Item HSTS retratado em 2026-08-19** — HSTS na verdade já está presente e correto em todos os vhosts, era falso positivo da rodada inicial.
- [[achados-baixos-diversos-auditoria-2026-08-17]] — 8 itens diversos (Content-Disposition, upload órfão, código morto, timing de código de retirada, corrida de webhook→500, mismatch frontend/backend em descarte, versão aberta do `nh3`).
- [[gap-testes-e2e-autorizacao-cross-tenant]] — sem teste de API E2E para isolamento cross-tenant, sem CI/CD.
- [[comparacoes-nao-constant-time-adicionais-e-entropia-pickup-code]] — **(2026-08-19)** hash de refresh token comparado sem `hmac.compare_digest`; entropia pequena no código de retirada.
- [[cve-imagens-base-docker-farmaura]] — **(2026-08-19)** CVEs em `nginx:1.29.1-alpine`, pacotes de sistema de `python:3.13.13-slim-bookworm`, `node:22.17.1-alpine` (build-only); `pydantic-settings` com CVE real mas não explorável no uso atual do código.

## O que foi verificado e está correto (negativo — vale registrar, não só os problemas)

- **JWT**: algoritmo fixo no servidor (sem `alg=none`), claims obrigatórios (`iss`/`aud`/`exp`/`nbf`/`iat`) e discriminador de tipo validados nos 4 tipos de token; rotação de refresh com família + detecção de reuso; sem PII/dado financeiro no payload.
- **Mass assignment**: `StrictModel` com `extra="forbid"` global elimina a classe geral de campo extra não documentado.
- **SQL Injection**: 100% ORM/query builder parametrizado; nenhum `text()` com concatenação insegura.
- **Path traversal**: nomes de arquivo sempre gerados server-side (UUID); extensão nunca inclui separador de diretório.
- **SSRF**: nenhum fetch server-side usa host derivado de input do usuário sem ser um `base_url` fixo de configuração.
- **XSS**: único `dangerouslySetInnerHTML` com conteúdo dinâmico (banner HTML do marketplace) é sanitizado corretamente com `nh3` (allowlist de tags/atributos/URL schemes).
- **CORS**: sem wildcard + credentials, origens de produção explícitas, sem vazamento de origem de dev.
- **CSRF**: não aplicável (autenticação 100% Bearer token, sem cookie de sessão).
- **Cache (Valkey)**: chaves sempre escopadas por `tenant_id`; nenhuma resposta personalizada por cliente é cacheada.
- **Locks de estoque**: `SELECT FOR UPDATE` real em todos os caminhos de decremento auditados (checkout, PDV, lotes FEFO, restock) — sem TOCTOU/overselling por essa via.
- **Foreign keys**: todas as ~120 FKs do schema têm `ondelete` explícito (`CASCADE`/`SET NULL`/`RESTRICT`) coerente com a regra de negócio.
- **Soft delete**: padrão não existe no schema — não há risco de "registro deletado ainda visível" porque o conceito não é usado.
- **Tokenização de cartão (Asaas)**: PAN/CVV nunca logados nem persistidos além do escopo da chamada.
- **Logging**: corpo de requisição/resposta nunca logado (por design), com redação adicional por nome de chave sensível para payloads estruturados explícitos.

## Limitações e escopo não coberto (registradas explicitamente, conforme exigido pelo prompt de auditoria)

Rodada de 2026-08-17, todas fechadas em 2026-08-19 (ver seção seguinte):
- ~~CVE real em dependências~~ — **fechado**: [[cve-pypdf-multiplas-vulnerabilidades-dos]], [[cve-react-router-dom-open-redirect-xss]], [[cve-imagens-base-docker-farmaura]].
- ~~Criptografia além de senha/JWT~~ — **fechado**: varredura dedicada feita, ver [[comparacoes-nao-constant-time-adicionais-e-entropia-pickup-code]] e confirmação de que o codebase não tem nenhuma biblioteca de criptografia de campo (`cryptography`/`pycryptodome`) importada em lugar nenhum.
- ~~Código duplicado com segurança divergente~~ — **fechado**: varredura sistemática feita (roles entre operações irmãs, validação create vs. update, rotas públicas vs. autenticadas, regra de negócio duplicada, rotas legacy) — nenhuma divergência de risco real encontrada além do já conhecido.
- ~~Frontend React mais profundo~~ — **fechado**: rodada dedicada encontrou o achado ALTO [[bootstrap-vaza-dados-financeiros-para-cliente-e-caixa]] e mais dois MÉDIO ([[cache-portal-nao-limpo-no-logout]], [[leaflet-cdn-sem-sri]]).
- ~~`lumos-gateway`~~ — **fechado**: auditoria completa dedicada, ver `dev-obsidian/lumos-gateway/04_Seguranca_Riscos/auditoria-2026-08-19-resumo-consolidado.md` (achado CRÍTICO próprio: chaves privadas TLS expostas no histórico).

Ainda não cobertas (permanecem como limitação real):
- **Nada foi testado dinamicamente**: 100% leitura estática de código, por desenho do prompt (read-only). O achado crítico de cashback foi verificado por leitura cuidadosa de código (não só por relato de agente), mas não por uma chamada HTTP real de ponta a ponta contra um ambiente rodando.
- **`lumosmed`/`lumos-api`**: permanecem deliberadamente fora do escopo, por pedido explícito do usuário mesmo depois da extensão ao `lumos-gateway`.
- **WebSocket/SSE** (categoria 28 do prompt): confirmado ausente no backend — chat é 100% REST. N/A, não é lacuna.
- **Host header / `TrustedHostMiddleware`** (categoria 29): não configurado, mas risco prático baixo — nenhuma URL (reset de senha, etc.) é construída a partir do `Host` da requisição; `base_url`/`marketplace_base_url` são valores fixos de configuração. Registrado como hardening ausente de baixa severidade, não como achado ativo.
- **Varredura exaustiva de CVE em pacotes de sistema operacional** das imagens Docker: só amostrada (openssl/perl na imagem Python) via inspeção manual, não uma ferramenta tipo Trivy/Grype rodando a lista completa de ~80 pacotes por imagem.

## Como usar esta documentação

Cada nota individual segue o formato: Status (CONFIRMADO/PROVÁVEL/POSSÍVEL/INFORMATIVO), Severidade, Descrição, Evidência, Cenário de risco, Impacto, Pré-condições, Causa raiz, Correção sugerida (não implementada), Dependências da correção, Riscos de regressão e Como validar. Nenhuma correção foi implementada como parte desta auditoria — a decisão de corrigir, priorizar e implementar cada item fica para uma etapa futura, explicitamente acionada pelo usuário.

## Atualizações

- 2026-08-19: rodada de fechamento de lacunas — CVE real em dependências, criptografia além de senha/JWT, validação divergente entre endpoints, frontend React mais profundo. +8 notas de achado novas; 1 achado (HSTS) retratado por ter sido falso positivo; auditoria irmã do `lumos-gateway` criada em paralelo (ver Hub daquele projeto).
- 2026-08-17: auditoria concluída, 19 notas de achado + este índice criados em `04_Seguranca_Riscos/`.
