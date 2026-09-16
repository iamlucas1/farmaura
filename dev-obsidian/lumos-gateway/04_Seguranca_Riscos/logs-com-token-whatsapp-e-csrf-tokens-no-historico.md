# Logs de acesso/erro commitados no primeiro commit contêm token real de verificação do webhook WhatsApp + tokens CSRF de sessões reais

**Tipo:** Vulnerabilidade (exposição de segredo em histórico Git)
**Status:** CONFIRMADO — verificado diretamente no histórico Git, valores nunca reproduzidos nesta nota
**Severidade:** ALTO
**Sistema afetado:** `lumos-gateway`
**Categoria:** Secret exposure (log de acesso commitado)
**Data de identificação:** 2026-08-19

## Descrição

`logs/access.log` (53.686 linhas) e `logs/error.log` (20.895 linhas) foram commitados no mesmo commit inicial que expôs as chaves privadas TLS (`7d97757`, 2025-08-10, "Primeiro commit do gateway" — ver [[chaves-privadas-tls-expostas-no-historico-git]]) e removidos no mesmo commit de limpeza (`2606920`, 2026-01-18, "Removendo pasta certs"). Diferente das chaves TLS, esses logs **não foram re-commitados** no segundo incidente de março/2026 — é uma exposição de uma janela só, mas continua 100% recuperável do histórico Git (nenhuma reescrita de histórico foi feita).

`access.log` contém, em múltiplas linhas, requisições reais a `GET /whatsapp_webhook?hub.verify_token=<valor>` e `GET /webhook?hub.verify_token=<mesmo valor>` a partir do domínio `whatsapp.lumosanalytics.com.br` — esse é o `verify_token` configurado no app da Meta (WhatsApp Business API) para validar o handshake inicial do webhook. Também há, em requisições a `portal.lumosanalytics.com.br/consulta/`, múltiplos `csrf_token=<valor>` de sessões reais de usuário (datadas de 2025-06-22).

**Nenhum valor foi reproduzido nesta nota nem em nenhum outro lugar.**

## Evidência

Confirmado via `git log -p --all` sobre o commit `7d97757`, localizando as linhas com `hub.verify_token=` e `csrf_token=` nos arquivos `logs/access.log`/`logs/error.log`. Varredura adicional por outros padrões de segredo (chave AWS `AKIA...`, GitHub PAT `ghp_...`, Slack `xox...`, OpenAI-style `sk-...`, Google API key `AIza...`, connection string com credencial, bloco `BEGIN OPENSSH PRIVATE KEY`) no restante desses arquivos e do histórico geral retornou **zero ocorrências** — o restante do conteúdo desses logs é majoritariamente ruído de scanner automatizado contra o servidor (parâmetros sintéticos como `?jwt=abc.def.ghi`/`?access_token=a.b.c` gerados por ferramentas de varredura de vulnerabilidade, não segredos reais da aplicação).

## Cenário de risco

Qualquer pessoa com acesso de leitura ao histórico deste repositório (mesma exposição documentada para as chaves TLS — colaborador atual, colaborador removido sem revogação de acesso, ou qualquer visitante caso o repositório já tenha sido público) pode extrair o `verify_token` do webhook do WhatsApp.

## Impacto

- Posse do `verify_token` sozinha não permite assinar/re-registrar o webhook (isso exige acesso ao painel Meta for Developers da conta), mas é um segredo de configuração que deve ser tratado como comprometido — se ainda for o valor ativo em produção, precisa ser rotacionado.
- Os `csrf_token` capturados são de sessões de 2025-06-22, provavelmente já expiradas/inválidas hoje — impacto residual baixo, mas não confirmável sem acesso ao estado real de sessão em produção (fora do escopo desta auditoria observacional).

## Pré-condições

Acesso de leitura ao histórico do repositório (qualquer momento desde 2025-08-10).

## Escopo afetado

`logs/access.log`, `logs/error.log` (só no histórico, já removidos do HEAD); integração de webhook WhatsApp de `whatsapp.lumosanalytics.com.br`.

## Causa raiz

Mesma causa raiz do achado das chaves TLS: a pasta `logs/` fazia parte do primeiro commit do repositório, antes de existir qualquer `.gitignore` cobrindo `*.log` — a regra `*.log` só passou a existir no `.gitignore` atual (pós-limpeza de maio/2026).

## Correção sugerida para análise futura

1. Tratar o `hub.verify_token` do webhook WhatsApp como comprometido e rotacionar no painel da Meta for Developers + na configuração do serviço que valida esse webhook (fora deste repositório).
2. A purga de histórico já recomendada para as chaves TLS (`git filter-repo`/BFG) pode cobrir `logs/` na mesma operação, já que ambos compartilham a mesma janela temporal de exposição (mesmo commit de adição, mesmo commit de remoção).

## Dependências da correção

Rotação do token depende de acesso ao painel Meta for Developers da conta associada — fora do escopo desta auditoria observacional. Purga de histórico depende de coordenação com colaboradores (force-push invalida clones locais).

## Riscos de regressão

Rotação do `verify_token`: exige atualizar simultaneamente o valor no painel da Meta e na configuração do serviço consumidor, para não quebrar o webhook durante a troca.

## Como validar futuramente que a correção funcionou

Confirmar no painel da Meta for Developers que o `verify_token` foi trocado e que o webhook continua validando handshakes normalmente após a rotação.

## Referências

- [[chaves-privadas-tls-expostas-no-historico-git]] — mesma janela temporal de exposição, mesmo padrão de causa raiz.

## Atualizações

- 2026-08-19: achado registrado, valores nunca reproduzidos.
