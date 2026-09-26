---
cssclasses: ia-nota
---

# dev-obsidian — Guia de Governança

Este cofre Obsidian é a base de conhecimento viva para **qualquer projeto de desenvolvimento** do usuário — não é exclusivo de um produto. Vive dentro do repositório git `~/Documentos/desenvolvimento/dev` (não é um repositório separado), na pasta `dev-obsidian/`, porque esse repositório já hospeda várias pastas/stacks (`farmaura/`, `farmaura-api/`, `docker/`, etc.).

## Organização: projeto primeiro

A raiz do cofre é organizada **por projeto**, não por categoria. Cada projeto é uma pasta autocontida com as mesmas 8 categorias numeradas dentro, e a chave da pasta é **o nome do produto/projeto**, não o nome do repositório que o hospeda — um projeto reúne front e back juntos. Chaves de projeto existentes:

- **`farmaura/`** — produto Farmaura: frontend (`farmaura/react/`), backend (`farmaura-api/`) e infra própria (`docker/`) neste repositório.
- **`lumosmed/`** — produto LumosMed: site + portal BFF em Laravel (repositório próprio, aninhado neste), consumindo o domínio `lumosmed` do serviço Python `lumos-api`. Deliberadamente enxuto aqui: a documentação profunda (mirror de código, padronizações de UI) já vive no cofre irmão `lumos-obsidian` (`~/Documentos/desenvolvimento-lumos/lumos-obsidian`) — não duplicar, só linkar.

As skills reutilizáveis de agentes ficam em `_Compartilhado/Skills/` e **não** são uma chave de projeto — não são código de produto de ninguém. Cada skill mantém uma nota `<skill-name>.md` para pessoas e a definição executável `<skill-name>/SKILL.md` para agentes. `agent.md` e `claude.md`, na raiz do repositório, apontam para essas definições e tornam sua leitura obrigatória antes de trabalho técnico aplicável.

Outros produtos ganham sua própria pasta com a mesma chave do produto quando fizerem sentido neste cofre. Por padrão, criar apenas as subpastas de categoria que tiverem conteúdo real, não as 8 de uma vez — exceção feita para `farmaura/` e `lumosmed/`, onde todas as categorias foram criadas de uma vez com um `_Template.md` pronto a pedido do usuário (ver seção "Templates" abaixo).

Este cofre é a fonte de verdade para skills reutilizáveis e para histórico de decisões, contexto de negócio, documentação viva, padrões/políticas específicas, riscos e segurança, integrações, pendências e processos. `claude.md` e `agent.md` devem conter apenas o protocolo para localizar e aplicar as skills, sem duplicar suas regras operacionais.

## Estrutura de cada projeto (`<projeto>/`)

- **`Hub.md`** — ponto de entrada do projeto: o que é, onde fica o repositório, estrutura principal, links de navegação para as categorias abaixo.
- **`00_Decisoes/`** — ADRs (Architecture Decision Records) técnicos. Uma nota por decisão relevante: contexto, alternativas consideradas, decisão tomada, consequências. Nome do arquivo: `AAAA-MM-DD-titulo-curto.md`.
- **`01_Contexto_Usuario/`** — **SOMENTE LEITURA para IA.** Contexto de negócio, prioridades e regras escritas exclusivamente pelo usuário humano. Ver `_LEIA-ME_IA.md` dentro da pasta.
- **`02_Documentacao/`** — Documentação técnica viva: arquitetura, visão geral, módulos, decisões estruturais. Não é espelho arquivo-a-arquivo do código — para detalhe de implementação, ler o código-fonte diretamente.
- **`03_Padroes_Politicas/`** — Padrões técnicos, políticas, premissas assumidas e regras de negócio que **não** estão cobertos pelo `claude.md`/`agent.md` do repositório do projeto. Evitar duplicar o que já é regra estática lá.
- **`04_Seguranca_Riscos/`** — Achados de segurança, vulnerabilidades, registro de riscos, exceções aceitas conscientemente, runbooks de incidente. Não repetir o baseline de segurança genérico já documentado no repositório do projeto.
- **`05_Integracoes_Infra/`** — APIs (internas e de terceiros), integrações entre sistemas, bancos de dados utilizados e infraestrutura (hospedagem, filas, cache, storage). Contrato e propósito de cada peça, nunca credenciais.
- **`06_Pendencias/`** — Itens em aberto, débito técnico conhecido, follow-ups combinados que ainda não viraram trabalho ativo.
- **`07_POPs_Processos/`** — Procedimentos operacionais padrão e processos específicos do projeto (ex: como fazer deploy, como rodar uma migration manual, checklist de release).

