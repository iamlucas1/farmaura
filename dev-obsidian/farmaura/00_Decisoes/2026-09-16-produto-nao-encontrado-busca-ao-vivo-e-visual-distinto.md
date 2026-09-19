---
cssclasses: ia-nota
---

# 2026-09-16 — Card "Não encontrou o produto?" com busca ao vivo e visual distinto da busca do catálogo

## Contexto

O card "Produto que o cliente queria e não encontramos" (`PdvMissingProductBox`) tinha um campo de busca + botão "Buscar em outras lojas" — visualmente parecido demais com o campo de busca do catálogo logo acima (que bipa/adiciona ao carrinho), mas com comportamento completamente diferente (precisa Enter/clique para buscar, uma única correspondência decidida por vez). Pedido: reformular para ficar mais objetivo e fazer a busca encontrar produtos à medida que o funcionário digita.

## Decisão

- **Busca ao vivo**: `useEffect` com debounce de 300ms sobre o campo — sem botão de busca nem Enter. Mínimo de 2 caracteres antes de disparar, para não gerar chamada a cada tecla.
- **Múltiplas correspondências, cada uma com sua própria ação**: em vez de decidir um único desfecho (`elsewhere`/`noStock`/`notFound`) a partir do primeiro resultado, cada produto encontrado vira uma linha própria com o que fazer especificamente com ele — badge "Em outra loja" + lista de lojas com estoque para reservar, ou badge "Sem estoque" + botão "Registrar que o cliente quis". Quando a busca não encontra nada no catálogo (após terminar de digitar), mostra "'{termo}' não está no catálogo" com "Registrar pedido avulso".
- **Visual deliberadamente distinto** do campo de busca do catálogo: fundo âmbar (`--warning-soft`, cor ainda não usada por nenhum outro card do PDV), ícone de busca âmbar, título curto em forma de pergunta ("Não encontrou o produto?") e uma frase de apoio abaixo explicando o que o card faz — para não ser confundido com "bipar produto para vender".

## Consequências

- Testado via Chrome headless: busca por "Losartana" mostra as duas variantes (50mg/100mg) já com lojas e preços para reservar, sem precisar apertar nada; termo inexistente mostra a mensagem + botão de registro avulso; clique em "Registrar" mostra confirmação inline ("Registrado — obrigado por avisar").
- Nenhuma mudança de contrato com o backend — `pdvSearchProducts`/`pdvLogDemand`/`onReserve` seguem os mesmos, só a camada de apresentação mudou.

## Ver também

- [[2026-09-13-pdv-ajuste-visual-vs-artifact-e-produto-nao-encontrado|ADR original deste card]] — versão anterior, agora substituída.