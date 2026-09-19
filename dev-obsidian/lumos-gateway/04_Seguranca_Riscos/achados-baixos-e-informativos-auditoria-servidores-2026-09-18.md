---
cssclasses: ia-nota
---

# Achados diversos de baixa severidade / informativos — auditoria de servidores 2026-09-18

**Tipo:** Vulnerabilidade/robustez/informativo (múltiplos achados de severidade BAIXA/INFORMATIVA, agrupados por afinidade)
**Status:** CONFIRMADO (existência de cada item), salvo indicação contrária
**Severidade:** BAIXO / INFORMATIVO
**Sistema afetado:** `lumos-prd` / `lumos-dev` (host e containers)
**Categoria:** Diversos (drift de versão entre ambientes, monitoramento, documentação de arquitetura)
**Data de identificação:** 2026-09-18

Nota consolidada — cada item é de severidade baixa/informativa isoladamente; agrupados aqui para não gerar uma nota trivial por item, conforme a diretriz do cofre de preferir poucas notas de alto valor.

## 1. Patch de segurança do Nginx do gateway está mais atrasado em `lumos-dev` do que em `lumos-prd`

**Localização:** pacote `nginx` (Debian) dentro do container `lumos_gateway_nginx`.
**Descrição:** `dpkg -l nginx` mostra `1.22.1-9+deb12u9` em `lumos-prd` e `1.22.1-9+deb12u7` em `lumos-dev` — dois releases de patch de segurança do Debian atrás. O binário `nginx -v` reporta `1.22.1` nos dois (a versão "vanilla" não muda com backports de segurança do Debian, só a revisão do pacote), então a diferença real está na revisão `+deb12uN`, não na "versão do Nginx" propriamente.
**Impacto:** baixo hoje (ambos ainda dentro da cadeia de suporte de segurança do Debian bookworm), mas confirma que a imagem do gateway não é reconstruída/atualizada automaticamente — cada servidor fica com o que estava disponível no momento do último build/deploy da imagem.
**Correção sugerida:** reconstruir a imagem do gateway em `lumos-dev` (mesmo processo usado em `lumos-prd`) para igualar o nível de patch; considerar automatizar rebuild periódico da imagem base (mesmo achado de fundo já registrado em [[supply-chain-e-hardening-diversos]] sobre falta de pin/atualização de imagem base).

## 2. Agente de segurança (Monarx) presente só em `lumos-prd`, ausente em `lumos-dev`

**Localização:** host de `lumos-dev`.
**Descrição:** `lumos-prd` roda `monarx-agent` (scanner de segurança/malware) como serviço systemd ativo; `lumos-dev` não tem esse serviço em lugar nenhum (`systemctl list-units` não retorna nada equivalente).
**Impacto:** `lumos-dev` fica sem essa camada de detecção — relevante porque, como mostrado nesta mesma auditoria ([[lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev]], [[coturn-dev-sem-confirmacao-de-autenticacao-e-sem-tls]]), `lumos-dev` tem hoje mais exposição de rede direta do que `lumos-prd`, não menos — a ausência de monitoramento vai na direção contrária do risco real.
**Correção sugerida:** instalar o mesmo agente (ou equivalente) em `lumos-dev`, já que ele hospeda tráfego público real (múltiplos subdomínios `dev.*` com certificado válido, não é um ambiente isolado da internet).

## 3. Drift de Redis vs. Valkey entre produção e dev para o mesmo produto (LumosMed)

**Localização:** `lumosmed-redis` (produção) vs. `lumosmed-valkey` (dev).
**Descrição:** em `lumos-prd`, o cache/fila do LumosMed roda sobre `redis:7.4-alpine`; em `lumos-dev`, o mesmo papel roda sobre `valkey/valkey:9.0.4-alpine`. Os demais serviços do ecossistema (Farmaura, lumos-api, LumosNeon, Michele, Horizon) já usam Valkey nos dois ambientes — LumosMed é a única stack ainda em Redis, e só em produção.
**Impacto:** baixo diretamente, mas é uma divergência de comportamento entre dev e produção para o mesmo produto (dev não testa o backend que produção realmente usa) e mantém uma dependência a mais para acompanhar quanto a CVEs (Redis e Valkey divergiram de licença/manutenção desde o fork).
**Correção sugerida:** migrar `lumosmed-redis` de produção para Valkey (mesmo processo já feito para os demais produtos, ver [[../../farmaura/00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|migração Farmaura]] como precedente), alinhando dev e produção.

