---
cssclasses: ia-nota
---

# Kernel em execução está dezenas de versões atrás do que já está instalado em disco — reboot pendente há muito tempo nos dois servidores

**Tipo:** Risco identificado (patch management)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** host (SO/kernel) de `lumos-prd` e `lumos-dev`
**Categoria:** Supply chain / versões antigas / patch management
**Data de identificação:** 2026-09-18

## Descrição

Os dois servidores têm `unattended-upgrades` habilitado e ativo (`systemctl is-enabled/is-active` confirmam `enabled`/`active`, com `APT::Periodic::Unattended-Upgrade "1"`) — ou seja, pacotes (incluindo `linux-image-*`) são baixados e instalados automaticamente. O problema é que **o kernel em execução nunca é trocado** porque isso exige reboot, e o reboot nunca acontece:

- `lumos-prd`: kernel em execução `6.8.0-94-generic`; `/var/run/reboot-required.pkgs` lista `linux-image` de `6.8.0-100`, `101`, `106`, `107`, `110`, `111`, `117`, `124`, `134`, `136`, `137`, `138`, `139` — **13 versões de kernel mais novas já instaladas e nunca ativadas**.
- `lumos-dev`: kernel em execução `6.8.0-90-generic`; mesma lista, começando ainda mais atrás (`94` já é uma das pendentes) — **14 versões mais novas já instaladas e nunca ativadas**.
- `/var/run/reboot-required` existe nos dois (`*** System restart required ***`).
- Apt local (sem `apt update`, só cache existente) já lista 66 (`lumos-prd`) / 89 (`lumos-dev`) pacotes com upgrade disponível — número real de pendências de segurança pode ser maior ou menor após um `apt update` (não executado nesta auditoria, ver limitação abaixo).

## Evidência

```
$ ssh lumos-prd "uname -r; cat /var/run/reboot-required.pkgs"
6.8.0-94-generic
linux-image-6.8.0-100-generic
linux-base
linux-image-6.8.0-101-generic
... (13 versões de kernel no total)
```

Padrão idêntico em `lumos-dev`, com a lista começando em `6.8.0-94` (a versão que já é a "atual" em `lumos-prd`).

## Limitação desta auditoria

Não executei `apt update` em nenhum dos dois servidores para não alterar estado do sistema durante uma auditoria estritamente observacional (mesmo sendo uma operação de baixo risco, optei por não modificar nem o cache de metadados sem necessidade). Os números de pacotes atualizáveis (66/89) refletem o cache local existente, que pode estar desatualizado — a contagem real de patches de segurança pendentes só pode ser confirmada com um `apt update` seguido de `apt list --upgradable` (ação segura e reversível, recomendada como primeiro passo de uma correção futura, não desta auditoria).

## Cenário de risco

Cada versão de kernel pulada pode conter correções de segurança (privilege escalation, corrupção de memória, etc.) que só têm efeito depois do reboot — o sistema roda, por meses, com vulnerabilidades de kernel já corrigidas em disco mas não em memória. Isso é agravado pelo fato de o host não ter isolamento adicional forte entre containers (nenhum container roda `privileged` nem monta `docker.sock`, o que é bom — mas uma escalada de privilégio de kernel ainda comprometeria o host inteiro, todos os containers incluídos).

## Impacto

Superfície de ataque de privilege escalation/kernel exploit maior do que o necessário, por tempo indeterminado (os dois servidores parecem não ter sido reiniciados há um tempo considerável, a julgar pela quantidade de kernels acumulados sem aplicar).

## Pré-condições

Um atacante já precisaria ter algum nível de acesso ao host (ex.: via um dos outros achados desta auditoria, ou uma vulnerabilidade de aplicação com RCE) para que uma falha de kernel não corrigida se torne explorável — não é uma exposição direta pela rede.

## Escopo afetado

Kernel do SO de `lumos-prd` e `lumos-dev` — afeta o host inteiro e, por extensão, todos os containers.

## Causa raiz

Reboot de servidor em produção é uma ação que naturalmente gera hesitação (indisponibilidade durante o processo, mesmo que breve) e não há uma janela de manutenção agendada/documentada em `07_POPs_Processos/` para isso — então nunca acontece organicamente, apesar do `unattended-upgrades` já preparar tudo para quando ele ocorrer.

## Correção sugerida para análise futura

1. Agendar uma janela de manutenção para reboot controlado de cada servidor (começar por `lumos-dev`, validar que todos os containers sobem corretamente após o reboot — `docker compose up` com `restart policy` já configurado deveria cuidar disso automaticamente — antes de agendar o de `lumos-prd`).
2. Depois de confirmado o processo em `lumos-dev`, agendar o reboot de `lumos-prd` em horário de menor tráfego, avisando previamente se houver algum SLA com clientes.
3. Documentar em `07_POPs_Processos/` um processo recorrente (ex.: mensal) de reboot controlado, para não deixar esse acúmulo se repetir indefinidamente.
4. Considerar `apt update && apt list --upgradable` (ação segura e reversível) como parte de checagens periódicas, para ter visibilidade real de pacotes de segurança pendentes além do kernel.

## Dependências da correção

Confirmar que todos os containers têm `restart: unless-stopped`/`always` (ou equivalente) nos respectivos `docker-compose.yml`, para que subam sozinhos após o reboot sem intervenção manual.

## Riscos de regressão

Indisponibilidade breve e esperada durante o próprio reboot — mitigável agendando para horário de baixo tráfego e avisando previamente.

## Como validar futuramente que a correção funcionou

`uname -r` deve corresponder à versão de kernel mais recente instalada; `/var/run/reboot-required` não deve mais existir; confirmar que todos os containers voltaram automaticamente (`docker ps` com a mesma lista de serviços de antes do reboot).

## Referências

- [[sem-firewall-de-host-alem-do-docker-e-fail2ban]], [[ssh-root-login-por-senha-exposto-nos-dois-servidores]] — outros achados de hardening de host da mesma rodada.
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18: achado registrado.
