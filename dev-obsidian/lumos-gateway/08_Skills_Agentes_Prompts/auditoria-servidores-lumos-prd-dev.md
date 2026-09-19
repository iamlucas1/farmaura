---
cssclasses: ia-nota
---

# Prompt: auditoria observacional de `lumos-prd`/`lumos-dev` (para rodar em outro agente, ex.: Codex)

**Arquivo operacional:** este mesmo arquivo (prompt de texto corrido abaixo, para colar direto no Codex ou outro agente)

## Quando usar

Segunda opinião / cross-check independente da auditoria já registrada em [[../04_Seguranca_Riscos/auditoria-servidores-2026-09-18-resumo-consolidado|auditoria-servidores-2026-09-18-resumo-consolidado]], rodada por outro agente (Codex) com acesso aos mesmos servidores via `ssh lumos-prd`/`ssh lumos-dev`.

## Regra mais importante: somente observacional, nunca ataque real

Este prompt é deliberadamente **read-only**. Não inclui nem autoriza DDoS, brute force real, envio de payload de exploração, port scan agressivo contra os IPs públicos, nem qualquer ação que possa derrubar ou degradar o serviço — porque `lumos-prd` está em produção real, servindo clientes reais (farmácia com receita médica, prontuário de paciente). Isso segue a mesma política já registrada em `_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md`.

## Prompt (colar no Codex)

