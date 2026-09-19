---
cssclasses: ia-nota
---

# Hub Central: Docker (ambiente local)

Chave de projeto neste cofre: `docker` — mas não é um produto. Cobre o **ambiente Docker local da máquina de desenvolvimento**, compartilhado por todos os projetos deste cofre (`farmaura`, `lumos-gateway`, `lumosmed`), que rodam seus stacks de dev (Postgres, Valkey, Mailhog, containers de app) sobre a mesma engine local. Existe como pasta dedicada porque problemas de ambiente Docker (disco cheio, engine errada, VM travada) não são específicos de um produto e se repetem entre projetos.

## Duas engines Docker na mesma máquina

Esta máquina tem **dois engines Docker independentes**, cada um com seu próprio contexto de CLI:

1. **`docker.service`** (systemd, nível de sistema) — daemon `dockerd` nativo do Linux, socket `/var/run/docker.sock`, contexto `default`. Requer `sudo` para reiniciar.
2. **Docker Desktop** — roda uma VM Linux via QEMU (`com.docker.backend` + `qemu-system-x86_64`), cujo disco é o arquivo `~/.docker/desktop/vms/0/data/Docker.raw`. Socket `~/.docker/desktop/docker.sock`, contexto `desktop-linux`. Controlado pelo serviço de usuário `docker-desktop` (`systemctl --user`, sem `sudo`).

Ver detalhe completo em [[05_Integracoes_Infra/Ambiente_Docker_Local|Ambiente_Docker_Local]].

**Armadilha conhecida:** o contexto ativo do CLI (`docker context ls`) pode estar apontando pra engine errada — se um comando `docker` simples (`docker ps`, `docker version`) travar sem retornar, suspeitar disso antes de qualquer outra coisa. Ver [[07_POPs_Processos/diagnosticar-limpar-disco-docker-cheio|diagnosticar-limpar-disco-docker-cheio]].

## Segurança, configuração e separação entre projetos: onde está documentado

Este ecossistema já tem documentação de Docker considerável **dentro de cada projeto** — não duplicada aqui:

- **`farmaura`**: [[../farmaura/05_Integracoes_Infra/Docker_Compose|Docker_Compose]] (contrato do compose) · [[../farmaura/04_Seguranca_Riscos/containers-docker-rodando-como-root|containers-docker-rodando-como-root]], [[../farmaura/04_Seguranca_Riscos/cve-imagens-base-docker-farmaura|cve-imagens-base-docker-farmaura]], [[../farmaura/04_Seguranca_Riscos/hardening-baixo-docker-e-gateway-diversos|hardening-baixo-docker-e-gateway-diversos]] (auditoria 2026-08-17) · [[../farmaura/07_POPs_Processos/executar-testes-python-no-docker|executar-testes-python-no-docker]].
- **`lumos-gateway`**: [[../lumos-gateway/05_Integracoes_Infra/Docker_Compose|Docker_Compose]] · [[../lumos-gateway/04_Seguranca_Riscos/supply-chain-e-hardening-diversos|supply-chain-e-hardening-diversos]] (auditoria 2026-08-19, imagens sem pin, hardening de capabilities).
- **`lumosmed`**: [[../lumosmed/05_Integracoes_Infra/Docker_Compose|Docker_Compose]] (novo, 2026-09-18) · [[../lumosmed/05_Integracoes_Infra/Lumos_Gateway_Roteamento|Lumos_Gateway_Roteamento]].
- **`lumos-api`** (não tinha chave de projeto própria no cofre): [[05_Integracoes_Infra/Docker_Compose_Lumos_Api|Docker_Compose_Lumos_Api]] (novo, 2026-09-18) — Dockerfile mais endurecido do ecossistema (não-root, `gosu`, secrets de arquivo), mas nunca auditado — ver [[06_Pendencias/lumos-api-sem-auditoria-de-seguranca-docker|pendência]].

O que só existe aqui, cruzando todos os projetos: [[05_Integracoes_Infra/Topologia_Redes_e_Separacao_Entre_Projetos|Topologia_Redes_e_Separacao_Entre_Projetos]] — como cada stack isola sua rede privada, quem entra na rede pública `lumos_gateway`, tabela comparativa de hardening entre os quatro projetos, e como cada um roda (ou não) seus testes dentro do Docker.

**Teste de intrusão ativo, 2026-09-18** (não só revisão de config — stack real subida e atacada de propósito): [[04_Seguranca_Riscos/teste-intrusao-2026-09-18-bypass-rede-entre-containers|teste-intrusao-2026-09-18-bypass-rede-entre-containers]] — achado MÉDIO-ALTO confirmado: qualquer container de qualquer outro projeto no mesmo host alcança `farmaura-api` direto pelo IP, ignorando o nginx (schema completo da API exposto via `/docs`/`/openapi.json`). Mais achados do mesmo teste (recursos sem limite, confiança flat dentro da rede privada) em [[04_Seguranca_Riscos/hardening-diversos-teste-intrusao-2026-09-18|hardening-diversos-teste-intrusao-2026-09-18]].

