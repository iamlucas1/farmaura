---
cssclasses: ia-nota
---

# 2026-09-18 — Reset completo da VM do Docker Desktop por disco cheio

## Contexto

Disco da máquina de dev em 99% de uso (2,6GB livres de 187GB). `dockerd` completamente travado — `docker version`, `docker ps` e `docker system df` não retornavam nem após timeout de 10-15s, mesmo com o serviço `docker.service` relatando `active (running)`. Diagnóstico encontrou duas causas empilhadas, ver [[../05_Integracoes_Infra/Ambiente_Docker_Local|Ambiente_Docker_Local]]:

1. O contexto ativo do CLI (`desktop-linux`) apontava pro socket da VM do Docker Desktop, não pro daemon de sistema — então qualquer `docker <comando>` tentava falar com uma engine diferente da que tinha acabado de ser reiniciada.
2. A VM do Docker Desktop guarda todo o seu estado (imagens, containers, volumes, build cache) em um único arquivo de disco esparso, `~/.docker/desktop/vms/0/data/Docker.raw`. Esse arquivo tinha 50GB de uso real (`du`), a maior parte (~45GB) em cache de build (23,33GB) e imagens não usadas (21GB reaproveitável) acumulados ao longo de meses.

## Alternativas consideradas

- **`docker system prune -a --volumes -f` dentro da VM (sem reset)** — testado primeiro. Recuperou 24,74GB *logicamente* dentro do filesystem da VM, mas **não refletiu no host**: a unidade virtual (`virtio-blk`) não está configurada com `discard=unmap`/TRIM passthrough no QEMU, então blocos liberados dentro do guest não voltam a ser um buraco esparso no arquivo do host. Confirmado rodando `fstrim` manualmente dentro da VM (via container privilegiado + `nsenter`): recuperou só 529MB no host, contra os 24,74GB liberados dentro do guest.
- **Ajustar o limite de tamanho de disco da VM nas configurações do Docker Desktop** — reduziria crescimento futuro, mas não resolve o problema imediato de espaço já alocado no `Docker.raw` existente; precisaria de reset de qualquer forma para compactar.
- **Deixar como está, sem reset** — descartada porque o ambiente é só de desenvolvimento (confirmado com o usuário), sem dado real, e o disco físico já estava em estado crítico (99%/97%).

## Decisão

Parar o serviço de usuário `docker-desktop` (`systemctl --user stop docker-desktop`), apagar o arquivo `~/.docker/desktop/vms/0/data/Docker.raw` diretamente e reiniciar o serviço — a VM recria o disco do zero, vazio. Confirmado explicitamente com o usuário antes de executar, por apagar volumes de containers que estavam rodando no momento (stack de dev do Farmaura: `farmaura`, `farmaura_api`, `farmaura_postgres`, `farmaura_valkey`, `farmaura_mailhog`).

Adicionalmente, o cache do `docker.service` (engine de sistema) foi limpo via `docker system prune -a --volumes -f` normalmente (esse tinha suporte a discard, recuperou 4,19GB sem drama).

## Consequências

- Disco da máquina foi de 2,6GB livres (99%) para 55GB livres (70%) no total combinado das duas limpezas.
- `Docker.raw` caiu de 50GB reais (187GB de tamanho aparente/máximo) para ~1,1GB.
- **Todos os containers, imagens e volumes que só existiam na VM do Docker Desktop foram perdidos**, incluindo o Postgres/Valkey/storage do stack de dev do Farmaura que estava rodando havia 19h. Sem backup — combinado explicitamente com o usuário que o ambiente não tinha dado real. Qualquer projeto que dependa da VM do Docker Desktop precisa subir o stack de novo (`docker compose up` ou equivalente) na próxima vez que for usado.
- O contexto do CLI (`docker context`) ficou setado em `default` (engine de sistema) em vez de `desktop-linux`, porque foi o primeiro a voltar a responder durante o diagnóstico. Se o fluxo de trabalho normal depende da VM do Docker Desktop, trocar de volta com `docker context use desktop-linux`.
- Risco de recorrência: a falta de suporte a TRIM na VM significa que o `Docker.raw` **vai voltar a crescer sem encolher sozinho** com uso normal (builds, pulls) — ver pendência [[../06_Pendencias/docker-desktop-vm-sem-trim-nao-encolhe-sozinho|docker-desktop-vm-sem-trim-nao-encolhe-sozinho]].