## 4. PostgreSQL nativo (fora do Docker) rodando em `lumos-dev`, porta `127.0.0.1:5433`

**Localização:** processo `postgres` (não `docker-proxy`) em `lumos-dev`, escutando só em loopback (`127.0.0.1:5433`/`[::1]:5433`); existe também um usuário de sistema `postgres` com shell de login (`/bin/bash`).
**Descrição:** todos os bancos de dados do ecossistema rodam containerizados (`farmaura_postgres`, `lumos-api-postgres`, `lumos_horizon_postgres`, etc.) — este é o único Postgres rodando direto no SO, fora de qualquer container, sem documentação prévia no cofre sobre seu propósito.
**Impacto:** baixo hoje (só acessível via loopback), mas é uma peça de infraestrutura não documentada e fora do padrão do resto do ecossistema — não fica claro se está em uso ativo, é resquício de uma stack antiga (possivelmente relacionado às pastas em `/opt/sites_antigos/`, ver [[segredos-de-stacks-antigas-abandonados-em-disco-nos-dois-servidores]]), ou serve a algum propósito administrativo do próprio host.
**Correção sugerida:** confirmar o propósito real (`SELECT datname FROM pg_database;` seria suficiente, feito por alguém com contexto, não como parte de uma auditoria observacional que evita tocar em dados); se for resquício não utilizado, desinstalar o pacote `postgresql` nativo do host.

## 5. Nenhum servidor TURN equivalente em produção (`lumos-prd`)

**Localização:** `lumos-prd` (ausência).
**Descrição:** `lumos-dev` tem um container `coturn` dedicado para telemedicina do LumosMed (ver [[coturn-dev-sem-confirmacao-de-autenticacao-e-sem-tls]]); `lumos-prd` não tem nenhum container/serviço TURN listado.
**Impacto:** não avaliado se é uma lacuna real (produção usa algum TURN de terceiro/gerenciado não documentado?) ou se a funcionalidade de telemedicina em produção depende só de STUN (o que falharia para usuários atrás de NAT simétrico/redes corporativas restritivas). Merece esclarecimento do time de produto, não é conclusivo como vulnerabilidade.
**Correção sugerida:** confirmar com quem opera produção se existe TURN gerenciado externo para a telemedicina do LumosMed em produção; se não existir, registrar como pendência de produto (não só de segurança) em `lumosmed/06_Pendencias/`.

## 6. `certbot`/`fail2ban`/`coturn` em `:latest` — versão real por trás da tag confirmada, e containers há meses sem recriar

**Localização:** containers `lumos_gateway_certbot`, `lumos_gateway_fail2ban`, `lumosmed-turn-dev`.
**Descrição:** já era um achado conhecido que essas imagens não têm pin de versão (ver [[supply-chain-e-hardening-diversos]]); esta auditoria confirmou ao vivo a versão real que está de fato rodando hoje, por trás de cada `:latest`:
- `certbot`: `4.1.1` em `lumos-prd` (container recriado em 2026-09-06), `4.2.0` em `lumos-dev` (container de 2026-05-28 — quase 4 meses sem recriar).
- `fail2ban`: `v1.1.0` idêntico nos dois servidores.
- `coturn` (só existe em `lumos-dev`): `4.11.0`, container também de 2026-05-28.
**Impacto:** a ironia da tag `:latest` é que, sem recriar o container, a versão fica **presa no passado** (o que era "latest" em maio) em vez de atualizar — ao mesmo tempo em que um `docker compose pull && up` futuro puxaria uma versão nova sem revisão prévia, criando uma janela de patch imprevisível (ou muito atrasada, ou uma atualização grande e não testada de uma vez).
**Correção sugerida:** já registrada em [[supply-chain-e-hardening-diversos]] — fixar versão explícita; esta nota só quantifica o atraso real observado (até ~4 meses sem recriação em `lumos-dev`).

## 7. Software nativo (fora do Docker) esquecido no host `lumos-dev`: `certbot` 2.9.0 e PHP 8.3/8.5 de PPA de terceiros, aparentemente sem uso

