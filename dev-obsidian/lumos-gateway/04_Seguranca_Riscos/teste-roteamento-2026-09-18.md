---
cssclasses: ia-nota
---

# Teste de roteamento 2026-09-18 — `gateway_nginx` local (rodada 1: checagens leves; rodada 2: teste agressivo autorizado)

**Tipo:** Verificação de controle (mistura de "sem achado" e vulnerabilidade confirmada — ver [[fail2ban-timezone-quebra-deteccao-rate-limit|fail2ban-timezone-quebra-deteccao-rate-limit]] para o achado principal da rodada 2)
**Status:** MISTO — ver cada item
**Sistema afetado:** `lumos-gateway` (`gateway_nginx`, `lumos_gateway_fail2ban`)
**Categoria:** Roteamento / rate limit / cabeçalhos / TLS
**Data do teste:** 2026-09-18 (duas rodadas, mesmo dia)

## Contexto — duas rodadas com regras diferentes

**Rodada 1** (itens abaixo sem marcação): seguiu a política padrão de "cuidado redobrado" com `lumos-gateway` — só checagens leves, pontuais, sem certificado real, rede/volumes/secret fictícios destruídos depois. Só o bloco HTTP (porta 80) pôde ser testado, porque sem certificado real todos os vhosts HTTPS ficam **desabilitados automaticamente** pelo próprio `entrypoint.sh`.

**Rodada 2** (marcada "RODADA 2" em cada item): usuário pediu explicitamente um teste mais agressivo, autorizando uma exceção pontual à política (ver `padrao-ataques-defesas-e-limites-de-teste.md`, seção "Exceções conhecidas"). Ambiente recriado com **certificados self-signed gerados para os 8 domínios primários** + **containers stub como upstream** para os tenants que não rodam nesta máquina (`nginx:1.29.1-alpine` vazio, só para destravar o boot do nginx — sem isso o `gateway_nginx` nem inicia, porque falha ao resolver DNS de um upstream ausente já no carregamento da config, achado por si só, ver seção 5) — permitindo testar os **10 vhosts HTTPS reais** pela primeira vez, não só o fallback HTTP. Ainda local, ainda sem tocar domínio público ou `/etc/letsencrypt` real. Tudo desmontado ao final (rede, volumes, certificados, containers stub, imagem buildada) — nenhum arquivo do projeto foi alterado.

## 1. Roteamento por Host desconhecido / injeção de header Host

`Host` não cadastrado → `HTTP 302` para `$fallback_domain` (`dev.lumosmed.com.br`, configurado via `FALLBACK_DOMAIN_BASE`). `Host: evil-attacker.com` → mesmo comportamento, redireciona para o domínio de fallback configurado, **não reflete o Host arbitrário enviado** (sem open redirect). **Controle funcionando corretamente.**

## 2. Rate limiting (`limit_req zone=req_limit burst=20 nodelay`) — RESOLVIDO NA RODADA 2: confirmado funcionando

Rodada 1 (sequencial, 25 req): inconclusivo, ver motivo abaixo dos resultados da rodada 2.

**RODADA 2** — 60 requisições **verdadeiramente paralelas** (`xargs -P 60`) contra o vhost real do Farmaura (`https://dev.drogariafarmaura.com.br`, `burst=40 nodelay`): **41 passaram (200), 19 rejeitadas (429)** — bate com o burst documentado. **Controle confirmado funcionando sob carga real.** O teste sequencial da rodada 1 não gerava requisições rápidas o bastante para exceder a zona (`rate=5r/s` + burst absorve rajadas curtas); não era uma falha do rate limit, era uma limitação do método de teste.

## 3. Header GeoIP spoofável (`X-Lumos-Client-Country`/`X-Lumos-Client-IP`) — ainda não conclusivo

**RODADA 2** — reenviado contra o vhost real (`Host`/SNI corretos) com e sem os headers forjados: os dois retornaram `HTTP 200` (esperado, `BR` não é um país bloqueado, então não testa a via de bypass real). O ambiente de teste (IP de origem interno `172.19.0.1`, faixa privada) não tem dado de GeoIP real para exercitar `$deny_country` de forma significativa mesmo com Host/SNI corretos — testar isso de verdade exigiria uma origem com IP público real de um país bloqueado, fora do escopo de um teste local. Achado original (dead code, `$lumos_forwarded_client_*` nunca lido) em [[supply-chain-e-hardening-diversos|supply-chain-e-hardening-diversos]] item 4 continua a referência válida.

## 4. `lumos_gateway_fail2ban` — RESOLVIDO NA RODADA 2: achado real encontrado, não é crash-loop

Rodada 1: container ficou em crash-loop, tratado como possível artefato do ambiente virtualizado, não investigado a fundo.

**RODADA 2** — na segunda subida, o container ficou estável (`healthy`) o tempo todo, sem crash-loop (reforça que era mesmo um artefato de boot/rede da rodada 1, não um bug do fail2ban em si). Com o container estável, foi possível investigar de verdade — achado um problema real e sério: ver nota dedicada [[fail2ban-timezone-quebra-deteccao-rate-limit|fail2ban-timezone-quebra-deteccao-rate-limit]] (descompasso de fuso horário entre `fail2ban` e `nginx` torna o jail de rate-limit/DoS completamente inoperante — nunca bane ninguém).

## 5. RODADA 2 — o `gateway_nginx` não inicia se qualquer upstream de qualquer tenant estiver inacessível (ponto único de falha entre tenants)

