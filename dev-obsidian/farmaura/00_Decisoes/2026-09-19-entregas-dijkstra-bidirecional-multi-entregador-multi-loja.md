---
cssclasses: ia-nota
---

# 2026-09-19 — Entregas & Rota: Dijkstra bidirecional sobre grafo de proximidade, planejamento multi-entregador e multi-loja

## Contexto

Pedido do usuário, na sequência direta do ADR anterior ([[2026-09-19-entregas-rota-otimizacao-real-e-correcoes|Entregas & Rota: otimização real]]): "faça um processamento de Dijkstra bidirecional de maneira em que explore os nós e calcule as diversas rotas [...] pois poderá ter somente uma entrega mas ter também 2, 3, 4 ou mais entregas sendo feitas ao mesmo tempo". Perguntado sobre o escopo (só o motor de cálculo vs. sistema completo com múltiplos entregadores), o usuário escolheu explicitamente o sistema completo. Ainda na mesma leva, adicionou um requisito: cada entregador pertence a uma loja específica, e o planejamento precisa respeitar isso (multi-loja, multi-entregador).

## Problema conceitual: Dijkstra é ponto-a-ponto, a necessidade real é ordem de visita (TSP)

Dijkstra bidirecional resolve caminho mínimo entre dois nós — não decide a ordem ótima de visitar N pontos (isso é TSP, NP-difícil). Para o pedido do usuário fazer sentido tecnicamente sem virar decoração, era necessário um grafo onde a busca bidirecional realmente precisasse explorar múltiplos saltos, não um grafo completo (onde qualquer par de nós já é uma aresta direta e a "busca" bidirecional degenera em uma comparação trivial).

Solução: `app/domain/geo.py` ganhou `build_proximity_graph()` — grafo esparso k-vizinhos-mais-próximos (k=5 por padrão) sobre os pontos de entrega + origem, com ponte automática entre componentes desconectados (conecta o par mais próximo entre dois componentes, garantindo grafo conexo). `bidirectional_dijkstra()` roda busca real com duas frentes simultâneas (fila de prioridade a partir da origem e do destino), encontro no meio, condição de parada padrão (`topo da fila frontal + topo da fila reversa >= melhor distância encontrada`). Verificado com script standalone que o caminho encontrado de fato passa por múltiplos saltos intermediários (ex: `[0, 2, 1, 7]` para um par de nós deliberadamente distantes no grafo de teste).

`nearest_neighbor_order_via_graph()` usa esse grafo para decidir a ordem de visita: a cada passo, escolhe o próximo ponto não visitado cujo caminho mais curto (via Dijkstra bidirecional) até o ponto atual é menor — substitui o nearest-neighbor euclidiano direto do ADR anterior por um nearest-neighbor sobre distância de grafo.

## Múltiplas rotas simultâneas: sweep clustering por ângulo

Para dividir os pedidos pendentes entre N entregadores saindo ao mesmo tempo, `sweep_clusters()` ordena os pontos por ângulo (bearing) a partir da origem (a loja) e corta em N fatias angulares contíguas — heurística clássica de VRP (vehicle routing problem), rápida e produz grupos geograficamente coerentes (cada entregador cobre uma "fatia" da cidade, não pontos espalhados). Dentro de cada fatia, a ordem de visita usa `nearest_neighbor_order_via_graph()` normalmente.

## Multi-loja, multi-entregador: vínculo `driver.store_id`

Requisito adicionado a meio da implementação. `User.store_id` já existia no modelo de dados (não foi preciso migration nova) — só faltava a validação de negócio. Adicionado em dois pontos de `delivery_service.py`:

- `plan_routes()`: rejeita (`422`) qualquer `driver_user_id` cujo `store_id` não bata com a loja sendo planejada.
- `assign_driver()`: mesma validação ao atribuir manualmente um entregador a uma rota já existente.

## Achado colateral: `/team/members` é admin-only, mas farmacêutico/gerente também planejam entregas

