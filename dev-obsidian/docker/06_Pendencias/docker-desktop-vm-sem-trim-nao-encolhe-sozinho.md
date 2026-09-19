---
cssclasses: ia-nota
---

# VM do Docker Desktop não tem TRIM — disco vai voltar a crescer sem encolher sozinho

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-18

## Descrição

O disco virtual da VM do Docker Desktop (`~/.docker/desktop/vms/0/data/Docker.raw`) foi resetado e limpo em 2026-09-18 (ver [[../00_Decisoes/2026-09-18-reset-completo-vm-docker-desktop-disco-cheio|ADR]]), mas a causa raiz do crescimento descontrolado não foi corrigida — só o sintoma foi limpo. Faltam:

1. **Configurar um limite de tamanho de disco** para a VM do Docker Desktop (Settings → Resources → Advanced, no app gráfico) menor que o disco físico total, pra falhar de forma controlada (erro de "sem espaço" dentro do Docker) em vez de comer o disco inteiro da máquina de novo.
2. **Decidir se vale manter as duas engines Docker rodando em paralelo** (`docker.service` de sistema + VM do Docker Desktop) ou consolidar em uma só — hoje isso já causou confusão de diagnóstico (contexto do CLI apontando pra engine errada, travando comandos sem erro claro). Ver [[../05_Integracoes_Infra/Ambiente_Docker_Local|Ambiente_Docker_Local]].
3. **Rotina periódica de `docker system prune`** (manual ou agendada) pros dois contextos, já que o build cache cresceu pra 23GB+ sem nenhuma limpeza em meses.

## Contexto

Descoberto durante o diagnóstico do incidente de disco cheio de 2026-09-18. A unidade virtual (`virtio-blk`) que expõe o `Docker.raw` pra VM não está configurada com `discard=unmap` no QEMU, então comandos de TRIM emitidos dentro do guest (via `fstrim`, ou o que `docker system prune` libera) não se traduzem em buracos esparsos no arquivo do host — confirmado testando `fstrim` manual, que só recuperou 529MB dos 24,74GB liberados dentro da VM. Não investigado se dá pra habilitar `discard=unmap` na configuração da VM do Docker Desktop (não é um parâmetro exposto na UI padrão, exigiria alterar como o Docker Desktop invoca o QEMU, o que pode não ser suportado/documentado oficialmente).

Ficou pendente por não ser bloqueante — o disco já foi liberado pelo reset completo, e configurar o limite de disco ou consolidar as engines é uma decisão de setup que vale a pena ser feita com calma, não em cima de um incidente.
