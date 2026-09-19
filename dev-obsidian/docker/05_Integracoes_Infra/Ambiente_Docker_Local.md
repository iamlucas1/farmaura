---
cssclasses: ia-nota
---

# Ambiente Docker Local

**Tipo:** Infraestrutura (ambiente de desenvolvimento local)

## Propósito

Descreve a topologia real do Docker nesta máquina de desenvolvimento. Compartilhado por todos os projetos do cofre — não é infra de um produto específico. Existe porque a máquina tem **duas engines Docker independentes e sem relação entre si**, o que já causou confusão de diagnóstico (ver [[../00_Decisoes/2026-09-18-reset-completo-vm-docker-desktop-disco-cheio|ADR de 2026-09-18]]).

## Contrato

### Engine 1 — `docker.service` (sistema)

- Daemon `dockerd` nativo, instalado via pacote, gerenciado por `systemd` **de sistema** (não de usuário).
- Socket: `/var/run/docker.sock` (dono `root:docker`; o usuário precisa estar no grupo `docker`, sem precisar de `sudo` pro CLI).
- Reiniciar exige `sudo systemctl restart docker` — a IA não tem `sudo` sem senha nesta máquina, então reinício desse serviço específico sempre depende do usuário rodar o comando.
- Contexto do CLI: `default`.
- Storage driver `overlayfs`, direto no filesystem do host (`/var/lib/docker`) — suporta remoção real de blocos (`prune` libera espaço no host imediatamente).

### Engine 2 — Docker Desktop (VM)

- Roda dentro de uma VM Linux (`linuxkit`) via QEMU/KVM: processos `com.docker.backend` (+ `services`, `build`) e `qemu-system-x86_64`.
- Todo o estado (imagens, containers, volumes, build cache) fica dentro de **um único arquivo de disco virtual**: `~/.docker/desktop/vms/0/data/Docker.raw` — disco esparso, tamanho aparente igual ao total do disco físico do host, uso real variável.
- Base do sistema operacional da VM (somente leitura) fica em `/opt/docker-desktop/linuxkit/desktop.img`, separado do `Docker.raw`.
- Socket: `~/.docker/desktop/docker.sock`. Contexto do CLI: `desktop-linux`.
- Gerenciado por serviço de **usuário** (`systemctl --user status|restart|stop|start docker-desktop`) — não precisa de `sudo`.
- Existe também o CLI plugin `docker desktop` (`docker desktop start|stop|restart|status|logs`), específico pra essa engine.
- **Sem suporte a TRIM/discard no disco virtual** — o `virtio-blk` não está configurado com `discard=unmap`, então espaço liberado *dentro* da VM (via `prune`) não é devolvido ao host automaticamente. `fstrim` manual dentro da VM só recupera uma fração mínima. Único jeito confiável de encolher o `Docker.raw` de fato é resetar/recriar o arquivo (apaga todo o conteúdo da engine). Ver pendência [[../06_Pendencias/docker-desktop-vm-sem-trim-nao-encolhe-sozinho|docker-desktop-vm-sem-trim-nao-encolhe-sozinho]].

### Qual contexto usar

`docker context ls` mostra os contextos disponíveis. Nesta máquina, em 2026-09-18: `default` (sistema), `desktop-linux` (Docker Desktop, marcado como atual antes do incidente) e `lumos-dev` (contexto remoto via SSH pro servidor de produção `195.35.19.8` — **nunca** rodar `prune`/limpeza nesse contexto sem confirmação explícita, é produção).

Se um comando `docker` simples travar sem erro nem retorno, suspeitar primeiro de contexto apontando pra engine que não está respondendo, antes de assumir corrupção ou bug — ver runbook [[../07_POPs_Processos/diagnosticar-limpar-disco-docker-cheio|diagnosticar-limpar-disco-docker-cheio]].

## Dependências

Os stacks de dev do Farmaura (Postgres, Valkey, Mailhog, API, frontend) e presumivelmente de outros projetos deste cofre rodam sobre uma dessas duas engines via `docker compose` — qual engine depende de qual contexto está ativo no momento em que o stack é subido. Não documentado ainda qual projeto usa qual engine por padrão nesta máquina — checar `docker context show` / variável `DOCKER_HOST` antes de assumir.

## Atualizações

- 2026-09-18: nota criada após incidente de disco cheio (99% de uso) causado por acúmulo de ~45GB de cache de build e imagens não usadas dentro da VM do Docker Desktop, sem retorno automático de espaço ao host por falta de TRIM.
