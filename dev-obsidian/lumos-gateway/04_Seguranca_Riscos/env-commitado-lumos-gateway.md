---
cssclasses: ia-nota
---

# `.env` do gateway está commitado no Git (despite `.gitignore`) — conteúdo atual é de baixa sensibilidade, mas o padrão é arriscado

**Tipo:** Vulnerabilidade (higiene de repositório / gitignore não retroativo)
**Status:** CONFIRMADO
**Severidade:** BAIXO-MÉDIO (conteúdo atual não é credencial real, mas o padrão do arquivo é propenso a acumular segredo real no futuro)
**Sistema afetado:** `lumos-gateway`
**Categoria:** Secret exposure (arquivo de configuração) / higiene de repositório
**Data de identificação:** 2026-08-18

## Descrição

O arquivo `.env` na raiz do `lumos-gateway` está rastreado pelo Git (`git ls-files | grep -x '\.env'` retorna `.env`) e presente no HEAD atual da branch `master`, apesar de `.gitignore` (desde a limpeza de `4c20217`, ver [[chaves-privadas-tls-expostas-no-historico-git]]) já listar `.env`/`.env.*` como ignorado. Isso é o padrão clássico de "`.gitignore` não é retroativo": o arquivo já estava rastreado antes da regra existir, e a regra de `.gitignore` não desfaz o rastreamento de um arquivo já commitado — só previne novos `git add` acidentais.

## Evidência

Inspecionei o conteúdo (não reproduzido aqui) só para classificar o tipo de dado, conforme a regra de nunca copiar segredo integralmente. **Nenhuma credencial real foi encontrada** — o arquivo contém somente: `ENVIRONMENT`, `LUMOS_API_PUBLIC_ENABLED`, um `*_PRIMARY_DOMAIN_BASE`/`*_DOMAINS_BASE` por tenant (nomes de domínio, não segredo), `CERTBOT_EMAIL` (endereço de e-mail — PII leve, não uma credencial), `CERTBOT_STAGING`, `CHECK_CERTS_ON_START`, `DUMMY_CERTS`, `FALLBACK_DOMAIN_BASE`. Nada equivalente a senha, chave de API, token ou segredo de assinatura.

## Cenário de risco

Hoje: nenhum vazamento de credencial real — apenas nomes de domínio (já públicos por natureza, são os próprios domínios servidos) e um e-mail de contato usado para notificações do Let's Encrypt. O risco real é comportamental: como o arquivo já está rastreado e "parece normal" no fluxo de trabalho do time, um valor sensível adicionado a esse mesmo `.env` no futuro (ex.: uma credencial de algum novo serviço/integração) tem alta chance de ser commitado por hábito, já que `git add .env` não vai gerar nenhum aviso — o arquivo já é rastreado, `.gitignore` não bloqueia atualização de arquivo já rastreado.

## Impacto

Baixo hoje (nenhum segredo real exposto). Risco latente de se tornar um vazamento real na próxima vez que uma variável sensível for adicionada a esse arquivo.

## Pré-condições

Nenhuma para o estado atual. O risco latente se materializa na próxima adição de uma variável sensível a esse mesmo `.env` sem que alguém perceba que o arquivo já está fora do controle do `.gitignore`.

## Escopo afetado

`lumos-gateway/.env` (raiz do repositório).

## Causa raiz

O arquivo foi commitado antes de existir qualquer regra de `.gitignore` cobrindo `.env` (ou foi commitado durante uma das janelas sem `.gitignore`, ver linha do tempo em [[chaves-privadas-tls-expostas-no-historico-git]]) e nunca foi destrackeado (`git rm --cached`) depois que a regra passou a existir.

## Correção sugerida para análise futura

`git rm --cached .env` (remove do rastreamento sem apagar o arquivo local) + commit — a partir daí o `.gitignore` já existente passa a proteger de verdade. Criar um `.env.example` (se ainda não existir) com os nomes de variável e valores placeholder, para documentar o formato esperado sem versionar o real.

## Dependências da correção

Nenhuma migration. Coordenar com quem faz deploy (`scripts/domain_context.sh` e outros consomem esse `.env`) para garantir que o arquivo real continue presente no servidor mesmo depois de destrackeado do Git (ele precisa continuar existindo localmente/no servidor, só não mais versionado).

## Riscos de regressão

Baixo — `git rm --cached` não apaga o arquivo do disco, só para de rastreá-lo; o deploy real não é afetado desde que o arquivo continue existindo nos servidores.

## Como validar futuramente que a correção funcionou

`git ls-files | grep -x '\.env'` deve retornar vazio após a correção; confirmar que o gateway continua subindo normalmente (`docker compose up`) com o `.env` local ainda presente, só não mais versionado.

## Referências

- [[chaves-privadas-tls-expostas-no-historico-git]] — achado relacionado, mesma linha do tempo de `.gitignore` no mesmo repositório.

## Atualizações

- 2026-08-18: achado registrado.