```
Quero uma auditoria de segurança de INFRAESTRUTURA (não das aplicações Farmaura/LumosMed em si) dos
dois servidores lumos-prd e lumos-dev, acessíveis via `ssh lumos-prd` e `ssh lumos-dev` (chave já
configurada, acesso root). Esta auditoria é ESTRITAMENTE OBSERVACIONAL/READ-ONLY.

NÃO FAÇA, EM NENHUMA HIPÓTESE:
- DDoS, flood, teste de carga, ou qualquer coisa que gere volume de tráfego anormal contra os IPs
  públicos ou domínios destes servidores.
- Brute force real contra SSH, login, ou qualquer serviço (mesmo "só para confirmar" o achado de
  root+senha exposto — já está confirmado e documentado, não precisa ser reexplorado).
- Envio de payload de exploração (SQLi, RCE, path traversal, etc.) contra qualquer porta/serviço,
  local ou remoto.
- Port scan (nmap ou equivalente) contra os IPs públicos — use `ss -tulnp`/`iptables`/`nft` DENTRO do
  próprio servidor via SSH para levantar portas, não varredura externa.
- Qualquer comando destrutivo: nada de apagar, matar processo, reiniciar serviço, alterar firewall,
  aplicar upgrade, rebootar, rotacionar segredo, ou qualquer mudança em geral. Só leitura.
- Testar contra os domínios públicos além de requisições HTTP normais (GET/HEAD, como um navegador
  faria) e consultas DNS públicas — nada de fuzzing de rota, nada de tentar `.env`/`.git` em produção.

ESCOPO: infraestrutura do host e do gateway compartilhado, NÃO lógica de negócio das aplicações.
Cubra:

1. Portas e firewall: `ss -tulnp`, `iptables -L -n -v --line-numbers` (INPUT/FORWARD/OUTPUT/NAT),
   `nft list ruleset`, confirmar o que está de fato acessível em 0.0.0.0/[::] vs. só 127.0.0.1.
2. Fail2ban: tanto o containerizado (gateway, jails de Nginx) quanto um possível fail2ban nativo do
   host (systemctl status fail2ban) — jails ativos, bantime/findtime/maxretry, IPs banidos hoje.
3. GeoIP: confirmar allowlist de país ativa na config do gateway Nginx (dentro do container).
4. SSH: `sshd -T` (PermitRootLogin, PasswordAuthentication, etc.), `passwd -S root` (só para
   confirmar se há senha ativa, sem tentar usá-la), contagem de falhas recentes via journalctl.
5. Docker: `docker ps` completo dos dois hosts — toda porta publicada em 0.0.0.0/[::], qualquer
   serviço que devesse estar só atrás do gateway mas não está; containers `privileged` ou com
   `docker.sock` montado; versão do Docker Engine.
6. Nginx do gateway: versão real (`nginx -v` e `dpkg -l nginx` dentro do container), ssl_protocols/
   ssl_ciphers configurados, headers de segurança (HSTS, CSP, X-Frame-Options etc.) — via leitura de
   config, e opcionalmente via `curl -I` normal (não scan) num domínio público para confirmar o que é
   servido de fato.
7. Certificados TLS: `certbot certificates` dentro do container — validade de cada um.
8. Supply chain: toda imagem Docker dos dois hosts — quais usam tag `latest`/flutuante em vez de
   versão fixa; para as que usam `latest`, descobrir a versão real rodando (ex.: `docker exec <c>
   <binario> --version`) e há quanto tempo o container não é recriado (`docker inspect --format
   '{{.Created}}'`).
9. Kernel e patch de SO: `uname -r` vs. `/var/run/reboot-required.pkgs` (kernels instalados e não
   aplicados), `unattended-upgrades` habilitado?, pacotes desatualizados no cache local (sem rodar
   `apt update` — só relatar limitação se isso importar).
10. Software esquecido: processos/pacotes nativos do SO (fora do Docker) que pareçam vestigiais —
    `systemctl list-units --state=running` filtrando o que não é padrão de distro; `dpkg -l` por
    pacotes como php/apache/certbot instalados nativamente; diretórios tipo `/opt/old`,
    `/opt/sites_antigos` — SÓ LISTAR nomes de arquivo (find), NUNCA ler conteúdo de `.env`/segredo.
11. DNS/e-mail dos domínios públicos principais: SPF (`dig TXT <domínio>`) e DMARC
    (`dig TXT _dmarc.<domínio>`) — leitura pública, sem enviar e-mail nenhum.

REGRAS DE SEGREDO: se encontrar qualquer `.env`, chave, token, senha, ou arquivo de credencial, NUNCA
leia/copie o conteúdo — só registre o caminho/nome do arquivo e o tipo aparente de segredo.

DOCUMENTAÇÃO: antes de escrever qualquer coisa, leia o padrão já existente em
dev-obsidian/lumos-gateway/04_Seguranca_Riscos/ (formato de achado: Tipo, Status
CONFIRMADO/PROVÁVEL/POSSÍVEL/INFORMATIVO, Severidade CRÍTICO/ALTO/MÉDIO/BAIXO/INFORMATIVO, Sistema
afetado, Categoria, Data de identificação, Descrição, Evidência, Cenário de risco, Impacto,
Pré-condições, Escopo afetado, Causa raiz, Correção sugerida, Dependências da correção, Riscos de
regressão, Como validar, Referências, Atualizações) e o índice mais recente
(auditoria-servidores-2026-09-18-resumo-consolidado.md) para não duplicar achados já registrados.
Para cada achado NOVO (que ainda não existe lá), crie uma nota nesse mesmo formato. Para um achado
que reconfirma algo já existente, apenas adicione uma linha em "Atualizações" na nota já existente,
não crie nota duplicada. Ao final, atualize/crie um novo resumo consolidado linkando tudo, e
atualize o Hub.md do projeto lumos-gateway se houver algo crítico novo.

Ao final, resuma em texto: o que foi checado, o que confirma achados já conhecidos, o que é novo, e
qual achado é mais urgente.
```

## Ver também

- [[../04_Seguranca_Riscos/auditoria-servidores-2026-09-18-resumo-consolidado|auditoria-servidores-2026-09-18-resumo-consolidado]] — baseline que este prompt serve para conferir/estender.
- [[../../_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]] — limite que este prompt respeita.

## Atualizações

- 2026-09-18: nota criada, a pedido do usuário, como prompt read-only para rodar a mesma auditoria de servidor em outro agente (Codex) — pedido original incluía DDoS/ataque ativo, recusado e substituído por esta versão observacional.