Categoria opcional, só quando houver conteúdo genuinamente específico do projeto (o genérico/reaproveitável vai em `_Compartilhado/`, não aqui):

- **`08_Skills_Agentes_Prompts/`** — skills, agentes ou prompts que só fazem sentido *neste* projeto.

## `_Compartilhado/` — biblioteca para copiar em outros projetos

Pasta na raiz do cofre, sem vínculo a nenhum projeto específico. Guarda conteúdo genérico e reutilizável que o usuário copia manualmente (arquivo ou pasta) para outro repositório/vault quando precisar — a IA não grava fora deste repositório automaticamente, então a cópia em si é sempre uma ação manual do usuário.

- **`Skills/`** — biblioteca canônica de skills reutilizáveis. Cada skill tem uma nota humana `<skill-name>.md` e uma definição operacional `<skill-name>/SKILL.md`, lida e executada pelos agentes conforme o protocolo de `agent.md` e `claude.md`.
- **`Agentes/`** — definições/prompts de agentes genéricos, não amarrados a um domínio de produto.
- **`Prompts/`** — biblioteca canônica de prompts reutilizáveis. Cada prompt tem uma nota humana `<prompt-name>.md` e um arquivo operacional `<prompt-name>/PROMPT.md`, lido e executado por agentes quando for aplicável ou explicitamente solicitado.
- **`Padroes_Politicas/`** — padrões técnicos e políticas genéricas aplicáveis a qualquer projeto novo (baseline de segurança, convenções de commit, etc.).
- **`POPs_Processos/`** — procedimentos operacionais e templates de processo genéricos (ex: como abrir um ADR, POP de resposta a incidente).

Ver `_Compartilhado/README.md` para detalhes.

## Templates

Cada categoria numerada (`00_Decisoes/` a `08_Skills_Agentes_Prompts/`, em `farmaura/` e `lumosmed/`) e cada subpasta de `_Compartilhado/` contém um `_Template.md` com instruções de preenchimento e os links relevantes para as demais categorias. Ao criar uma nota real:

1. Copiar o `_Template.md` da categoria.
2. Renomear a cópia com um nome descritivo (ADRs em `00_Decisoes/` seguem `AAAA-MM-DD-titulo-curto.md`; as demais categorias usam um título curto em texto normal).
3. Preencher e apagar as instruções em bloco de citação (`>`).
4. Deixar o `_Template.md` original intacto na pasta, para a próxima nota.

## Log diário de chat

Em `_Logs_Chat/` (pasta exclusiva na raiz do cofre, fora da estrutura por projeto), cada conversa com um agente neste repositório é gravada automaticamente por um hook `Stop`, tanto no Claude Code (`.claude/hooks/chat_daily_log.py`, registrado em `.claude/settings.json`) quanto no Codex CLI (`.codex/hooks/chat_daily_log.py`, registrado em `.codex/hooks.json`, ao lado do hook existente do skill `impeccable`). Não é uma categoria numerada nem passa pelo fluxo de `_Template.md` — é um log bruto, não uma nota curada.

