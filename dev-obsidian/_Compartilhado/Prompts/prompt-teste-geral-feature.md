# Teste geral ponta a ponta de uma feature nova

**Arquivo operacional:** `dev-obsidian/_Compartilhado/Prompts/prompt-teste-geral-feature/PROMPT.md`
## Quando usar

Ao terminar uma feature nova (não só um ajuste pequeno) e antes de reportá-la como pronta — cobre o "funciona de verdade, de ponta a ponta" além do teste automatizado.

## Prompt

```
Teste a feature atual (<descrever>) de ponta a ponta.

1. Use a skill project-test-orientation para identificar quais stacks a feature atravessa e em qual porta/container cada uma roda.
2. Suba as stacks necessárias e exercite o caminho feliz e pelo menos um caso de borda relevante, de verdade (navegador/requisição real), não só leitura de código.
3. Se a feature envolve UI, complemente com a skill qa-functional-review (botão sem ação, estado de loading/vazio/erro, função duplicada).
4. Se a feature toca autenticação, pagamento, upload ou dado sensível, complemente com a skill security-vulnerability-testing, respeitando os limites seguros de teste (padrao-ataques-defesas-e-limites-de-teste).
5. Isto complementa, não substitui, um passe de verificação padrão de que o código funciona (build/testes/lint) — faça os dois.
6. Ao final, diga explicitamente o que foi de fato exercitado (não só o que deveria funcionar em teoria) e o que ficou sem cobertura.
```

## Atualizações
- 2026-07-20: prompt operacional movido para o diretório correspondente neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-20: nota criada.
