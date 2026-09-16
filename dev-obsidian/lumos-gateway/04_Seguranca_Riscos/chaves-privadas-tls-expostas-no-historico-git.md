# Chaves privadas TLS (e chaves de conta ACME) commitadas e enviadas ao GitHub — duas vezes — recuperáveis do histórico

**Tipo:** Vulnerabilidade (exposição de segredo crítico / material criptográfico privado)
**Status:** CONFIRMADO — verificado diretamente no histórico Git, não só relatado por agente
**Severidade:** CRÍTICO
**Sistema afetado:** `lumos-gateway` (repositório próprio, `git@github.com:iamlucas1/lumos-gateway.git`)
**Categoria:** Secret exposure / supply chain de segredo / TLS
**Data de identificação:** 2026-08-18 (extensão da auditoria completa de segurança, ver [[../../farmaura/08_Skills_Agentes_Prompts/auditoria-completa-seguranca|prompt de auditoria completa]])

## Descrição

Chaves privadas TLS reais de domínios de produção — e chaves de conta ACME (Let's Encrypt) — foram commitadas neste repositório **duas vezes**, em incidentes separados por ~7 meses, e permanecem totalmente recuperáveis do histórico Git mesmo tendo sido removidas do HEAD nas duas ocasiões (nenhuma reescrita de histórico — `git filter-repo`/BFG — foi feita).

**Não copiei nenhum byte do conteúdo das chaves para esta nota nem para nenhum outro lugar** — a investigação foi limitada a nomes de arquivo, metadados de commit (autor/data/mensagem) e `git log`/`git show --stat`, nunca ao conteúdo dos arquivos `privkey*.pem`/`private_key.json`.

## Evidência (linha do tempo reconstruída via `git log`/`git show --stat`/`git merge-base --is-ancestor`)

1. **`7d97757` (2025-08-10, "Primeiro commit do gateway")** — commit inicial do repositório já inclui, em `certs/live/` e `certs/archive/`, os pares `fullchain.pem`+`privkey.pem` (chave privada real) para os domínios: `lumosmed.com.br`, `portal.lumosanalytics.com.br`, `whatsapp.lumosanalytics.com.br`, `adcrdf.com.br` — mais as chaves de conta ACME (`certs/accounts/.../private_key.json`) de **duas** contas Let's Encrypt (staging e produção).
2. **`a9a206d` (2025-10-06)** — um `.gitignore` com regra `certs/` é adicionado, que teria prevenido novos commits de material de certificado.
3. **`4211d22` (2026-01-17, "Retirando ignore")** — **o arquivo `.gitignore` inteiro é deletado** (não só a regra de certs — o arquivo todo, incluindo as regras de `.env`/logs/etc.), removendo a proteção.
4. **`2606920` (2026-01-18, "Removendo pasta certs")** — a pasta `certs/` é removida do rastreamento do Git (limpeza do HEAD), mas **sem restaurar nenhuma proteção de `.gitignore`** — a árvore de trabalho fica sem rede de segurança contra um novo `git add` amplo.
5. **`296e260` (2026-03-28, "chore: atualizações gerais")** — **segundo incidente**: um novo lote de certificados `certs/live/` (incluindo `privkey.pem`) é commitado — desta vez para `api.lumosanalytics.com.br` e vários subdomínios `dev.*` (`dev.adcrdf.com.br`, `dev.api.lumosanalytics.com.br`, `dev.cursocompany.app.br`, `dev.drathamaravasconcelos.com.br`, `dev.lumosmed.com.br`, `dev.whatsapp.lumosanalytics.com.br`). Isso só foi possível porque a proteção do `.gitignore` tinha sido removida dois meses antes (passo 3) e nunca restaurada até este ponto.
6. **`4c20217` (2026-05-01, "Parcial prontuario")** — a pasta `certs/` é removida de novo, e desta vez o `.gitignore` robusto atual (com cabeçalho explícito "Material TLS/PKI nunca deve ser versionado") é (re)introduzido — confirmado idêntico ao `.gitignore` presente no HEAD atual.
7. **HEAD atual (`30dbb27`, branch `master`)** — confirmado **sem nenhum arquivo `certs/`** na árvore (`git ls-tree -r HEAD --name-only | grep certs/` → vazio). O `.gitignore` atual protege corretamente contra recorrência.

**Confirmado que ambos os incidentes estão no histórico da branch `master` publicada (`origin/master`)** — `296e260` é ancestral confirmado do HEAD atual de `master`, e `7d97757` (primeiro commit do repositório) obviamente também. O repositório tem remote real no GitHub (`iamlucas1/lumos-gateway`); não foi verificado nesta auditoria se o repositório é público ou privado (fora do escopo de uma investigação read-only local — checar isso é um próximo passo simples via `gh repo view` ou a interface do GitHub).

## Cenário de risco

Qualquer pessoa com acesso de leitura ao repositório GitHub (colaborador atual, colaborador removido que não teve acesso revogado, ou qualquer visitante se o repositório já foi ou está público em algum momento) pode fazer `git log -p`/`git show` nos commits `7d97757` e `296e260` e extrair as chaves privadas reais dos domínios listados, além das chaves de conta ACME. Posse da chave privada de um domínio permite:
- Decifrar tráfego HTTPS capturado (se um atacante também conseguir posição de rede, ex.: MITM em rede compartilhada, ISP comprometido, ou tráfego já capturado e armazenado).
- Servir um certificado válido para esse domínio em um servidor controlado pelo atacante (impersonação/phishing indistinguível do site real para o navegador).
Posse da chave de conta ACME permite emitir/revogar certificados adicionais em nome da conta Let's Encrypt associada.

## Impacto

Comprometimento potencial da confidencialidade/integridade de TLS para: `lumosmed.com.br`, `portal.lumosanalytics.com.br`, `whatsapp.lumosanalytics.com.br`, `adcrdf.com.br`, `api.lumosanalytics.com.br`, e os subdomínios `dev.*` listados acima — inclui o domínio principal do produto LumosMed e o domínio de WhatsApp (`whatsapp.lumosanalytics.com.br`, provavelmente endpoint de webhook/integração sensível). Note-se que **nenhum domínio Farmaura aparece nesta lista** — a exposição não afeta diretamente `drogariafarmaura.com.br`, mas afeta serviços que compartilham o mesmo gateway físico/rede.

## Pré-condições

Acesso de leitura ao repositório `iamlucas1/lumos-gateway` no GitHub (a qualquer momento desde 2025-08-10 até hoje, já que a exposição nunca foi purgada do histórico) — não exige nenhuma outra ação além de clonar/navegar o histórico.

## Escopo afetado

Repositório `lumos-gateway` completo (histórico Git, branches `master` e `desenv`); certificados/chaves dos domínios listados na seção "Impacto"; contas ACME (Let's Encrypt) staging e produção associadas a este gateway.

## Causa raiz

Dupla causa, com um padrão recorrente evidenciado pela linha do tempo: (1) o modelo de deploy original do gateway tratava `certs/` como parte do repositório versionado em vez de volume Docker externo/secret manager (só corrigido definitivamente na segunda limpeza, `4c20217`); (2) a proteção de `.gitignore` que existia foi **deletada deliberadamente** (`4211d22`, "Retirando ignore") sem uma proteção substituta, criando uma janela de ~2 meses em que qualquer commit amplo (`git add .`) podia reintroduzir o mesmo problema — o que de fato aconteceu.

## Correção sugerida para análise futura

1. **Rotação de credenciais como prioridade máxima**: gerar novos certificados/chaves para todos os domínios listados (mesmo que o repositório seja privado — a chave já foi exposta a qualquer colaborador atual ou passado, e não há como confirmar retroativamente que nunca vazou por outro canal). Revogar os certificados antigos junto ao Let's Encrypt. Considerar também rotacionar/revalidar as contas ACME (chave de conta comprometida).
2. **Purga do histórico Git**: usar `git filter-repo` (ou BFG Repo-Cleaner) para remover definitivamente os blobs de `certs/` de todo o histórico das branches `master`/`desenv`, seguido de force-push coordenado e re-clone por todos os colaboradores — ação de alto impacto, requer decisão e execução explícita do usuário (fora do escopo desta auditoria observacional).
3. **Confirmar visibilidade do repositório** (`gh repo view iamlucas1/lumos-gateway` ou GitHub UI) — se já foi público em algum momento, considerar o vazamento como confirmado para qualquer pessoa que possa ter clonado nesse período, independente de mudar a visibilidade agora.
4. Já resolvido/em vigor: o `.gitignore` atual (desde `4c20217`) já protege corretamente contra recorrência — não precisa de mudança adicional nesse ponto, só reforçar via revisão de PR/hook local (`git secrets`/`pre-commit`) para pegar qualquer futura tentativa de `git add -f` sobre um padrão ignorado.

## Dependências da correção

Rotação de certificado depende de acesso ao Let's Encrypt/DNS dos domínios (fora do escopo desta auditoria). Purga de histórico depende de coordenação com todos que têm um clone local do repositório (force-push invalida clones existentes).

## Riscos de regressão

Rotação de certificado: risco de downtime se não coordenada com o deploy real (trocar certificado em produção exige restart/reload do nginx no momento certo). Purga de histórico: force-push é uma operação destrutiva para colaboradores com clone desatualizado — coordenar comunicação antes de executar.

## Como validar futuramente que a correção funcionou

1. Confirmar que os certificados ativos em produção (`lumos-prd`) foram de fato trocados (nova data de emissão, nova impressão digital/fingerprint) para todos os domínios listados.
2. Após a purga de histórico (se decidida), confirmar via `git log -p --all -- certs/` em um clone fresco que nenhum blob de chave privada é mais recuperável.
3. Confirmar que o `.gitignore` atual continua presente e cobrindo `certs/`/`*.pem`/`*.key` em qualquer PR futuro (idealmente via hook automatizado, não só revisão manual).

## Referências

- [[../../farmaura/05_Integracoes_Infra/Lumos_Gateway|farmaura/05_Integracoes_Infra/Lumos_Gateway]] — já teria uma referência prévia a este achado (wikilink pré-existente apontando para este mesmo nome de nota, agora preenchido).
- [[env-commitado-lumos-gateway]] — outro achado de segredo/configuração commitada no mesmo repositório, severidade bem menor.
- [[../../farmaura/08_Skills_Agentes_Prompts/auditoria-completa-seguranca|prompt de auditoria completa de segurança]].

## Atualizações

- 2026-08-18: achado registrado e verificado manualmente via `git log`/`git show --stat`/`git merge-base`, sem nunca extrair o conteúdo dos arquivos de chave privada.
