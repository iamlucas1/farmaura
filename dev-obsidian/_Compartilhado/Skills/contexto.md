# Skill: contexto

**Arquivo fonte:** `.claude/skills/contexto/SKILL.md` (raiz do repositório — não em `_Compartilhado/Skills/contexto/`, ao contrário do padrão das demais skills desta pasta).

## Por que o arquivo fonte foge do padrão

As skills de segurança/QA desta biblioteca guardam `SKILL.md` dentro de `_Compartilhado/Skills/<skill-name>/`, lido "manualmente" pelo agente por protocolo do `claude.md`/`agent.md`. Esta skill precisa ser **invocável diretamente com `/contexto`** no Claude Code, e a descoberta automática de skills do Claude Code só acontece em `.claude/skills/<nome>/SKILL.md` na raiz do repositório. Por isso o executável mora lá, e esta nota aqui é só a referência humana — não duplicar o conteúdo operacional nos dois lugares, editar apenas o arquivo fonte.

## Propósito

Carregar o contexto necessário para **começar a programar** num projeto deste repositório — não é um resumo informativo solto, é preparo para a próxima etapa ser escrever código. Cruza o que já está documentado em `dev-obsidian/` (arquitetura, decisões, padrões, riscos, pendências) com os arquivos de código reais do escopo pedido, e termina apontando os arquivos que são o ponto de entrada da mudança.

## Quando usar

Início de qualquer conversa nova que vá mexer em `farmaura`, `farmaura-api`, `lumosmed` ou `lumos-api` — ou sempre que o usuário for implementar/alterar algo e ainda não tiver contexto carregado na conversa, mesmo no meio de uma conversa já em andamento.

## Variações suportadas (via argumento livre depois de `/contexto`)

- **Geral** (`/contexto`, sem argumento) — cobre farmaura e lumosmed de forma enxuta.
- **Só documentação** (`/contexto docs`, ou `/contexto <projeto> docs`) — só `02_Documentacao/` do cofre, sem decisões/pendências/segurança; mesmo assim ainda resolve e cita os arquivos de código reais do escopo, porque nenhum modo desta skill fica só na documentação sem terminar pronto para escrever.
- **Por projeto** (`/contexto farmaura` ou `/contexto lumosmed`) — contexto completo daquele projeto.
- **Por área** (`/contexto <projeto> frontend` ou `/contexto <projeto> backend`) — recorta decisões/padrões/riscos/pendências por palavra-chave de stack.
- **Por módulo** (`/contexto <projeto> <nome-do-módulo>`, ex: `/contexto farmaura pdv`) — módulo específico (farmaura tem `Modulo_*.md` dedicado por domínio; lumosmed usa as áreas funcionais do próprio `Hub.md`, já que não tem documentação modular própria aqui).

Ver a tabela completa de exemplos e a lógica de leitura em cada modo no `SKILL.md` fonte.

## Comportamento

Somente leitura — nunca cria, edita ou apaga nota no cofre nem arquivo de código (isso continua sendo o fluxo normal de "Como a IA deve atuar" do `dev-obsidian/CLAUDE.md` e das "Regras Operacionais Gerais" desse mesmo arquivo, não desta skill). Além das notas do cofre, também localiza e abre os arquivos de código reais do escopo pedido (rota/serviço/repositório no backend, tela/componente no frontend), para não parar só na documentação. Responde com um resumo sintetizado terminando num estado "pronto para programar": o que existe, o que respeitar, e quais arquivos abrir para começar — não com o despejo bruto dos arquivos lidos.

## Atualizações

- 2026-07-31: modo `docs` deixou de ser exceção — antes só lia `02_Documentacao/` e parava aí; agora também resolve os arquivos de código do escopo, para terminar pronto para escrever como qualquer outro modo.
- 2026-07-31: reorientada para preparo de programação — passou a também localizar e abrir os arquivos de código reais do escopo (não só notas do cofre) e a terminar a resposta com os arquivos-ponto-de-entrada da mudança, em vez de só um resumo informativo.
- 2026-07-30: skill criada, a pedido do usuário, para acelerar o início de conversas novas sem reexplicar contexto de projeto.
