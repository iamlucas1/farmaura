---
cssclasses: ia-nota
---

# Diagnosticar e limpar disco cheio por Docker

## Quando usar

Disco da máquina de dev perto de 100% de uso, e/ou comandos `docker` (`docker ps`, `docker version`, `docker system df`) travando sem retornar. Ver contexto da topologia em [[../05_Integracoes_Infra/Ambiente_Docker_Local|Ambiente_Docker_Local]] antes de seguir os passos — esta máquina tem duas engines Docker independentes.

## Passos

1. **Confirmar que é disco, não rede/permissão:** `df -h /`. Se estiver perto de 100%, é forte candidato a estar travando o `dockerd` (ele trava tentando escrever estado/logs sem espaço).
2. **Não confiar direto no `docker` CLI se ele travar** — testar a engine de sistema e a do Docker Desktop separadamente, sem depender do contexto ativo:
   - Sistema: `timeout 10 curl -s --unix-socket /var/run/docker.sock http://localhost/version`
   - Docker Desktop: `timeout 10 curl -s --unix-socket ~/.docker/desktop/docker.sock http://localhost/version`
   - Qual delas não responde é a que precisa reiniciar.
3. **Reiniciar a engine travada:**
   - Sistema: `sudo systemctl restart docker` — **precisa do usuário rodar**, a IA não tem `sudo` sem senha nesta máquina.
   - Docker Desktop: `systemctl --user restart docker-desktop` — não precisa de `sudo`, a IA pode rodar direto.
4. **Corrigir o contexto do CLI** se ele estiver apontando pra engine errada: `docker context ls` (contexto atual tem `*`), `docker context use default` ou `docker context use desktop-linux` conforme necessário.
5. **Levantar onde está o consumo** antes de apagar qualquer coisa: `docker system df -v` (e repetir com `--context` pra cada engine). Prestar atenção em containers **rodando** (`docker ps`) antes de qualquer limpeza — `prune` não remove containers ativos nem os volumes vinculados a eles, mas confirmar mesmo assim se há dado real.
6. **Limpeza básica (segura, preserva containers ativos):** `docker system prune -a --volumes -f` (repetir por contexto/engine). Remove imagens não usadas, containers parados, volumes não vinculados, build cache.
7. **Se a engine for a VM do Docker Desktop e o `Docker.raw` não encolher no host** mesmo depois do `prune` (checar com `du -h ~/.docker/desktop/vms/0/data/Docker.raw`): é esperado, essa VM não tem TRIM/discard configurado (ver [[../06_Pendencias/docker-desktop-vm-sem-trim-nao-encolhe-sozinho|pendência]]). Só resetar o arquivo resolve de verdade:
   1. `systemctl --user stop docker-desktop`
   2. Confirmar que os processos pararam: `pgrep -fa "com.docker.backend|qemu-system"` (esperado: nada).
   3. **Confirmar com o usuário antes de apagar** — isso destrói todo container/imagem/volume só existente na VM.
   4. `rm ~/.docker/desktop/vms/0/data/Docker.raw`
   5. `systemctl --user start docker-desktop`
   6. Validar: `curl -s --unix-socket ~/.docker/desktop/docker.sock http://localhost/version` responde, e `du -h ~/.docker/desktop/vms/0/data/Docker.raw` mostra tamanho pequeno (poucos GB).
8. **Avisar o usuário** que qualquer stack de dev que rodava na engine limpa (Postgres, Valkey, etc.) precisa ser subido de novo manualmente.

## Responsável

Executável pela IA sem confirmação para a engine de sistema (`docker.service`) e para limpeza básica (`prune`) em qualquer engine — reset/limpeza de ambiente de dev local não precisa de aprovação prévia. **Reset completo do `Docker.raw`/VM do Docker Desktop exige confirmação explícita do usuário antes de apagar**, mesmo em ambiente de dev, porque destrói dado potencialmente não recriável sem aviso prévio (a IA não sabe de antemão se há dado real no volume).

## Riscos se pulado

Disco em 100% trava não só o Docker mas potencialmente todo o sistema (impossível escrever logs, cache, builds). `dockerd`/Docker Desktop travados também bloqueiam qualquer trabalho de dev que dependa de containers até serem reiniciados.

## Atualizações

- 2026-09-18: nota criada a partir do primeiro incidente real (disco em 99%, ambas as engines diagnosticadas e uma delas resetada).