- **Estrutura**: `_Logs_Chat/AAAA-MM-DD/<ferramenta>-<projeto>-<sufixo>.md` — uma subpasta por dia (data do primeiro turno real da sessão), e dentro dela um arquivo por chat aberto (sessão), para o usuário poder ter vários chats abertos ao mesmo tempo (inclusive Claude Code e Codex simultaneamente) sem misturar o conteúdo. `<ferramenta>` é `claude` ou `codex`; `<projeto>` vem do diretório de trabalho **de origem** da sessão (o cwd registrado no início do transcript, não o cwd corrente — um `cd` feito num comando Bash no meio da conversa não muda o arquivo); `<sufixo>` são os 8 primeiros caracteres do `session_id`, a chave que diferencia duas sessões abertas no mesmo projeto no mesmo dia.
- **Conteúdo**: toda mensagem do usuário e toda resposta em texto do agente naquela sessão, verbatim, uma seção `## Turno N · HH:MM` por turno (número sequencial + horário real da mensagem, extraído do próprio transcript, não o horário em que o hook rodou). Conteúdo de chamadas de ferramenta (leitura de arquivo, comandos, etc.) não é gravado, só o texto visível da conversa — inclusive as atualizações de progresso intermediárias e a resposta final do turno.
- **Ruído removido (Claude Code)**: tags de sistema injetadas nas mensagens (`<system-reminder>`, `<ide_selection>`, `<ide_opened_file>`, etc.) são removidas antes de gravar — best effort via regex, pode sobrar ruído pontual. O transcript do Codex CLI já vem sem esse tipo de injeção (usa eventos `UserMessage`/`AgentMessage` próprios), então não precisa desse filtro.
- **Reconstrução completa, não append incremental**: a cada disparo do `Stop`, o hook relê o transcript inteiro da sessão e **reescreve o arquivo do zero** (não faz append com cursor). Isso é proposital: o `Stop` pode disparar mais de uma vez para o mesmo turno lógico (ex: skills longas com muitas chamadas de ferramenta, aprovações no meio do caminho), e um cursor incremental perde ou fragmenta conteúdo quando isso acontece — foi exatamente esse bug (turnos com resposta cortada, faltando o resumo final) que motivou essa reescrita do hook em 2026-09-21. Reprocessar o transcript inteiro é barato (sessões têm no máximo alguns milhares de linhas) e sempre produz o resultado correto, não importa quantas vezes o hook já rodou.
- **Espera por estabilidade do transcript**: antes de ler, o hook checa se o tamanho do arquivo do transcript parou de crescer (até 1,5s de espera). O `Stop` dispara quase no mesmo instante em que a última mensagem é gravada em disco; sem essa espera, o hook podia ler o transcript alguns milissegundos cedo demais e perder a resposta final do turno (mesmo bug de 2026-09-21, causa raiz diferente da fragmentação por cursor).
- **Anexos (imagem, PDF, etc.)**: quando a mensagem do usuário traz um arquivo embutido (imagem colada/anexada, PDF), o hook extrai os bytes do transcript e salva em `_Logs_Chat/AAAA-MM-DD/attachments/<ferramenta>-<projeto>-<sufixo>-<turno>-<n>.<ext>`, referenciado inline no `.md` (`![imagem anexada](...)` para imagens, link simples para os demais tipos). Cobre o que os dois transcripts realmente embutem como dado bruto (imagem confirmada nos dois; PDF suportado pelo mesmo mecanismo genérico, ainda não visto num transcript real). Arquivos como DOCX/XLSX **não** são embutidos assim nos transcripts das duas ferramentas até onde foi observado — se o usuário referenciar um desses, o conteúdo tende a chegar como texto lido por uma tool call, não como anexo binário; nesse caso não há nada para extrair (o texto já normal do turno cobre isso).
- **Mensagens enviadas no meio do turno (Claude Code)**: se o usuário manda mais instruções enquanto o Claude ainda está respondendo à mensagem anterior, o Claude Code absorve isso no turno em andamento em vez de criar um turno novo — e representa isso no transcript como uma entrada `attachment` do tipo `queued_command` (`operation: "remove", reason: "absorbed_mid_turn"` no `queue-operation` correspondente), não como uma entrada `user` normal. O hook reconhece esse formato e mescla o texto (e eventuais anexos) dentro do `**Você:**` do turno que estava aberto naquele momento, marcado com `_(mensagem enviada enquanto eu ainda respondia)_`. Ainda não foi observado o equivalente no Codex CLI (nenhuma sessão local tem esse padrão) — se aparecer lá, precisa de investigação própria antes de implementar.
- **Automático**: a IA não precisa lembrar de atualizar isso a cada resposta; o hook roda sozinho ao final de cada turno, nas duas ferramentas. Se o hook falhar (script ausente, `python3` indisponível, hook do Codex ainda não aprovado — ver abaixo), a conversa simplesmente não é logada — não bloqueia nem interrompe a sessão.
- **Retomada de sessão**: como a chave é o `session_id`, retomar uma sessão continua reescrevendo o mesmo arquivo em vez de criar um novo.
- **Aprovação do hook no Codex**: hooks de projeto no Codex CLI exigem confirmação na primeira vez que o arquivo (ou seu hash) muda — use `/hooks` na sessão interativa do Codex para revisar e confiar em `.codex/hooks/chat_daily_log.py` depois de qualquer alteração nele. Sem isso, o hook é ignorado silenciosamente.
- Arquivos `AAAA-MM-DD.md` (sem sufixo de ferramenta/projeto/sessão) na raiz do cofre são anteriores a essa convenção — cópias manuais de respostas específicas do chat, não o log completo.
- **Nunca editar manualmente** os arquivos gerados por esses hooks — qualquer edição manual é sobrescrita no próximo turno, já que o hook reconstrói o arquivo inteiro a partir do transcript real a cada disparo.

