# Página de "bula" (informações regulatórias do medicamento) não existe — sem model de conteúdo

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-26

## Descrição

Um demo estático explorado antes desta leva incluía uma página de "bula" separada (informações regulatórias do medicamento — indicações, contraindicações, posologia, etc. — no padrão das 9 perguntas da ANVISA), com botão "Voltar ao medicamento". No app real, isso não existe em nenhuma forma:

- Nenhuma rota (`route.name === 'bula'` ou similar) em `marketplace-app.jsx`.
- `ProductTabs` (`product-screen.jsx`) só tem 3 abas: Descrição, Como usar, Avaliações — nenhuma cobre o formato regulatório completo de bula.
- Nenhum campo de bula/package-insert/composição no backend (`grep` em `app/models/`, `app/schemas/catalog*.py` não encontra nada).

## Contexto

Ao trazer o restante do que foi prototipado no demo para o front real (mesma leva que corrigiu o desconto combinado do produto, adicionou carrossel e modais de recorrência), decidi **não** construir essa tela agora — faria isso inventando texto regulatório de bula sem lastro real, o que é justamente o tipo de conteúdo que não deveria ser fabricado (informação de saúde/medicamento). Antes de construir a UI, precisa de: (1) decisão de produto sobre se isso é uma tela nova ou uma 4ª aba em `ProductTabs`, e (2) uma fonte real de conteúdo — texto de bula por produto, provavelmente vindo de uma base regulatória (ANVISA/bulário) ou cadastro manual pelo time de catálogo, não gerado.
