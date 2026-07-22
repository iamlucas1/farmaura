# Passada de QA funcional numa tela/feature

**Arquivo operacional:** `dev-obsidian/_Compartilhado/Prompts/prompt-qa-funcional/PROMPT.md`
## Quando usar

Depois de implementar ou alterar uma tela, formulário ou componente interativo, antes de considerar a feature pronta.

## Prompt

```
Faça uma passada de QA funcional na tela/feature atual (<descrever>).

1. Use a skill project-test-orientation para saber qual stack subir para acessar a tela de verdade num navegador.
2. Use a skill qa-functional-review: confirme que todo botão/link tem ação real, que não existe função/componente duplicado fazendo a mesma coisa em dois lugares, que os estados de loading/vazio/erro estão presentes e distintos, que não há rota órfã, e que não aparece erro/warning no console durante o fluxo.
3. Percorra a tela de verdade — não valide só lendo o código.
4. Gap encontrado e não corrigido no mesmo change set vira item em <projeto>/06_Pendencias/, não fica como observação solta.
5. Ao final, resuma o que foi percorrido e o que foi encontrado.
```

## Atualizações
- 2026-07-20: prompt operacional movido para o diretório correspondente neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-20: nota criada.
