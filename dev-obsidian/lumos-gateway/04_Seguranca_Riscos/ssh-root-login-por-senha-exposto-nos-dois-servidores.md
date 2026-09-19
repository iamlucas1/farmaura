---
cssclasses: ia-nota
---

# SSH permite login de `root` com senha, exposto ao mundo, nos dois servidores (`lumos-prd` e `lumos-dev`)

**Tipo:** Vulnerabilidade (hardening de acesso ao host)
**Status:** CONFIRMADO
**Severidade:** CRÍTICO
**Sistema afetado:** host (SO), `lumos-prd` e `lumos-dev` — não é específico do gateway, afeta a VM inteira e todos os produtos que ela hospeda
**Categoria:** Broken access control / autenticação do host / brute force
**Data de identificação:** 2026-09-18

## Descrição

Nos dois servidores, `sshd -T` (configuração efetiva, já mesclando `sshd_config`+`sshd_config.d/`) confirma:

- `permitrootlogin yes` — root pode logar via SSH diretamente.
- `passwordauthentication yes` — autenticação por senha está habilitada (não é só chave pública).
- `port 22`, escutando em `0.0.0.0:22` **e** `[::]:22` (`ss -tulnp`) — exposto à internet inteira, não restrito a nenhuma faixa de IP.
- `passwd -S root` confirma que a conta `root` **tem senha definida** (`root P ...`, não bloqueada/sem senha) nos dois servidores.

Ou seja: hoje é tecnicamente possível tentar autenticar como `root` só com usuário+senha, direto da internet pública, nos dois servidores de produção/staging do ecossistema inteiro (Farmaura, LumosMed, lumos-api, Thamara, Michele, LumosNeon, Horizon, ADCRDF).

## Evidência

- `sshd -T` (root, via `ssh lumos-prd`/`ssh lumos-dev`) — saída idêntica nos dois hosts: `permitrootlogin yes`, `passwordauthentication yes`, `pubkeyauthentication yes`, `kbdinteractiveauthentication no`, `maxauthtries 6`.
- `ss -tulnp` — `tcp LISTEN 0.0.0.0:22` e `[::]:22`, processo `sshd`.
- `passwd -S root` — `root P 2026-01-29 ...` (prd) / `root P 2025-10-30 ...` (dev) — `P` = senha ativa (não `L`/locked, não `NP`/sem senha).
- `journalctl -u ssh --since '-7 days' | grep -c 'Failed password\|authentication failure'` — **184 tentativas falhas em 7 dias em `lumos-prd`, 170 em `lumos-dev`** — há tentativas de brute force ativas e constantes contra a porta 22 dos dois servidores, o que é esperado para qualquer IP público na internet, mas confirma que a superfície é ativamente sondada, não uma exposição teórica.
- `last -a` mostra logins reais de `root` bem-sucedidos via senha/chave a partir de IPs residenciais variados (Vivo/Claro/Oi) — confirma que o acesso administrativo real do time usa esse mesmo caminho hoje.

## Cenário de risco

Um atacante com uma senha de root vazada/reaproveitada (ex.: reuso de senha de outro serviço comprometido) ou uma senha fraca conseguiria autenticar como `root` diretamente, sem precisar de nenhuma chave privada — comprometimento total e imediato do servidor (e, por consequência, de todos os produtos hospedados nele, containers, bancos de dados e segredos em `.env`). Diferente de uma chave SSH (que exige exfiltrar um arquivo específico de um dispositivo específico), uma senha pode ser adivinhada, reutilizada de um vazamento de terceiros, ou capturada por keylogger/phishing sem exigir acesso prévio a nenhum dispositivo do time.

## Impacto

Comprometimento completo do host (root shell) em caso de sucesso — acesso a todos os containers Docker (que não usam nenhum isolamento adicional além do próprio Docker), a todos os bancos de dados (mesmo os que só escutam em `127.0.0.1`, pois root no host acessa qualquer coisa), a todos os `.env`/segredos em disco (incluindo os antigos abandonados, ver [[segredos-de-stacks-antigas-abandonados-em-disco-nos-dois-servidores]]), e possibilidade de pivô para dentro das redes Docker internas de cada produto.

