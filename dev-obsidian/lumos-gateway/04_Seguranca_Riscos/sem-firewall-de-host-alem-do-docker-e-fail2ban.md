---
cssclasses: ia-nota
---

# Nenhum firewall de host real — `ufw` instalado mas sem nenhuma regra própria; proteção efetiva vem só do Docker + fail2ban

**Tipo:** Risco identificado (arquitetura de rede do host)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** host (SO) de `lumos-prd` e `lumos-dev`
**Categoria:** Infraestrutura / rede / defesa em profundidade
**Data de identificação:** 2026-09-18

## Descrição

Os dois servidores têm o binário `ufw` ausente do `PATH` do shell não-interativo (`ufw: command not found` via SSH), mas o kernel ainda carrega as chains `ufw-*`/`ufw6-*` no `iptables`/`nftables` (resquício de uma instalação anterior do pacote `ufw`, ou do template padrão de firewall do provedor de VPS). Inspecionando cada uma dessas chains (`ufw-before-input`, `ufw-after-input`, `ufw-reject-input`, etc.) nos dois servidores: **todas estão vazias, sem nenhuma regra**. A política padrão de `INPUT`/`OUTPUT`/`FORWARD` no `iptables` é `ACCEPT`.

Isso significa que **não existe uma camada de firewall de host** decidindo proativamente quais portas podem receber conexão de fora — a única coisa que hoje limita a superfície exposta é:

1. O Docker só abre no host as portas que cada container publica explicitamente (`-p 0.0.0.0:PORT` no `docker-compose.yml`).
2. O `fail2ban` (containerizado, para Nginx; nativo do host, para SSH) reage **depois** de detectar comportamento abusivo, banindo IPs pontuais — é uma camada reativa, não uma allowlist prévia de portas/origens.

Não há, portanto, nenhuma allowlist de IP de origem para administração (SSH), nem um bloqueio proativo de porta a nível de SO — se um `docker-compose.yml` de qualquer produto publicar acidentalmente uma porta em `0.0.0.0` (como de fato aconteceu, ver [[lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev]]), nada no host impede que ela fique exposta ao mundo.

## Evidência

```
$ ssh lumos-prd "ufw status verbose"
bash: line 1: ufw: command not found

$ ssh lumos-prd "iptables -L ufw-before-input -n -v"
Chain ufw-before-input (1 references)
(nenhuma linha de regra)
```//idêntico nos demais chains `ufw-*`/`ufw6-*`, nos dois servidores.

`ss -tulnp` confirma que só as portas efetivamente publicadas por algum container (ou processo nativo) aparecem como `LISTEN` — o que está de fato acessível hoje depende inteiramente de disciplina no `docker-compose.yml` de cada produto, não de uma barreira independente no SO.

## Cenário de risco

Qualquer novo serviço (ou uma configuração alterada por engano) que publique uma porta em `0.0.0.0` fica imediatamente exposto à internet, sem nenhuma segunda camada de defesa no host que pudesse bloquear isso por padrão (o modelo "deny by default, allow explicitamente" não está em vigor). Já se materializou uma vez: [[lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev]].

## Impacto

Amplia o raio de qualquer erro de configuração futuro em qualquer `docker-compose.yml` dos ~15 produtos hospedados nesses dois servidores — sem uma rede de segurança independente do Docker, um erro de publicação de porta vira exposição real imediatamente.

## Pré-condições

Nenhuma — é uma ausência estrutural, não depende de nenhuma ação de um atacante para existir.

## Escopo afetado

Configuração de firewall de host (`iptables`/`nftables`/`ufw`) de `lumos-prd` e `lumos-dev` — afeta a superfície de exposição de todos os produtos hospedados.

## Causa raiz

Aparenta ser resquício de uma instalação de `ufw` nunca configurada de fato (chains criadas, nenhuma regra adicionada) ou removida parcialmente (binário desinstalado, chains do kernel não limpas) — não há decisão documentada em lugar nenhum do cofre sobre a estratégia de firewall de host destes servidores.

## Correção sugerida para análise futura

1. Reinstalar/configurar `ufw` (ou usar `nftables` diretamente) com uma política explícita: permitir `22` (SSH, idealmente já restrito por IP conforme [[ssh-root-login-por-senha-exposto-nos-dois-servidores]]), `80`/`443` (gateway), negar todo o resto por padrão no `INPUT` do host.
2. Importante: qualquer regra de firewall de host precisa ser compatível com a forma como o Docker já gerencia suas próprias chains (`DOCKER-USER` é o ponto de inserção correto para não conflitar com o NAT do Docker, conforme já documentado em [[../02_Documentacao/Visao_Geral|Visão Geral]] "chain = DOCKER-USER... é o ponto de inserção correto") — não bloquear via `ufw`/`INPUT` de um jeito que quebre o roteamento que o Docker já faz via NAT.
3. Isso não elimina a necessidade de continuar publicando portas de app só em `127.0.0.1` (boa prática já seguida pela maioria dos serviços) — é uma camada adicional, não um substituto.

## Dependências da correção

Testar extensivamente em `lumos-dev` antes de aplicar em `lumos-prd` — uma regra de firewall mal configurada pode causar indisponibilidade total (inclusive do próprio SSH, causando lockout).

## Riscos de regressão

Alto se malfeito — firewall de host é uma das configurações mais fáceis de causar autolockout ou de quebrar o roteamento do Docker (que depende de NAT/masquerade funcionando). Validar cada regra com cautela, mantendo uma sessão SSH já aberta como rede de segurança ao testar.

## Como validar futuramente que a correção funcionou

`ufw status verbose` (ou `nft list ruleset`) deve mostrar uma política `deny` por padrão com allowlist explícita; confirmar que `80`/`443`/`22` continuam acessíveis e que o Docker continua publicando/roteando containers normalmente (`docker compose up` de qualquer stack, testar acesso via gateway).

## Referências

- [[ssh-root-login-por-senha-exposto-nos-dois-servidores]] — um firewall de host poderia mitigar restringindo a porta 22 por IP.
- [[lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev]] — exemplo real do tipo de exposição que esta ausência permite.
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18: achado registrado.
