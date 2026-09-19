---
cssclasses: ia-nota
---

# Hardening diversos — teste de intrusão 2026-09-18 (recursos sem limite, confiança flat na rede privada, scan de CVE indisponível)

**Tipo:** Vulnerabilidade/hardening (múltiplos achados de severidade baixa/média, testados ao vivo)
**Status:** CONFIRMADO (itens 1 e 2, por inspeção/teste ao vivo) / BLOQUEADO (item 3, não executado)
**Severidade:** MÉDIO (item 1) / BAIXO-INFORMATIVO (item 2) / N/A (item 3)
**Sistema afetado:** `farmaura`, `farmaura-api`, `farmaura-postgres`, `farmaura-valkey` (stack completa)
**Categoria:** Hardening de container / segmentação interna / supply chain
**Data do teste:** 2026-09-18

Nota consolidada — achados diversos do mesmo teste de intrusão que produziu [[teste-intrusao-2026-09-18-bypass-rede-entre-containers|teste-intrusao-2026-09-18-bypass-rede-entre-containers]] (achado principal, nota separada por severidade/detalhe).

## 1. Nenhum container do Farmaura tem limite de memória, CPU ou PID

**Localização:** `farmaura-api/docker-compose.yml` — nenhum serviço declara `deploy.resources.limits`, `mem_limit`, `cpus` ou `pids_limit`. Confirmado ao vivo via `docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.CpuShares}} {{.HostConfig.PidsLimit}}'` em todos os 4 containers principais (`farmaura`, `farmaura_api`, `farmaura_postgres`, `farmaura_valkey`): todos com `Memory=0` (sem limite), `CPUShares=0` (peso padrão, sem teto), `PidsLimit=<no value>` (sem limite de processos).

**Cenário de risco:** um bug de memory leak, uma dependência com fork bomb (acidental ou explorada via RCE), ou simplesmente tráfego excessivo em qualquer um desses containers pode consumir toda a memória/CPU/PIDs disponíveis do host — **sem qualquer contenção**, afetando não só o próprio Farmaura, mas todos os outros tenants/projetos compartilhando o mesmo host Docker (`lumos-gateway`, `lumosmed`, `lumos-api`, outros sites `lumos-*`), num efeito de negação de serviço cross-tenant. Não testado um ataque de exaustão de fato (fork bomb, alocação de memória em loop) neste teste — destrutivo demais para executar contra um host de desenvolvimento compartilhado; achado baseado em confirmação de configuração, não em exploração real.

**Correção sugerida:** definir `deploy.resources.limits.memory`/`cpus` (Compose v3+, respeitado mesmo fora de Swarm desde versões recentes do Compose) ou os equivalentes legados `mem_limit`/`cpus` para cada serviço, dimensionados por observação de uso real em produção.

## 2. Confiança "flat" dentro de `farmaura_private` — qualquer container alcança a porta de qualquer outro, mesmo sem motivo legítimo

**Localização:** rede `farmaura_private` (bridge padrão do Docker, sem política adicional).

**Teste realizado:** de dentro do container `farmaura` (nginx — cuja única necessidade legítima de rede é falar com `farmaura_api:8080`), `nc -zv farmaura_postgres 5432` e `nc -zv farmaura_valkey 6379` — **ambos abertos e alcançáveis**.

**Descrição:** é o comportamento padrão de qualquer rede bridge Docker (não é um bug específico deste projeto) — todos os containers de uma mesma rede se enxergam livremente na camada de rede, independente de precisarem ou não conversar entre si. Isso significa que, se o container mais exposto a input externo (`farmaura`, que termina requisições HTTP antes até do proxy para a API) for comprometido — por uma CVE do próprio nginx (ver [[../../farmaura/04_Seguranca_Riscos/cve-imagens-base-docker-farmaura|cve-imagens-base-docker-farmaura]], que já lista CVEs confirmados na tag em uso), por exemplo — o atacante já tem alcance de rede direto ao Postgres e ao Valkey, sem precisar de mais nenhum movimento lateral de rede (só precisaria de credenciais/exploração do protocolo em si).

**Correção sugerida:** não há correção trivial dentro do modelo de rede bridge padrão do Docker (não suporta política por-par de serviço nativamente). Mitigação prática: garantir que a superfície do container mais exposto (`farmaura`/nginx) seja mínima (já é — imagem alpine, só serve estático + proxy, ver [[../../farmaura/05_Integracoes_Infra/Docker_Compose|farmaura/Docker_Compose]]) e que Postgres/Valkey exijam autenticação forte mesmo para conexões vindas de dentro da rede privada (não usar `trust`/sem senha). Se isolamento real por serviço for necessário no futuro, exige uma solução fora do escopo do Compose padrão (Swarm com overlay `encrypted` + políticas, ou uma malha de rede com regras explícitas).

## 3. `docker scout cves` indisponível sem autenticação — scan de CVE automatizado não pôde ser executado

**Localização:** `docker scout cves backend-farmaura-api:latest` (CLI instalado, versão 1.18.3) pede login (`docker login`) para consultar o banco de CVE — não executado (não tenho credenciais nem devo autenticar em nome do usuário sem pedir).

**Impacto:** a varredura de CVE mais recente disponível continua sendo a pesquisa manual já registrada em [[../../farmaura/04_Seguranca_Riscos/cve-imagens-base-docker-farmaura|cve-imagens-base-docker-farmaura]] (2026-08-19, ~1 mês antes deste teste) — não invalidada, mas também não reconfirmada nesta rodada.

**Correção sugerida:** se o usuário quiser scans de CVE automatizados recorrentes, rodar `docker login` uma vez nesta máquina (ou instalar `trivy`/`grype`, que não exigem conta) e repetir `docker scout cves <imagem>` periodicamente — nenhuma das duas ferramentas estava instalada nesta máquina no momento do teste.

## Referências

- [[teste-intrusao-2026-09-18-bypass-rede-entre-containers|teste-intrusao-2026-09-18-bypass-rede-entre-containers]] — achado principal do mesmo teste.
- [[../../farmaura/04_Seguranca_Riscos/cve-imagens-base-docker-farmaura|cve-imagens-base-docker-farmaura]], [[../../farmaura/04_Seguranca_Riscos/containers-docker-rodando-como-root|containers-docker-rodando-como-root]] — achados anteriores, reconfirmados (não refutados) neste teste: `whoami` dentro de `farmaura`/`farmaura_api` retorna `root`; nenhum `docker.sock` montado em nenhum container; nenhum modo privilegiado nem capability extra em uso.

## Atualizações

- 2026-09-18: nota criada a partir de teste de intrusão ativo pedido explicitamente pelo usuário.