## Log diário de execução

Mesmos hooks `Stop` do log de chat acima também escrevem, no mesmo disparo, um segundo log em `_Logs_Execucao/AAAA-MM-DD/<ferramenta>-<projeto>-<sufixo>.md` (mesma estrutura de pastas/nomes de `_Logs_Chat/`, mesma sessão) — um rastro técnico separado da conversa em si: comandos rodados na máquina, quais arquivos foram tocados (e como) e o estado do git, sem duplicar o conteúdo do código (isso já é rastreável pelo próprio git). Só é criado quando a sessão de fato rodou um comando ou tocou em algum arquivo — uma sessão puramente conversacional (sem nenhuma ferramenta) não gera esse arquivo.

- **Por turno**: uma seção `## Turno N · HH:MM` (mesmo número e horário do turno correspondente no log de chat — ver "Links entre chat e execução" abaixo) com:
  - **Comandos**: cada comando Bash executado (Claude Code) ou `CommandExecution` (Codex), com a descrição curta quando existe, e a saída — truncada em ~1500 caracteres para não inflar o arquivo, com nota de quantos caracteres tinha no total. Marca `falhou` quando o comando terminou em erro.
  - **Arquivos**: caminho do arquivo + o que aconteceu com ele — `leitura` (Claude Code, via tool `Read`), `criado` (arquivo novo), `sobrescrito`/`editado` (arquivo já existente) ou `removido` (Codex, `FileChange` tipo `delete`). A distinção criado×sobrescrito vem de `toolUseResult.type` (`create`/`update`) no Claude Code e do `type` de cada mudança (`add`/`update`/`delete`) no Codex FileChange. No Codex, leituras de arquivo não têm um evento próprio (tipicamente acontecem via `cat`/`sed` etc.) — aparecem como comando, não nesta lista.
  - **Diff (como estava antes × como ficou depois)**: logo abaixo da lista de arquivos do turno, cada arquivo com uma mudança real ganha um diff estilo git (`-`/`+` por linha, gerado por `difflib.unified_diff`). Para `Edit` (Claude Code) vem direto do `old_string`/`new_string` que a própria ferramenta já registra — não precisa reconstruir o arquivo inteiro. Para `Write`/criação de arquivo e para o `FileChange` do Codex, o hook mantém um mapa **só em memória, só durante essa reconstrução** de "último conteúdo visto por caminho" nesta sessão (populado por `Read`/`Write`/`Edit` no Claude Code, por `FileChange` no Codex) — se uma sessão sobrescreve um arquivo (`Write`) sem tê-lo lido ou escrito antes nesse mesmo processamento, não há "antes" pra comparar, e a nota `(conteúdo anterior não capturado nesta sessão — sem diff)` aparece no lugar. Arquivo novo (`criado`) sempre tem diff — todo o conteúdo aparece como adição, igual ao `git diff` mostra pra um arquivo novo.
