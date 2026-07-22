# Skill: qa-functional-review

**Arquivo fonte:** `dev-obsidian/_Compartilhado/Skills/qa-functional-review/SKILL.md`

## Propósito

Passada de QA funcional sobre uma tela/feature de UI: botão sem ação, função duplicada implementando o mesmo comportamento duas vezes, estado de loading/vazio/erro ausente, rota órfã.

## Quando usar

Depois de implementar ou alterar uma tela, formulário ou componente interativo em qualquer stack de frontend deste repositório.

## Checklist

Todo botão/link tem handler de verdade (sem alvo de clique morto); nenhuma função/componente duplicado implementando o mesmo comportamento em dois lugares (buscar por handler parecido antes de escrever um novo em vez de duplicar); estados de loading, vazio e erro presentes e visualmente distintos, não só o caminho feliz; nenhuma rota/componente órfão depois de um refactor; nenhum erro/warning de console durante o fluxo testado; ação destrutiva (excluir, cancelar, estornar) com confirmação explícita, nunca disparada por clique simples ou carregamento de página.

## Como revisar

Percorrer a tela de verdade num navegador contra o servidor de dev rodando, não só ler o código — botão morto lê bem no código-fonte e só falha quando clicado de verdade.

## Reportar

Gap encontrado e não corrigido no mesmo change set vira item de pendência no backlog do projeto, não fica como observação não registrada.

## Ver também

- [[../../farmaura/06_Pendencias/padronizar-estados-loading-vazio-erro-acessibilidade|padronizar-estados-loading-vazio-erro-acessibilidade]] — gap real de estados de loading/vazio/erro já registrado em Farmaura; usar este checklist para confirmar se uma tela específica ainda tem o problema antes de marcar como resolvido.
- [[project-test-orientation]] — qual stack subir para revisar a tela de verdade.
- [[security-vulnerability-testing]] — skill irmã, foco em segurança em vez de comportamento funcional.

## Atualizações
- 2026-07-20: definição operacional movida para o diretório da skill neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-20: nota criada.
