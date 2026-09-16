# 2026-09-13 — PDV: ajuste visual contra o artifact "Farmaura Operações" + caixa de produto não encontrado

## Contexto

O usuário reportou que a tela do PDV estava "completamente diferente" do artifact de referência (`Farmaura Operações`, ver [[2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|ADR da migração visual anterior]]). Antes de mexer, extraí o componente `PDVPage`/`AtendimentoBody` real do artifact (React.createElement precompilado — o publish do artifact sempre embute o build final, não o JSX fonte) e comparei lado a lado via screenshot com o PDV real rodando localmente.

Diferença real encontrada: o artifact tem um fluxo mais simples (pagamento e emissão de nota na mesma tela, sem separação de papéis) enquanto o PDV real tem farmacêutico → caixa, fila de atendimentos, rascunho autosalvo, limite de desconto por margem, cobertura de entrega — nada disso existe no artifact, que é uma demo de papel único. Perguntei ao usuário como tratar essa diferença.

## Decisão

1. **Manter a separação farmacêutico/caixa e tudo que depende de backend real** (fila, rascunhos, limite de desconto, RX). Só ajustar o visual dentro de cada tela para bater com o artifact — não replicar o artifact ao pé da letra a ponto de descartar trabalho já construído.
2. **Implementar a caixa "Produto que o cliente queria e não encontramos"** (existe no artifact, não existia no PDV real) com dados reais — não como demo estática.

## O que mudou

### Bug de verdade corrigido: sugestões duplicadas em "Para oferecer"

`pdvSuggestions()` deduplicava por `it.id`, mas o mesmo produto cadastrado em mais de uma loja tem um `id` de estoque diferente por loja — com "Todas as lojas" selecionado, o mesmo produto aparecia 2× na lista de sugestões. Corrigido deduplicando por nome do produto (`dedupeByName`, novo helper em `point-of-sale-screen.jsx`), reaproveitado também na lista de navegação padrão do catálogo (abaixo).

### Catálogo de produtos: lista padrão navegável (antes exigia digitar)

Antes, o campo de busca do PDV ficava vazio até o usuário digitar ("Digite para buscar um produto no estoque."), bem diferente do artifact, que sempre mostra uma lista completa e navegável do catálogo abaixo da busca. Agora, quando o campo está vazio, a lista mostra o estoque local (prop `inventory`, já carregado no app, deduplicado por nome) — a busca no servidor (`pdvSearchProducts`, multi-loja) continua sendo usada assim que o usuário digita, sem mudança nesse caminho.

### Nova caixa: "Produto que o cliente queria e não encontramos"

Novo componente `PdvMissingProductBox`, visível só na visão do farmacêutico, posicionado entre o seletor de retirada/entrega e o catálogo (mesma posição relativa do `MissingProductBox` do artifact). Busca por texto livre via `pdvSearchProducts` (a mesma busca multi-loja já usada no catálogo) e cobre três casos:

- **Encontrado com estoque em outra loja** → mostra a(s) loja(s) e reaproveita a reserva entre lojas **já existente** (`pdvCreateReservation`, mesmo fluxo que já era acionado ao expandir um resultado de busca no catálogo) — nenhuma lógica de reserva nova foi criada, só um novo ponto de entrada para a mesma.
- **Cadastrado no sistema, mas sem estoque em nenhuma loja** → botão "Registrar que o cliente quis".
- **Não cadastrado em lugar nenhum** (busca não encontra nada) → botão "Registrar nome avulso".

Os dois últimos casos chamam uma capacidade nova, `pdvLogDemand` → `POST /pdv/demand-log` (rota nova em `app/api/v1/pdv.py`, método `PdvService.log_demand`, schemas `PdvDemandLogRequest`/`PdvDemandLogResponse` em `app/schemas/pdv.py`).

**Escolha de implementação da demanda (trade-off deliberado)**: em vez de uma tabela nova (modelo + migration + repositório), a demanda é registrada como um evento de log estruturado (`logger.info("pdv_product_demand", ...)`, `pdv_service.py`) — com tenant, loja, farmacêutico, texto buscado e (se identificado) cliente. Verificado ponta a ponta: o evento chega de fato no log da API com esses campos. Não há hoje uma tela para *consultar* esse histórico agregado (só reviewable via log bruto) — ver pendência abaixo se a farmácia quiser relatório/dashboard disso no futuro.

## Consequências

- Nenhuma migration de banco nesta mudança — `log_demand` não persiste em tabela, só loga.
- A reserva entre lojas continua exatamente com o mesmo comportamento e trava de estoque de antes (`is_reservation=True` em `PdvOrder`, 48h de validade) — só ganhou um segundo ponto de entrada na UI.
- Testado ponta a ponta via Chrome headless (CDP): lista padrão sem duplicatas, adicionar produto da lista padrão ao carrinho, busca "não encontrado" → registrar nome avulso → confirmado no log da API (`pdv_product_demand` com tenant/loja/farmacêutico, sem dado sensível).
- Visão do farmacêutico e do caixa comparadas lado a lado com o artifact após o ajuste — layout, cores e posicionamento dos cartões batem; texto do estado de carrinho vazio ("Comece a registrar a venda · Busque ou bipe um produto") foi mantido diferente do artifact ("Carrinho vazio") de propósito, por já mencionar bipagem de código de barras (real neste PDV, inexistente na demo do artifact).

## Ver também

- [[2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes]] — primeira rodada da migração visual do console interno para este mesmo artifact.
- [[../06_Pendencias/reportar-historico-demanda-produtos-nao-encontrados|reportar-historico-demanda-produtos-nao-encontrados]] — pendência sobre eventualmente tornar o log de demanda consultável.
