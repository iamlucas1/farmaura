---
cssclasses: ia-nota
---

# Dezenas de arquivos `.env`/`.env_old` de stacks descontinuadas, nunca higienizados, em `/opt/old/` (`lumos-prd`) e `/opt/sites_antigos/` (`lumos-dev`)

**Tipo:** Vulnerabilidade (higiene de servidor / segredo esquecido)
**Status:** CONFIRMADO (existência dos arquivos) / não avaliado (conteúdo — ver nota abaixo)
**Severidade:** ALTO
**Sistema afetado:** host (SO) de `lumos-prd` e `lumos-dev` — arquivos de stacks antigas de múltiplos produtos
**Categoria:** Secret exposure / backups e arquivos esquecidos
**Data de identificação:** 2026-09-18

## Descrição

Os dois servidores mantêm um diretório de "versões antigas" de deploys já descontinuados, cheio de arquivos `.env`/`.env_old`/variantes nunca removidos:

**`lumos-prd` — `/opt/old/`:**
```
/opt/old/thamara/.env
/opt/old/lumos-portal/.env
/opt/old/lumos-portal/.env_old_old
/opt/old/lumos-portal/.env_old
/opt/old/lumos-site/.env
/opt/old/lumos-gateway/.env
/opt/old/lumos-horizon/.env
/opt/old/lumos-whatsapp/.env
/opt/old/lumos-whatsapp/.env_old
```

**`lumos-dev` — `/opt/sites_antigos/`:**
```
/opt/sites_antigos/lumos-portal_antigo/.env_old
/opt/sites_antigos/lumos-portal_antigo/.env_old4
/opt/sites_antigos/lumos-portal_antigo/.env_old3
/opt/sites_antigos/lumos-portal_antigo/.env
/opt/sites_antigos/lumos-portal_antigo/.env_old2
/opt/sites_antigos/lumos-portal_antigo/.env.swp   (swap file de edição do Vim — indício de edição manual em algum momento)
/opt/sites_antigos/lumos-gateway_old/.env
/opt/sites_antigos/lumos-portal-api/.env
/opt/sites_antigos/lumos-api_old/.env_old
/opt/sites_antigos/lumos-api_old/.env
/opt/sites_antigos/lumos-api_old/.env.api.example
/opt/sites_antigos/lumos-site_old/.env
/opt/sites_antigos/lumos-whatsapp/.env_old
/opt/sites_antigos/lumos-whatsapp/.env
/opt/sites_antigos/lumos-portal-api_old/.env
/opt/sites_antigos/thamara_old/.env
```

Nenhum container correspondente a essas stacks está em execução hoje (`docker ps -a` não lista containers parados equivalentes) — são apenas os arquivos de configuração, deixados no disco.

## Evidência

`find /opt -maxdepth 3 -iname '.env*'` nos dois servidores (comando de listagem, não de leitura de conteúdo). **O conteúdo desses arquivos não foi lido** — só a existência/nome foi confirmado, seguindo a regra de nunca reproduzir segredo (e, neste caso, nem sequer abrir o arquivo até haver decisão de tratamento). A avaliação de severidade abaixo é conservadora, assumindo que arquivos `.env` de produtos como `lumos-whatsapp` (integração com WhatsApp Business API) e `lumos-portal`/`lumos-api` costumam conter credenciais reais (mesmo padrão já confirmado historicamente no achado [[chaves-privadas-tls-expostas-no-historico-git]] e no incidente documentado em [[../../_Compartilhado/POPs_Processos/resposta-a-chave-tls-exposta-em-git|resposta-a-chave-tls-exposta-em-git]]).

## Cenário de risco

Um segredo de uma integração descontinuada localmente (ex.: token do WhatsApp Business API, credencial de banco de uma versão antiga do portal) pode continuar **válido no serviço remoto** mesmo depois que a stack local parou de rodar — "descontinuar" localmente não revoga automaticamente nada do lado do provedor. Se o servidor for comprometido (via o achado [[ssh-root-login-por-senha-exposto-nos-dois-servidores]], por exemplo, ou qualquer outro vetor), esses arquivos são um alvo óbvio de coleta — muito mais fácil de encontrar do que segredos "vivos" espalhados dentro de containers, já que estão soltos em texto plano no filesystem do host, fora de qualquer rede Docker isolada.

## Impacto

Depende do conteúdo real (não avaliado) — potencialmente alto se algum desses `.env` contiver uma credencial de um serviço de terceiro (WhatsApp, banco de dados, e-mail) ainda ativa. Mesmo no pior caso em que todos já estejam invalidados, o padrão de nunca limpar segredos de deploys antigos é, por si, um risco recorrente que se repete a cada nova "versão antiga" gerada.

## Pré-condições

Acesso de leitura ao filesystem do servidor (root, ou qualquer comprometimento parcial que permita ler arquivos como root/owner desses diretórios).

## Escopo afetado

`/opt/old/*` (`lumos-prd`), `/opt/sites_antigos/*` (`lumos-dev`) — múltiplos produtos: `thamara`, `lumos-portal`/`lumos-portal-api`, `lumos-site`, `lumos-gateway` (versão antiga, distinta do `lumos-gateway` ativo), `lumos-horizon`, `lumos-whatsapp`, `lumos-api` (versão antiga).

## Causa raiz

Prática recorrente de renomear/mover a pasta de uma stack para "antigo"/"old" ao substituí-la por uma nova versão, sem excluir nem rotacionar os segredos que ficaram para trás — nenhum processo de "desligamento" (`07_POPs_Processos/`) cobre isso hoje.

## Correção sugerida para análise futura

1. Levantar, para cada `.env` acima, se o serviço/integração correspondente ainda está ativo do lado do provedor (WhatsApp Business API, bancos de dados, etc.) e rotacionar/revogar toda credencial que ainda seja válida, mesmo que o deploy local já esteja morto.
2. Depois de confirmado que nada mais depende deles, remover fisicamente os diretórios `/opt/old/`/`/opt/sites_antigos/` (ou ao menos os arquivos `.env*` dentro deles) dos dois servidores.
3. Criar um POP em `07_POPs_Processos/` para "descontinuar uma stack" que inclua explicitamente: rotacionar segredos associados, depois remover (não só renomear) os arquivos de configuração.
4. Nunca mais renomear uma pasta ativa para "_old" como forma de "desligar" — preferir remover de fato depois de confirmar que a nova versão está estável, ou mover para um local com controle de acesso mais restrito e um prazo de expurgo definido.

## Dependências da correção

Nenhuma técnica direta — depende só de tempo para auditar cada `.env` individualmente e confirmar com os provedores externos (Meta/WhatsApp, etc.) se as credenciais ainda existem/estão ativas antes de decidir revogar.

## Riscos de regressão

Baixo — nenhum container ativo depende desses arquivos hoje (confirmado via `docker ps -a`); remover não deve afetar nada em produção/dev.

## Como validar futuramente que a correção funcionou

`find /opt -iname '.env*' -path '*old*'` (e equivalente para `sites_antigos`) deve retornar vazio nos dois servidores; confirmar com os provedores externos relevantes que as credenciais antigas foram revogadas/rotacionadas, não só apagadas localmente.

## Referências

- [[chaves-privadas-tls-expostas-no-historico-git]] — precedente de segredo real exposto neste mesmo ecossistema.
- [[ssh-root-login-por-senha-exposto-nos-dois-servidores]] — um dos vetores que tornaria esses arquivos acessíveis a um atacante.
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18: achado registrado.