- **Estado do git**: uma linha no cabeçalho do arquivo com branch, commit curto e se a árvore está suja — lida do repositório no disco (`git rev-parse`/`git status`) no momento em que o hook roda, não reconstruída do transcript. Como o arquivo é reescrito do zero a cada disparo (mesmo motivo do log de chat — ver acima), essa linha sempre reflete o estado **mais recente**, não um histórico por turno; para saber o que mudou em cada turno, usar junto com `git log`/`git diff` no repositório real.
- Roda no mesmo hook do log de chat (não é um hook separado) — se o hook falhar, os dois logs ficam desatualizados juntos.

## Links entre chat e execução

Os dois logs (chat e execução) numeram os turnos igual — `## Turno N · HH:MM`, mesmo texto de cabeçalho nos dois arquivos — e cada um linka para o turno correspondente no outro:

- No log de **chat**, todo turno que teve alguma ação (comando ou arquivo) ganha um link `🔧 ver execução deste turno` logo abaixo do título, indo para `_Logs_Execucao/.../mesmo-arquivo#Turno N · HH:MM`. Turnos sem nenhuma ação (só conversa) não ganham esse link, porque não existe seção correspondente no log de execução.
- No log de **execução**, todo turno (por definição, só existem turnos com ação nesse arquivo) ganha um link `💬 ver conversa deste turno`, de volta pro mesmo turno no log de chat.
- Cada arquivo também linka pro outro no cabeçalho (`Log de execução:` / `Log de chat:`), pra abrir o par inteiro sem precisar navegar turno a turno.
- **Importante para manter isso funcionando**: o texto do heading (`Turno N · HH:MM`, gerado por `turn_heading()` nos dois hooks) precisa ser **idêntico** nos dois arquivos pro link `#Turno N · HH:MM` resolver — qualquer mudança de formato do heading tem que ser feita nos dois hooks (`.claude/hooks/chat_daily_log.py` e `.codex/hooks/chat_daily_log.py`) ao mesmo tempo, senão os links quebram silenciosamente (Obsidian não avisa, só não navega pro lugar certo).

## Aparência dos logs automáticos

Os hooks marcam cada arquivo com `cssclasses: ia-nota chat-log` (logs de chat) ou `ia-nota exec-log` (logs de execução) e envolvem trechos específicos em `<span>` com classes próprias — HTML inline dentro do markdown, que o Obsidian renderiza normalmente sem afetar o conteúdo em volta (código, listas, links e wikilinks continuam funcionando dentro do mesmo parágrafo). Classes usadas:

