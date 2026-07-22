# Hub: Prompts

Biblioteca canônica de prompts reutilizáveis. Cada prompt possui uma nota `<prompt-name>.md` para leitura humana e um arquivo `<prompt-name>/PROMPT.md` para execução por agentes.

## Como ler e executar um prompt

Quando o usuário solicitar explicitamente um prompt por nome, ou pedir uma tarefa que corresponda diretamente a um prompt catalogado, o agente deve ler integralmente o `PROMPT.md` correspondente e executar suas instruções. A nota humana complementa com contexto e histórico, mas não substitui o prompt operacional.

## Prompts disponíveis

- [[prompt-qa-funcional]] — passada de QA funcional em tela ou feature de UI.
- [[prompt-varredura-vulnerabilidades]] — varredura de vulnerabilidades em mudança ou feature sensível.
- [[prompt-teste-geral-feature]] — teste ponta a ponta de feature nova.

## Atualizações

- 2026-07-20: hub criado e prompts operacionais `PROMPT.md` adicionados à biblioteca.