## Pré-condições

Nenhuma além de: (a) conhecer/adivinhar a senha de root, ou (b) uma vulnerabilidade futura em `sshd`/PAM que dependa de `PasswordAuthentication` estar habilitado para ser explorável (superfície de ataque adicional que uma configuração só-chave eliminaria por completo).

## Escopo afetado

`/etc/ssh/sshd_config` (e `sshd_config.d/*`) de `lumos-prd` e `lumos-dev` — afeta a VM inteira, não um produto específico.

## Causa raiz

Configuração padrão/histórica de acesso ao servidor nunca foi endurecida para desabilitar login de root por senha, apesar de o fluxo real de trabalho do time já usar predominantemente chave SSH (`~/.ssh/id_rsa` no `~/.ssh/config` local, ver `Host lumos-prd`/`lumos-dev`) — ou seja, a superfície de senha parece não ser necessária no dia a dia, só não foi desligada.

## Mitigação existente (parcial, não elimina o risco)

Há um `fail2ban` nativo do host (fora do container `lumos_gateway_fail2ban`, que só cobre Nginx) com um jail `sshd` ativo nos dois servidores: 5 tentativas falhas em 10 minutos → banimento de 12h (`bantime=43200`, `findtime=600`, `maxretry=5`, valores default do pacote Ubuntu, `/etc/fail2ban/jail.conf`, sem `jail.local` customizado). Isso reduz a velocidade de um brute force distribuído de IP único, mas **não elimina** o risco de uma senha correta ser usada em poucas tentativas, nem de um ataque distribuído por múltiplos IPs (cada IP começa do zero).

## Correção sugerida para análise futura

1. `PermitRootLogin prohibit-password` (ou `no`, criando um usuário administrativo próprio com `sudo`) — elimina por completo a possibilidade de autenticação de root por senha, mantendo login por chave.
2. `PasswordAuthentication no` — desabilita autenticação por senha para **todos** os usuários, não só root, forçando uso exclusivo de chave pública (já é o padrão real de uso, conforme `~/.ssh/config` do time).
3. Considerar restringir a porta 22 por IP de origem (allowlist) via firewall de host, já que hoje não há firewall de host algum além do Docker/fail2ban — ver achado relacionado [[sem-firewall-de-host-alem-do-docker-e-fail2ban]].
4. Documentar formalmente em `07_POPs_Processos/` o novo fluxo de acesso (ex.: se algum humano além do usuário principal precisa de acesso, como ele recebe uma chave).

## Dependências da correção

Garantir, **antes** de aplicar `PasswordAuthentication no`, que a chave pública correspondente a `~/.ssh/id_rsa` do usuário já está em `~/.ssh/authorized_keys` de `root` nos dois servidores (evitar lockout). Testar a mudança primeiro em `lumos-dev`, confirmar que o acesso por chave continua funcionando, só então aplicar em `lumos-prd`.

## Riscos de regressão

Alto se aplicado sem confirmar a chave pública primeiro — pode causar lockout total de acesso SSH ao servidor (sem console alternativo documentado, isso exigiria acesso via painel do provedor de hospedagem para recuperar).

## Como validar futuramente que a correção funcionou

`sshd -T | grep -Ei 'permitrootlogin|passwordauthentication'` deve retornar `permitrootlogin prohibit-password` (ou `no`) e `passwordauthentication no`; confirmar que `ssh lumos-prd`/`ssh lumos-dev` (via chave) continuam funcionando normalmente após o reload do `sshd`.

## Referências

- [[sem-firewall-de-host-alem-do-docker-e-fail2ban]] — achado relacionado sobre a ausência de uma camada de firewall de host que poderia restringir a porta 22 por IP.
- [[segredos-de-stacks-antigas-abandonados-em-disco-nos-dois-servidores]] — parte do impacto de um comprometimento de root.
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18: achado registrado, a partir de auditoria observacional via `ssh lumos-prd`/`ssh lumos-dev` (acesso já autorizado e documentado como método padrão de acesso a produção).