- `chat-role-user` / `chat-role-ai` — rótulo "Você"/"Claude"/"Codex" no log de chat.
- `chat-empty` — nota "(sem texto — turno automático/sistema)".
- `chat-command` — ativação de slash command (skill, prompt) no log de chat (Claude Code): o transcript representa isso como `<command-name>`/`<command-args>`, não como texto livre; sem tratamento especial, essas tags eram removidas como ruído e a mensagem aparecia vazia ("sem texto"). `extract_command_invocation()` reconhece o padrão e mostra `/nome args` como badge em vez de deixar sumir. Ainda não observado no Codex CLI — o transcript dele não embrulha slash commands nesse formato.
- `chat-midturn-note` — nota de mensagem enviada enquanto o turno anterior ainda estava em andamento.
- `log-crosslink` — a linha de link entre o turno de um log e o turno correspondente no outro (ver seção "Links entre chat e execução" acima), nos dois logs.
- `exec-section` — os rótulos "Comandos"/"Arquivos" no log de execução.
- `exec-file-op` + um modificador (`exec-file-op-read`, `-create`, `-update`, `-delete`) — o rótulo de cada operação de arquivo (leitura/criado/sobrescrito·editado/removido).
- `exec-fail` — marca de comando que terminou em erro.
- `chat-diff` (bloco) com `diff-add`/`diff-del`/`diff-hunk`/`diff-file`/`diff-ctx` por linha — o diff de cada arquivo alterado. Renderizado como HTML próprio (`<pre class="chat-diff">`, não um bloco ` ```diff `) porque assim a cor não depende de qual realce de sintaxe o Obsidian aplicar a blocos de código "diff" — o hook já escapa o conteúdo (`html.escape`) e classifica cada linha pelo prefixo (`+`/`-`/`@@`/`---`/`+++`). Verde para adição, vermelho para remoção (tons mais claros automaticamente no tema escuro, via `.theme-dark`).

O snippet `.obsidian/snippets/logs-chat.css` (ativo via `appearance.json`, ao lado de `autoria-cores.css`) estiliza tudo isso: os `## Turno N · HH:MM` viram um selo compacto para marcar a virada de turno, o separador `---` fica mais discreto, os rótulos de quem falou e as operações de arquivo viram pílulas coloridas (reaproveitando as mesmas cores de `autoria-cores.css` — azul para usuário, laranja para IA/edição, verde para criação, vermelho para remoção/falha), a mensagem enviada no meio do turno ganha destaque com borda tracejada, e os links cruzados ficam discretos (texto pequeno, cor neutra) logo abaixo do título do turno. Ao alterar o formato de saída dos hooks (`chat_daily_log.py`), manter esses seletores em mente — mudar o nome de uma classe em um lado sem atualizar o outro quebra a estilização silenciosamente (sem erro, só some o efeito visual).

## Registro de Atualizações

Estas categorias mantêm documentação **viva**, sujeita a ficar desatualizada silenciosamente: `02_Documentacao/`, `03_Padroes_Politicas/`, `04_Seguranca_Riscos/`, `05_Integracoes_Infra/`, `07_POPs_Processos/`, `08_Skills_Agentes_Prompts/` e todas as subpastas de `_Compartilhado/`. Cada nota nessas categorias termina com uma seção `## Atualizações`, uma linha por mudança relevante, mais recente no topo, formato `- AAAA-MM-DD: o que mudou e por quê (breve).`

Adicionar uma entrada sempre que:
- o conteúdo da nota for alterado de forma material (não erros de digitação/formatação);
- uma tecnologia, biblioteca, ferramenta ou versão nova relacionada ao assunto da nota for adotada.

Ficam de fora desta convenção `00_Decisoes/` (ADR já é um registro pontual, datado no próprio nome do arquivo — uma mudança de decisão vira um novo ADR, não uma atualização do antigo) e `01_Contexto_Usuario/` (somente leitura para IA).

## Regras de Acesso e Escrita

- **`<projeto>/01_Contexto_Usuario/`**: leitura apenas. A IA nunca cria, edita, move ou apaga nada aqui, em nenhum projeto.
- Todas as demais categorias, `Hub.md` de cada projeto e `_Compartilhado/`: leitura e escrita liberadas para a IA.

## Regra de Segurança do Cofre

**Nunca** gravar segredos, chaves, tokens ou valores reais de `.env` em nenhuma nota. Documentar apenas o propósito/contrato de uma configuração, nunca seu valor.

Segredos reais (senhas, chaves de API, tokens, certificados) **devem continuar sem ocultação** em todo lugar onde o sistema realmente precisa deles para funcionar: `.env` local, `.env` em `lumos-dev` e `lumos-prd`, secrets montados em container (`secrets/nfce/*.pfx`, etc.). Nunca redigir, mascarar ou substituir esses valores nos arquivos reais de configuração — a ocultação é só para o que vai para o GitHub.

O único vetor real de vazamento neste cofre são os logs automáticos (`_Logs_Chat/`, `_Logs_Execucao/`, ver seção "Log diário de chat" acima): o hook `Stop` reconstrói cada arquivo do zero a partir do transcript bruto **a cada turno**, então qualquer segredo que apareça na conversa (colado pelo usuário, exibido por um comando, lido de um `.env`) entra de novo no log automaticamente, mesmo que já tenha sido redigido antes. Por isso, **antes de qualquer `git push` que inclua arquivos de `_Logs_Chat/` ou `_Logs_Execucao/`, sempre**:

1. Rodar uma busca ampla por padrões de segredo nos arquivos que serão commitados daquela vez (formatos conhecidos: `aact_*` do Asaas, `sk-`/`AIzaSy`/tokens de API, `-----BEGIN...PRIVATE KEY-----`, JWT `eyJ...`, e também senhas/valores arbitrários que o usuário tenha colado na conversa).
2. Substituir cada valor real encontrado por um placeholder `[REDACTED_<NOME_DA_VARIAVEL_OU_SEGREDO>]`, preservando o resto do conteúdo do log intacto.
3. **Nunca digitar o valor literal do segredo no próprio comando de redação** (Bash, Edit, etc.) — esse comando também vira parte do transcript e será logado de novo pelo hook no fim do turno, reintroduzindo o vazamento que acabou de ser corrigido. Preferir padrões estruturais que casem pelo nome da variável/formato (`NOME_DA_VAR=\S+`, prefixo conhecido do formato do token) em vez do valor em si; quando não houver como evitar (ex: uma senha arbitrária sem contexto fixo ao redor), decodificar o valor em tempo de execução a partir de uma forma ofuscada (ex: base64 calculado à parte) em vez de escrever o texto puro no código do comando.
4. Depois de redigir, conferir de novo com uma busca que também não reproduza o segredo literal (grep pelo nome da variável ou pelo prefixo do formato, não pelo valor completo).
5. Isso pode precisar ser repetido a cada novo push: o próprio comando de redação de uma rodada vira, no fim daquele turno, uma nova ocorrência do segredo no log seguinte — é esperado revisar de novo antes do próximo push, não é sinal de falha do processo anterior.

Esse procedimento é necessário **só** para o que será commitado/enviado ao GitHub. Nada disso se aplica aos arquivos reais de configuração (`.env`, secrets montados) em nenhum ambiente — local, `lumos-dev` ou `lumos-prd` continuam com os valores reais, sem qualquer ocultação, porque precisam deles para funcionar.

## Separação visual por autoria (IA vs usuário)

O cofre usa um snippet CSS nativo (`.obsidian/snippets/autoria-cores.css`, habilitado em `appearance.json`) para colorir notas por quem escreveu: **laranja = IA**, **azul = usuário**. Não depende de plugin de comunidade — usa a propriedade reservada `cssclasses` do frontmatter, que o Obsidian já injeta como classe CSS na nota.

- Ao **criar** uma nota inteira ou **editá-la de forma material**, a IA adiciona/mantém `cssclasses: ia-nota` no frontmatter.
- O usuário pode marcar uma nota própria com `cssclasses: usuario-nota` no frontmatter para o realce azul (opcional — sem marcação, a nota fica sem cor, tratada como "não classificada").
- Para notas de autoria mista (ex.: usuário escreve uma pergunta/decisão e a IA comenta dentro da mesma nota), usar callouts em vez de marcar a nota inteira: `> [!ia]` (laranja) e `> [!usuario]` (azul).
- `01_Contexto_Usuario/` nunca recebe `cssclasses: ia-nota` (a IA não escreve lá — ver "Regras de Acesso e Escrita").
- Notas já existentes antes desta convenção não foram marcadas retroativamente; marcar sob demanda ao revisitar uma nota antiga.

## Regras Operacionais Gerais

Regras válidas para qualquer trabalho técnico neste repositório, não só para escrita de notas no cofre — aplicam mesmo quando a tarefa não envolve editar o cofre diretamente.

### Escopo de escrita de código

Qualquer alteração de código fica restrita à árvore `~/Documentos/desenvolvimento/dev/` (este repositório) e tudo que existe dentro dela. Nunca editar arquivos fora dela. Dentro dela, editar sempre o código-fonte real do projeto — nunca arquivos de cache de gerenciador de pacotes (ex: dentro de `.npm`, `node_modules`, `~/.cache`, `.venv/lib`, ou equivalentes de outros stacks). Se um problema aparentar estar numa dependência instalada, corrigir a causa no código do projeto ou na versão/configuração fixada da dependência — nunca editar o pacote em cache diretamente.

### Regras de deploy

Em produção, executar **somente** o que foi explicitamente pedido pelo usuário — nunca fazer deploy, restart de serviço, migration ou qualquer outra mudança de infraestrutura de produção por iniciativa própria (ver exemplo já registrado em [[farmaura/07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]: a IA gera e revisa migrations, mas não aplica em produção sem confirmação explícita — o mesmo princípio vale para qualquer ação de deploy). Todo acesso ao servidor de produção (`lumos-prd`) é feito exclusivamente via `ssh lumos-prd` (ver [[farmaura/05_Integracoes_Infra/Lumos_Gateway|Lumos_Gateway]] para a topologia de rede). Não usar outro método de acesso ao servidor sem pedido explícito do usuário.

### Contexto de front-end antes de alterar

Antes de modificar qualquer código de front-end (`farmaura/react/`, telas Blade/BFF de `lumosmed/`, etc.), ler a documentação de arquitetura/visão geral do projeto correspondente em `<projeto>/02_Documentacao/` (começando por `Visao_Geral.md` e os módulos relevantes) para entender o desenho do sistema antes de propor ou aplicar a mudança. A skill `contexto` (ver `_Compartilhado/Skills/contexto.md`) automatiza esse levantamento.

### Documentação obrigatória

Documentar sempre, sem esperar ser pedido: atualizações, pendências, decisões, incidentes e problemas de segurança — usando as categorias já definidas acima (`00_Decisoes`, `04_Seguranca_Riscos`, `06_Pendencias`, etc., ver seção "Como a IA deve atuar" logo abaixo). Um incidente de produção (erro, indisponibilidade, dado corrompido, chave exposta) é sempre registrado em `04_Seguranca_Riscos/` como runbook de incidente, mesmo quando não é estritamente uma vulnerabilidade.

## Como a IA deve atuar

- Atualizar `<projeto>/00_Decisoes/` proativamente sempre que uma decisão de arquitetura, trade-off relevante ou mudança de direção for tomada durante o trabalho — sem esperar o usuário pedir.
- Atualizar `<projeto>/04_Seguranca_Riscos/` proativamente ao identificar ou tratar um risco de segurança ou vulnerabilidade relevante.
- Atualizar `<projeto>/06_Pendencias/` quando um follow-up combinado ficar para depois em vez de ser resolvido na hora.
- Ao editar de forma material uma nota nas categorias que mantêm `## Atualizações` (ver seção "Registro de Atualizações" acima), ou ao adotar uma tecnologia nova relevante para ela, adicionar uma entrada datada nessa seção — não só editar o corpo silenciosamente.
- Antes de iniciar trabalho relevante num projeto, verificar `<projeto>/Hub.md`, `01_Contexto_Usuario/` e `00_Decisoes/` para contexto prévio.
- Ao identificar algo genérico o suficiente para servir outros projetos (uma skill, um prompt, um padrão), preferir escrevê-lo em `_Compartilhado/` em vez de dentro da pasta do projeto.
- Ao criar um projeto novo neste cofre, criar a pasta `<projeto>/` com um `Hub.md` inicial e só as subpastas de categoria que já tiverem conteúdo — não as 8 de uma vez.
- Ao alterar, num projeto, qual dado pessoal é coletado, seu tratamento/finalidade, com quem é compartilhado, por quanto tempo é retido, ou uma regra de negócio (pagamento, cancelamento, prazo, direito do titular) que um documento legal do projeto descreve (Termos de Uso, Política de Privacidade, Retenção de Dados), atualizar esse documento na mesma mudança de código — não deixar como débito técnico à parte. Ver exemplo registrado em [[farmaura/03_Padroes_Politicas/politica-sincronizar-legal-com-mudancas-reais-de-dados|política de sincronização legal do farmaura]].
- Preferir poucas notas de alto valor a muitas notas triviais. Não criar nota para cada arquivo de código.
- Ao escrever qualquer nota neste cofre, sempre que ela linkar para outro documento já existente (`[[wikilink]]` ou link markdown), verificar antes que o arquivo de destino realmente existe no caminho referenciado — nunca criar um link "no escuro" assumindo que a nota existe. Se o documento referenciado ainda não existir, criar a nota de destino (mesmo que mínima) em vez de deixar um link quebrado, ou reformular o texto sem o link.