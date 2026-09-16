# 2026-08-27 — Correção: carrinho era perdido ao logar durante o checkout

## Contexto

Durante uma sessão de verificação visual/funcional completa do marketplace (comparação contra o demo de referência, incluindo fluxo real de compra ponta a ponta via Playwright), encontrado um bug real e severo: um visitante anônimo que adiciona um produto ao carrinho e só faz login no gate do checkout (fluxo normalíssimo — "compre sem criar conta até a hora de pagar") via para a etapa de entrega com o **carrinho vazio**, mesmo o item tendo sido adicionado com sucesso segundos antes.

Causa raiz, em duas camadas:
1. `core/marketplace-app.jsx`: o carrinho local (`items`) é cacheado em `localStorage` **escopado por usuário** (`fa:marketplace:public:<user-id ou "guest">:cart`). No login, o efeito que troca de escopo (`[user && user.id]`) simplesmente lia o cache do usuário recém-logado (vazio, primeira vez) e descartava o que estava em `items` até ali (o carrinho anônimo) — sem nenhuma tentativa de mesclar.
2. Mesmo corrigindo (1), existe também um **carrinho no servidor** (`GET /customers/me/cart`), buscado no bootstrap pós-login e usado para sobrescrever `items` incondicionalmente (`setItems(cartPayload.map(...))`). Para uma conta que nunca comprou nada logada, esse carrinho vem vazio — sobrescrevendo de novo o que a correção do passo (1) tinha acabado de mesclar.

Confirmado com instrumentação (`console.log` temporário + inspeção de `localStorage` via Playwright): o merge do passo (1) de fato acontecia em memória, mas o carrinho do servidor no passo (2) sempre vencia por rodar depois.

## Alternativas consideradas

- **Corrigir só a camada (1)** — insuficiente: qualquer conta já teria seu (vazio) carrinho de servidor sobrescrevendo o merge segundos depois, no mesmo login.
- **Fazer o carrinho do servidor ser sempre a fonte da verdade, sem merge nenhum** — descartado: é exatamente o comportamento atual (o bug). Perder o carrinho de quem só decide criar conta na hora de pagar é uma barreira real de conversão, não um detalhe.
- **Sincronizar o merge de volta pro servidor (POST/PUT `/customers/me/cart`) nesta mesma leva** — adiado deliberadamente (ver Consequências): o sintoma visível (item sumir da tela) já está corrigido; persistir a mesclagem no servidor é trabalho adicional de escopo maior, não bloqueante pra o carrinho parar de desaparecer.

## Decisão

Duas correções em `core/marketplace-app.jsx`:
1. O efeito de troca de escopo do carrinho (`[user && user.id]`) agora mescla o carrinho anônimo (`prevItems`) no carrinho do usuário recém-logado (`nextItems`, do cache local) em vez de simplesmente substituir — soma quantidade quando o mesmo produto já está nos dois, mantém os demais itens de cada lado.
2. O `setItems` que aplica o carrinho vindo do servidor (`cartPayload`) também mescla em vez de sobrescrever: cada item do servidor é mantido como está (fonte de verdade pra o que ele já conhece), e qualquer item que só existe em `prev` (carrinho local, já mesclado no passo 1) é adicionado por cima — sem duplicar itens que já vieram do servidor.

## Consequências

- O carrinho agora sobrevive ao login em qualquer ponto do fluxo (barra de topo, gate do checkout, etc.) — testado ponta a ponta (adicionar item anônimo → checkout → login → tela de entrega mostrando o item e o total corretos).
- **Pendência real, não corrigida nesta leva**: o merge acontece só no cliente (`localStorage`). Se o cliente mesclado nunca voltar a mexer no carrinho antes de fechar a aba, o carrinho do servidor continua sem saber desse item — abrir o site em outro dispositivo/navegador não veria a mesclagem. Corrigir de verdade significa persistir o carrinho mesclado de volta pro servidor logo após o login (uma chamada adicional, não implementada aqui). Ver [[../06_Pendencias/carrinho-mesclado-nao-persiste-no-servidor|pendência registrada]].
- Nenhuma migration, nenhuma mudança de schema — bug e correção são inteiramente client-side.