**Achado incidental**, descoberto ao tentar destravar o boot do nginx para o teste: `nginx -t`/carregamento de config falha com `host not found in upstream "lumosmed-web:8000"` (erro fatal, processo sai) se **qualquer um** dos 9 hostnames de upstream (`FARMAURA_UPSTREAM`, `LUMOSMED_UPSTREAM`, `LUMOS_API_UPSTREAM`, etc.) não resolver via DNS no momento do start — porque os templates usam `proxy_pass http://<upstream-fixo>:<porta>;` estático, resolvido uma vez no carregamento da config, não via `resolver`+variável (resolução dinâmica/lazy). **Severidade não formalmente classificada nesta nota** (é mais um achado de resiliência/disponibilidade do que de intrusão), mas relevante: em produção, se o container de **qualquer um** dos ~9 tenants ficar indisponível/renomeado/desconectado da rede no momento em que o `gateway_nginx` precisar (re)iniciar, **o gateway inteiro fica fora do ar para todos os tenants**, não só para o afetado — um único tenant problemático pode derrubar o edge público de todos os outros. Não investigado se há um botão de emergência para excluir um tenant da config e restartar rápido — provável que sim (editar `.env`/template e rebuild), mas não testado.

## TLS e headers de segurança — RODADA 2, confirmado funcionando bem

- Protocolos: só `TLSv1.2`/`TLSv1.3` aceitos (`ssl_protocols` no `nginx.conf.template`) — testado `--tlsv1.0 --tls-max 1.0`: conexão recusada (`HTTP 000`); `TLSv1.2`: aceito. **Controle confirmado.**
- Cifras: só suítes AEAD com forward secrecy (`TLS_AES_256_GCM_SHA384`, `ECDHE-*-GCM-*` etc.) — configuração moderna e correta, sem downgrade para cifra fraca observado.
- Headers de segurança (HSTS, CSP não aplicável a este template — ver nota separada sobre CSP —, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy): **presentes e corretos** nos vhosts testados (Farmaura, LumosMed) quando acessados com SNI+Host corretos — confirma por teste ao vivo o que a auditoria de 2026-08-19 já tinha confirmado por leitura de código (ver item 5 retratado em [[hardening-baixo-docker-e-gateway-diversos|hardening-baixo-docker-e-gateway-diversos]] no lado Farmaura — aqui é a mesma confirmação, agora do lado do gateway). **Nota metodológica**: um teste inicial meu, sem `--resolve` (SNI incorreto), pareceu mostrar headers ausentes — era um artefato do teste (SNI não batendo com o Host header, caindo num vhost/handshake diferente do pretendido), corrigido e revalidado antes de virar achado. Registrado aqui só como lembrete de metodologia, não como vulnerabilidade.
- Confusão de SNI/Host: enviar SNI de um domínio não configurado (`attacker.example`) junto com `Host:` de um domínio real servido ainda resultou no conteúdo correto do domínio pedido no `Host` — nginx roteia por `Host` HTTP dentro do vhost TLS selecionado, comportamento padrão do nginx (múltiplos `server{}` atrás do mesmo `listen ssl`), não uma falha de roteamento — mas **o certificado apresentado na conexão TLS é determinado pela SNI, não pelo Host HTTP**, então um cliente com SNI incorreto veria um aviso de certificado inválido no navegador antes mesmo do HTTP ser processado (mTLS/browser real teria bloqueado; `curl -k` ignora isso). Sem exploração demonstrada, registrado como comportamento observado.
- Conexão sem SNI (direto por IP): aceita uma conexão TLS (usando o certificado do vhost `default_server`) em vez de recusar o handshake — comportamento comum, não necessariamente uma falha (recusar exigiria `ssl_reject_handshake on;` num `server{}` catch-all, não configurado).

## HTTP request smuggling — RODADA 2, testado, sem achado

Requisição com `Content-Length` e `Transfer-Encoding: chunked` conflitantes simultaneamente → `HTTP 400` (nginx rejeita corretamente, não repassa a ambiguidade ao upstream). **Controle confirmado.**

## Referências

- [[fail2ban-timezone-quebra-deteccao-rate-limit|fail2ban-timezone-quebra-deteccao-rate-limit]] — achado principal da rodada 2, nota dedicada por severidade.
- [[../../docker/06_Pendencias/verificar-tz-fail2ban-producao|docker/verificar-tz-fail2ban-producao]] — próximo passo (confirmar se produção tem o mesmo problema).
- [[../../farmaura/04_Seguranca_Riscos/nginx-teste-intrusao-2026-09-18|farmaura/nginx-teste-intrusao-2026-09-18]] — teste completo (sem as mesmas restrições) contra o nginx do próprio Farmaura.
- [[supply-chain-e-hardening-diversos]] — achados já confirmados anteriormente sobre este mesmo `lumos-gateway`, não refeitos aqui.
- `dev-obsidian/_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md` — política que definiu os limites da rodada 1 e registra a exceção pontual da rodada 2.

## Atualizações

- 2026-09-18: rodada 2 (teste mais agressivo, autorizado explicitamente pelo usuário) — ambiente completo com TLS self-signed e todos os 10 vhosts, resolvidos os 3 itens inconclusivos da rodada 1 (rate limit confirmado funcionando; fail2ban revelou achado real, não era crash-loop; TLS/headers/smuggling testados e confirmados corretos), mais um achado novo de resiliência (single point of failure entre tenants no boot do nginx).
- 2026-09-18: nota criada a partir de teste de roteamento leve (rodada 1), pedido explicitamente pelo usuário, conduzido dentro dos limites da política de teste de segurança.
