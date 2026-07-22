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

## Como a IA deve atuar

- Atualizar `<projeto>/00_Decisoes/` proativamente sempre que uma decisão de arquitetura, trade-off relevante ou mudança de direção for tomada durante o trabalho — sem esperar o usuário pedir.
- Atualizar `<projeto>/04_Seguranca_Riscos/` proativamente ao identificar ou tratar um risco de segurança ou vulnerabilidade relevante.
- Atualizar `<projeto>/06_Pendencias/` quando um follow-up combinado ficar para depois em vez de ser resolvido na hora.
- Ao editar de forma material uma nota nas categorias que mantêm `## Atualizações` (ver seção "Registro de Atualizações" acima), ou ao adotar uma tecnologia nova relevante para ela, adicionar uma entrada datada nessa seção — não só editar o corpo silenciosamente.
- Antes de iniciar trabalho relevante num projeto, verificar `<projeto>/Hub.md`, `01_Contexto_Usuario/` e `00_Decisoes/` para contexto prévio.
- Ao identificar algo genérico o suficiente para servir outros projetos (uma skill, um prompt, um padrão), preferir escrevê-lo em `_Compartilhado/` em vez de dentro da pasta do projeto.
- Ao criar um projeto novo neste cofre, criar a pasta `<projeto>/` com um `Hub.md` inicial e só as subpastas de categoria que já tiverem conteúdo — não as 8 de uma vez.
- Preferir poucas notas de alto valor a muitas notas triviais. Não criar nota para cada arquivo de código.
- Ao escrever qualquer nota neste cofre, sempre que ela linkar para outro documento já existente (`[[wikilink]]` ou link markdown), verificar antes que o arquivo de destino realmente existe no caminho referenciado — nunca criar um link "no escuro" assumindo que a nota existe. Se o documento referenciado ainda não existir, criar a nota de destino (mesmo que mínima) em vez de deixar um link quebrado, ou reformular o texto sem o link.