**Localização:** pacotes do SO em `lumos-dev` (fora de qualquer container).
**Descrição:** além do `certbot` containerizado (que é o que de fato gerencia os certificados do gateway), o host `lumos-dev` tem um **`certbot` 2.9.0 instalado nativamente** (pacote Ubuntu), com um cron em `/etc/cron.d/certbot` — mas esse cron é um no-op hoje, pois seu próprio guard (`test ... -a \! -d /run/systemd/system`) desativa a execução quando o systemd está ativo como init (que é o caso). O host também tem **PHP 8.3 e PHP 8.5 instalados nativamente**, o PHP 8.5 vindo do PPA de terceiros `ppa.sury.org` (não um repositório oficial Ubuntu/Debian) — sem nenhum processo `php-fpm`/Apache rodando ativamente (`systemctl list-units` não mostra nenhum serviço PHP ativo). Tudo aponta para resquício de uma instalação anterior à containerização completa (mesma época das pastas em `/opt/sites_antigos/`, ver [[segredos-de-stacks-antigas-abandonados-em-disco-nos-dois-servidores]]).
**Impacto:** baixo hoje (nada em execução ativa usando esse software), mas é superfície de ataque e de confiança de supply chain desnecessária num servidor que hospeda produção real de outros produtos — inclui confiar num repositório APT de terceiro (`sury.org`) que não precisa estar instalado se nada o usa.
**Correção sugerida:** confirmar que nada depende desses pacotes nativos (`dpkg -l | grep php`, `apt-cache rdepends`) e removê-los (`apt purge`), junto com o `ppa.sury.org` da lista de repositórios, se de fato não usados; mesma recomendação para o `certbot` nativo (a versão containerizada já cobre a função).

## 8. Jail `nginx-codigo` do fail2ban confirmado, ao vivo, com zero disparos nos dois servidores

**Localização:** container `lumos_gateway_fail2ban`, jail `nginx-codigo`.
**Descrição:** reconfirma, agora com dado ao vivo dos dois servidores (não só leitura de código-fonte), o achado já registrado em [[fail2ban-regras-diversas]] (regex incompleta) — `fail2ban-client status nginx-codigo` mostra `Total failed: 0` tanto em `lumos-prd` quanto em `lumos-dev`, apesar de os outros 4 jails terem disparado centenas de vezes nos mesmos logs. Não é um achado novo, só uma confirmação em produção real do que já era suspeitado por leitura estática.
**Correção sugerida:** já documentada em [[fail2ban-regras-diversas]] — sem mudança na recomendação, só reforço de prioridade.

## O que foi verificado e está correto (negativo — vale registrar)

- Nenhum container, nos dois servidores, roda em modo `privileged` nem monta `docker.sock` — superfície de escalada via Docker permanece fechada em toda a frota, não só no gateway (achado positivo já parcial em [[../02_Documentacao/Visao_Geral|Visão Geral]], agora confirmado para todos os ~30 containers de ambos os hosts).
- TLS do gateway usa só `TLSv1.2`/`TLSv1.3` com cipher suite moderna (AEAD, forward secrecy) nos dois servidores — sem protocolo legado habilitado.
- Todos os certificados TLS ativos (produção e dev) estão válidos, com 31 a 86 dias de validade restante no momento da auditoria — sem risco de expiração iminente.
- GeoIP allowlist confirmado ativo e coerente ao vivo nos dois servidores (mesma lista de 15 países nos dois ambientes), com o bypass de `robots.txt`/`sitemap.xml`/`llms.txt` corretamente escopado (reconfirma achado positivo já registrado na auditoria de 2026-08-19).
- fail2ban (tanto o containerizado para Nginx quanto o nativo do host para SSH) está de fato ativo e banindo IPs reais nos dois servidores — não é uma configuração morta.

## Referências

- [[lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev]], [[coturn-dev-sem-confirmacao-de-autenticacao-e-sem-tls]], [[segredos-de-stacks-antigas-abandonados-em-disco-nos-dois-servidores]] — achados de maior severidade da mesma rodada.
- [[fail2ban-regras-diversas]], [[supply-chain-e-hardening-diversos]] — achados anteriores (auditoria 2026-08-19) reconfirmados/relacionados.
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18 (2): adicionados itens 6-7 (versões reais confirmadas por trás das imagens `:latest`, com data de criação dos containers; software nativo esquecido em `lumos-dev` — certbot 2.9.0 e PHP de PPA de terceiros), a partir de aprofundamento pedido pelo usuário sobre versões antigas/exposição do servidor.
- 2026-09-18: nota criada, consolidando 6 achados de baixa severidade/informativos da auditoria de servidores.
