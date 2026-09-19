---
cssclasses: ia-nota
---

# Hub Central: lumos-gateway

Chave de projeto neste cofre: `lumos-gateway` — o gateway Nginx compartilhado que serve como único ponto de entrada público (HTTP 80 → HTTPS 443) para todos os produtos do ecossistema hospedados em `lumos-prd`/`lumos-dev`: Farmaura, LumosMed, LumosAnalytics/lumos-api, Michele, Thamara, LumosNeon, Horizon, ADCRDF. Cada produto entra como upstream, nunca exposto diretamente.

## Repositório

`~/Documentos/desenvolvimento/dev/lumos-gateway` — **repositório git próprio, independente** (`git@github.com:iamlucas1/lumos-gateway.git`), apenas presente fisicamente dentro da árvore de trabalho deste repositório `dev` (listado no `.gitignore` da raiz do `dev`, mesmo padrão de `lumosmed/`/`lumos-api/`). Alterações de código neste repositório **não** são cobertas pela regra de escopo de escrita do `dev-obsidian/CLAUDE.md` (que cobre só a árvore do repositório `dev`) — qualquer mudança real aqui exige tratamento equivalente de cautela, mas fica fora do "nunca editar fora da árvore `dev`" porque tecnicamente está dentro dela. Esta pasta do cofre é, por ora, **somente para documentação de segurança** (auditoria observacional) — não documenta arquitetura/roteamento em profundidade (isso já existe de forma esparsa em `farmaura/05_Integracoes_Infra/Lumos_Gateway.md` do ponto de vista do Farmaura, e possivelmente em mais detalhe no cofre irmão `lumos-obsidian`, não verificado).

## Estrutura do produto

- **Gateway (Nginx)**: `nginx/nginx.conf.template` + `nginx/conf.d/*.conf.template`, um template por tenant/domínio (`00-upstreams`, `05-geoip`, `10-http-redirect`, `15-https-default`, `20-lumosanalytics-site`, `21-lumos-api`, `30-lumosmed`, `40-lumosneon`, `50-michele`, `60-thamara`, `70-adcrdf`, `80-horizon`, `90-farmaura`).
- **Certbot**: emissão/renovação de certificados Let's Encrypt via webroot ACME.
- **fail2ban**: `fail2ban/jail.local` + filtros customizados (`nginx-badbots`, `nginx-probes`, `nginx-limit-req`, `nginx-fake-searchbots`, `nginx-codigo`).
- **GeoIP**: bloqueio por país via `geoip/GeoLite2-Country.mmdb` (allowlist de países liberados).
- **scripts/**: `domain_context.sh`, `check_certs.sh`, `renew_and_reload.sh`, `enable_ssl_when_ready.sh`, `watch_upstreams.sh`.

## Navegação

- Decisões (ADRs): `00_Decisoes/` — vazio até o momento (nenhuma decisão de sessão registrada; a arquitetura documentada em `02_Documentacao/` foi levantada por auditoria/leitura de código, não por decisão tomada em sessão de trabalho).
- Contexto de negócio (só o usuário escreve): `01_Contexto_Usuario/`.
- Visão geral / arquitetura: [[02_Documentacao/Visao_Geral|Visão Geral]].
- Padrões, políticas e premissas não cobertas por documentação estática do próprio repositório: `03_Padroes_Politicas/` — vazio até o momento.
- Segurança, vulnerabilidades e registro de riscos: `04_Seguranca_Riscos/` — auditoria de 2026-08-19 (repositório): [[04_Seguranca_Riscos/auditoria-2026-08-19-resumo-consolidado|resumo consolidado]], achado mais urgente: [[04_Seguranca_Riscos/chaves-privadas-tls-expostas-no-historico-git|chaves privadas TLS expostas no histórico Git (CRÍTICO)]]. Auditoria de 2026-09-18 (servidores reais `lumos-prd`/`lumos-dev`, via SSH): [[04_Seguranca_Riscos/auditoria-servidores-2026-09-18-resumo-consolidado|resumo consolidado]], achados mais urgentes: [[04_Seguranca_Riscos/ssh-root-login-por-senha-exposto-nos-dois-servidores|login de root por senha exposto publicamente (CRÍTICO)]] e [[04_Seguranca_Riscos/lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev|lumos-api exposto sem TLS/gateway em lumos-dev (CRÍTICO)]].
- APIs, integrações e infra: `05_Integracoes_Infra/` — [[05_Integracoes_Infra/Certbot_TLS|Certbot/TLS]], [[05_Integracoes_Infra/GeoIP|GeoIP]], [[05_Integracoes_Infra/Fail2ban|fail2ban]], [[05_Integracoes_Infra/Docker_Compose|Docker Compose]].
- Pendências e débito técnico: `06_Pendencias/` — [[06_Pendencias/lumosmed-upstream-resolucao-estatica|lumosmed-upstream-resolucao-estatica]].
- POPs e processos: `07_POPs_Processos/` — [[07_POPs_Processos/renovar-certificado-manualmente|renovar certificado manualmente]], [[07_POPs_Processos/verificar-certificados|verificar certificados]].
- Skills/prompts específicos deste projeto: `08_Skills_Agentes_Prompts/` — vazio até o momento.

## Atualizações

- 2026-09-18 (2): auditoria de servidores aprofundada a pedido do usuário — versões reais por trás de imagens `:latest`, software nativo esquecido em `lumos-dev`, e um achado novo de perímetro público (SPF/DMARC ausentes ou sem enforcement em `drogariafarmaura.com.br`/`lumosmed.com.br`, via checagem DNS passiva). Pedido de exploração ativa contra os servidores foi recusado (contraria a política do cofre e o servidor está em produção real).
- 2026-09-18: escopo de `04_Seguranca_Riscos/` ampliado para também cobrir auditoria **do host real** dos servidores `lumos-prd`/`lumos-dev` (SSH, firewall, kernel, fail2ban nativo, segredos esquecidos em `/opt`) — não só o software `lumos-gateway` em si. Motivo: são os dois servidores que hospedam todo o ecossistema, e não existe hoje uma chave de projeto própria só para "os servidores"; ver [[04_Seguranca_Riscos/auditoria-servidores-2026-09-18-resumo-consolidado|auditoria de 2026-09-18]].
- 2026-08-19: demais categorias criadas (00, 01, 02, 03, 05, 06, 07, 08), seguindo o mesmo padrão de `farmaura`/`lumosmed` (todas as 8 categorias de uma vez, com `_Template.md` pronto), a pedido do usuário. Populadas com conteúdo real onde havia informação suficiente da auditoria: arquitetura (`02_Documentacao/Visao_Geral.md`), 4 notas de infraestrutura (`05_Integracoes_Infra/`), 1 pendência técnica (`06_Pendencias/`), 2 POPs de certificado (`07_POPs_Processos/`). `00_Decisoes`, `03_Padroes_Politicas` e `08_Skills_Agentes_Prompts` ficaram só com `_Template.md` — sem conteúdo real disponível ainda.
- 2026-08-18: pasta do projeto criada no cofre, a pedido do usuário, para registrar os achados da auditoria completa de segurança que também cobriu este repositório (complementando a auditoria já feita em `farmaura`/`farmaura-api`). `lumosmed`/`lumos-api` deliberadamente fora do escopo desta rodada.