O frontend usava `fetchTeamMembers()` (`GET /team/members`) para popular o seletor de entregadores — mas esse endpoint é `require_internal_subject(UserRole.ADMIN)`, então um usuário `MANAGER`/`PHARMACIST` (que também acessa a tela "Entregas & Rota") sempre recebia lista vazia, silenciosamente. Em vez de abrir o roster completo de equipe para esses papéis (exposição maior que o necessário), criado um endpoint novo e mais estreito: `GET /deliveries/drivers`, acessível a `ADMIN, MANAGER, PHARMACIST`, devolvendo só `{id, name}` de entregadores já filtrados pela loja resolvida no servidor (`DeliveryService.list_drivers`). `deliveries-screen.jsx` passou a usar esse endpoint (`fetchDeliveryDrivers`) em vez de `fetchTeamMembers`.

Validado empiricamente: criados dois entregadores de teste em lojas diferentes via SQL direto, confirmado via Playwright que o seletor mostra só o entregador da mesma loja da rota sendo planejada, excluindo o outro.

## Bugs encontrados e corrigidos durante a implementação

1. **Import circular** (`portal_service.py → delivery_service.py → cashback_service.py → portal_service.py`): resolvido tornando o import de `DeliveryService` dentro de `PortalService._resolve_delivery_routes` um import local (dentro do corpo do método), não de módulo — sem tocar na relação pré-existente entre `cashback_service.py`/`portal_service.py`.
2. **RLS pós-commit, sexta ocorrência da mesma classe já conhecida** (ver [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|nota de segurança]]): `plan_routes()` cria/comita novas `DeliveryRoute`/`DeliveryRouteStop` e, na mesma chamada, relê via `list_active_routes()` — sem reaplicar `apply_tenant_context()` depois do commit, a releitura voltava com zero rotas (RLS filtrando tudo por falta de contexto de tenant/loja), apesar da escrita ter sido persistida com sucesso. Depurado com instrumentação temporária (`print` em pontos-chave: contagem de pedidos pendentes, tamanho dos grupos, contagem de rotas antes/depois do commit) até isolar a causa exata. Corrigido com `await apply_tenant_context(self.session, self.subject)` logo após o commit, mesmo padrão já usado em `crm_service.py`/`inventory_lot_service.py`/`pdv_service.py`/etc.
3. **Acúmulo de rotas vazias**: cada clique em "Planejar rotas" criava novas `DeliveryRoute` sem aposentar as antigas — depois de vários cliques de teste, a lista acumulava 8+ rotas com "Nenhuma parada nesta rota". Corrigido marcando `route_status = "superseded"` em todas as rotas ativas da loja antes de criar as novas (`list_active_routes` só lê `route_status IN ('planned', 'dispatched')`, então isso as remove da leitura sem apagar histórico).
4. **"-0.0 km" no badge de economia**: subtração de ponto flutuante entre distâncias quase iguais produzia um valor negativo minúsculo que `.toFixed(1)` exibe com sinal de menos. Corrigido trocando o limiar de exibição de `savedKm > 0` para `savedKm > 0.05`.

## Consequências

- `route_status` de `DeliveryRoute` agora **transiciona de fato** (`"planned"` → `"superseded"` ao replanejar) — resolve parcialmente o achado aberto nº 1 da pendência original ([[../06_Pendencias/rota-de-entrega-sem-otimizacao-real|nota]]), embora ainda não exista uma transição explícita para `"dispatched"`/`"delivered"` a partir de uma ação de "despachar rota" no frontend.
- Testado ponta a ponta via Playwright contra o Docker local, com dado de teste real (2 entregadores em lojas diferentes, pedidos pendentes reais): "Planejar rotas" com 2 entregadores da mesma loja produziu 2 rotas com distribuição geográfica coerente (fatias angulares), sem rotas vazias residuais.
- `DeliveryRouteListResponse`/`DeliveryLiveResponse` (e schemas relacionados) passaram de singular para plural em toda a cadeia (schemas, serviço, endpoint, frontend) — uma loja pode ter várias rotas ativas simultâneas, uma por entregador.

## Ver também

- [[2026-09-19-entregas-rota-otimizacao-real-e-correcoes|ADR anterior]] — otimização de ordem de visita e correções de CEP/coordenada que antecederam este trabalho.
- [[../06_Pendencias/rota-de-entrega-sem-otimizacao-real|Pendência original]] — atualizada com o que este trabalho resolveu.
- [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|RLS pós-commit]] — sexta ocorrência da mesma classe de bug, registrada nesta nota.