**Teste de intrusão do nginx, mesmo dia (2 rodadas)**: [[../farmaura/04_Seguranca_Riscos/nginx-teste-intrusao-2026-09-18|farmaura/nginx-teste-intrusao-2026-09-18]] (nginx do Farmaura, sem restrição de teste — versão exposta no header `Server`, ausência de headers de segurança compõe com o bypass de rede acima; traversal/arquivo oculto/métodos perigosos testados e sem achado). `lumos-gateway`: rodada 1 leve, depois **rodada 2 mais agressiva autorizada explicitamente pelo usuário** (exceção pontual à política de "cuidado redobrado", com TLS self-signed próprio e todos os 10 vhosts reais testados) — [[../lumos-gateway/04_Seguranca_Riscos/teste-roteamento-2026-09-18|lumos-gateway/teste-roteamento-2026-09-18]] (rate limit, TLS/cifras, smuggling, SNI/Host confirmados; achado de resiliência: um único tenant fora do ar impede o boot do gateway inteiro). **Achado principal da rodada 2 — ALTO**: [[../lumos-gateway/04_Seguranca_Riscos/fail2ban-timezone-quebra-deteccao-rate-limit|fail2ban-timezone-quebra-deteccao-rate-limit]] — `fail2ban` nunca bane abuso de rate-limit porque roda em UTC enquanto o nginx loga em horário local (descompasso de 3h confirmado, comprovado por A/B com outro jail idêntico que funciona). [[06_Pendencias/verificar-tz-fail2ban-producao|verificar-tz-fail2ban-producao]] — confirmar se produção tem o mesmo problema. [[06_Pendencias/apache2-desconhecido-na-porta-80-do-host|apache2-desconhecido-na-porta-80-do-host]] — achado incidental (não é dos 4 projetos).

## Navegação

- [[00_Decisoes/2026-09-18-reset-completo-vm-docker-desktop-disco-cheio|00_Decisoes]] — decisões de arquitetura/trade-off deste ambiente.
- [[05_Integracoes_Infra/Ambiente_Docker_Local|05_Integracoes_Infra]] — topologia das duas engines, contextos, sockets, e [[05_Integracoes_Infra/Topologia_Redes_e_Separacao_Entre_Projetos|topologia de redes entre projetos]].
- [[06_Pendencias/docker-desktop-vm-sem-trim-nao-encolhe-sozinho|06_Pendencias]] — débito técnico conhecido do ambiente e das lacunas de auditoria.
- [[07_POPs_Processos/diagnosticar-limpar-disco-docker-cheio|07_POPs_Processos]] — runbook de diagnóstico e limpeza.

## Atualizações

- 2026-09-18: teste mais agressivo contra `lumos-gateway`, pedido explicitamente pelo usuário (exceção pontual autorizada à política de teste) — achado ALTO confirmado: `fail2ban` nunca bane abuso de rate-limit por descompasso de fuso horário com o nginx. Ver [[../lumos-gateway/04_Seguranca_Riscos/fail2ban-timezone-quebra-deteccao-rate-limit|fail2ban-timezone-quebra-deteccao-rate-limit]].
- 2026-09-18: teste de intrusão do nginx (Farmaura, sem restrição; lumos-gateway, checagens leves seguindo a política de teste) — ver [[../farmaura/04_Seguranca_Riscos/nginx-teste-intrusao-2026-09-18|farmaura/nginx-teste-intrusao-2026-09-18]] e [[../lumos-gateway/04_Seguranca_Riscos/teste-roteamento-2026-09-18|lumos-gateway/teste-roteamento-2026-09-18]]. Corrigida também a tabela de `project-test-orientation` (linha do `lumosmed` estava desatualizada).
- 2026-09-18: teste de intrusão ativo contra a stack real do Farmaura (subida propositalmente para o teste) — achado confirmado de bypass de rede entre containers (severidade MÉDIO-ALTO) e achados menores de hardening; ver [[04_Seguranca_Riscos/teste-intrusao-2026-09-18-bypass-rede-entre-containers|teste-intrusao-2026-09-18-bypass-rede-entre-containers]].
- 2026-09-18: levantamento completo de Docker em todo o ecossistema (configuração, segurança, testes, separação entre projetos) a pedido do usuário — criadas notas para `lumosmed` e `lumos-api` (que não tinham nenhuma), corrigidas 2 imprecisões encontradas em notas existentes (rede do `docker-compose.gateway.yml` do farmaura; afirmação errada sobre pin de `certbot`/`fail2ban` na política de supply chain).
- 2026-09-18: pasta criada após incidente de disco cheio (99% de uso, dockerd travado) — diagnóstico revelou duas engines Docker rodando em paralelo, com a VM do Docker Desktop consumindo ~50GB reais via `Docker.raw`.
