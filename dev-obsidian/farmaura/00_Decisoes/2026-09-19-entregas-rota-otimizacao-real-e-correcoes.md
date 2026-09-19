---
cssclasses: ia-nota
---

# 2026-09-19 — Entregas & Rota: otimização real, CEPs/coordenadas corretas, localização do entregador confirmada

## Contexto

Pedido do usuário: "analise e faça com que funcione corretamente, com os CEPs corretos, rota correta puxando a localização do entregador, etc." — sem indicar um bug específico. Abri a tela real contra o Docker local com dado de seed e comparei com o que o backend realmente faz (não só o que a UI sugere).

## O que já funcionava de verdade (confirmado, não mudei)

- Compartilhamento de localização do entregador: geolocalização real do navegador (`navigator.geolocation.watchPosition`), throttle de 10s, `POST /deliveries/my-route/location`, upsert em `driver_locations`, polling do admin a cada 10s via `GET /deliveries/routes/live`. Testado ponta a ponta nesta sessão (duas sessões Playwright simultâneas — entregador compartilha, admin vê o marcador verde no mapa com o horário certo) — funciona.
- Endpoint de entrega do motorista (`/deliveries/my-route`, `.../deliver`), atribuição de entregador (`PATCH /deliveries/routes/{id}/driver`) — reais, sem mock.

## Bugs reais encontrados e corrigidos

1. **Rota escolhida sem filtrar por loja** (`PortalService._resolve_delivery_route`, `app/services/portal_service.py`): a query pegava a `DeliveryRoute` mais recente do **tenant inteiro**, ignorando `store.id` (que a função recebia como parâmetro mas nunca usava no filtro). Com 2 lojas cadastradas, isso podia devolver a rota de uma loja diferente da que o usuário estava vendo — a tela mostrava "0 km / 0 min" porque a rota escolhida não tinha nenhuma parada em comum com os pedidos pendentes reais. Corrigido adicionando `DeliveryRoute.store_id == store.id` ao filtro, igual ao padrão que `OrderRepository.get_active_delivery_route` já usava (só faltava replicar aqui).
2. **Pedidos finalizados nunca saíam da lista de "pendentes"**: tanto o filtro do frontend (`deliveries-screen.jsx`) quanto a query nova do backend usavam `status !== "dispatched"` como critério de "ainda pendente" — isso deixa `delivered` e `cancelled` passarem, então um pedido já entregue há semanas continuava aparecendo como parada pendente pra sempre (achado concreto: pedido `FA-CPN-SAUDE15-ONLINE`, já `delivered`, aparecia como parada #19 sem CEP/endereço/coordenada nenhuma, porque é um atalho de seed que nunca passou por geocodificação real). Corrigido com dois helpers novos e compartilhados em `core/internal-shell.jsx` — `isActiveOrderStatus` (`new`/`separating`/`ready`) e `isFinishedOrderStatus` (`dispatched`/`delivered`) — usados agora em `deliveries-screen.jsx` **e** substituindo as versões que já existiam duplicadas localmente em `orders-screen.jsx` (mesma dupla de funções, escritas ontem nessa outra tela; consolidadas aqui pra não divergir). Backend replicou o mesmo filtro (`Order.status IN ('new','separating','ready')`) na query de paradas.
3. **Nenhuma rota real, só ordem de inserção**: `DeliveryPricingService.attach_route_stop` sempre fez só `append` (sequência = ordem de chegada dos pedidos, nunca reordenado por distância) — e os campos `saved_distance_km`/`estimated_duration_minutes` de `DeliveryRoute` nunca foram escritos em lugar nenhum do backend real, só como valor fixo no `seed.py` (`saved_distance_km=money("0.80")`, sempre o mesmo número independente da rota real). Ver [[../06_Pendencias/rota-de-entrega-sem-otimizacao-real|pendência original]], agora parcialmente resolvida.
4. **Coordenada `(0,0)` tratada como válida**: `getCoordinates()` só checava `lat/lng != null`, então um endereço com geocodificação silenciosamente falha (ver [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]]) — coordenada `0.0000000,0.0000000` — passava como "tem coordenada", plotando marcador na Baía de Benin e inflando qualquer cálculo de distância. Novo helper `hasRealCoordinates()` trata isso como ausente, tanto no mapa (`RouteMap`) quanto no cálculo de rota e no badge "sem coordenada" da lista.

## Decisão: otimização real, calculada no cliente sobre o que a tela já mostra

Em vez de persistir a rota otimizada no backend (`DeliveryRoute.saved_distance_km`/`estimated_duration_minutes`), o cálculo passou a rodar **no frontend**, sobre a lista `stops` que a tela já monta (paradas anexadas à rota do backend + pedidos ativos de entrega que nunca foram anexados a nenhuma rota — esse fallback já existia, mas evidenciou um problema real: no seed local, só 1 dos 9 pedidos realmente pendentes tinha uma `DeliveryRouteStop` de verdade associada; os outros 8 só aparecem porque o frontend já tinha esse fallback). Calcular no backend, sobre uma única `DeliveryRoute` escolhida, herdaria esse mesmo gap — o número mostrado bateria só com a fração dos pedidos que o backend conseguiu anexar, não com a lista real exibida.

- Novo módulo puro `app/domain/geo.py` (`haversine_km`, `route_length_km`, `nearest_neighbor_order`) — sem I/O, reaproveitável. `DeliveryPricingService.haversine_km` (usado para preço de frete) passou a delegar pra lá em vez de duplicar a fórmula.
- Backend (`_resolve_delivery_route`) também passou a reordenar por nearest-neighbor e calcular km/economia real para as paradas que **estão** anexadas à rota — mantém `route.optimizedOrder` útil como pré-ordenação para quem tem stop de verdade.
- Frontend (`deliveries-screen.jsx`) tem sua própria cópia em JS dos mesmos três algoritmos (`haversineKm`, `routeLengthKm`, `nearestNeighborOrder`) e recalcula por cima da lista completa (`stops` = anexados + não-anexados), com origem = coordenada real da loja. ETA usa velocidade média de 22 km/h (trânsito urbano) + 5 min de parada por endereço — estimativa real, não mais "25 min × paradas" fixo do seed.
- Mensagem "rota otimizada economiza ~X km" só aparece quando `X > 0` — antes aparecia sempre, mesmo quando não havia nada a economizar (1 parada só, ou já ótima).

## Consequências

- Testado contra o Docker local: "9 entregas pendentes" bate exatamente com a contagem real de pedidos de entrega em `new`/`separating`/`ready` (`3+4+2=9`, conferido direto no Postgres); distância foi de "9 km" (número sem sentido, herdado de uma rota errada) para "26.1 km" (real, somando pernas Ponte Alta Norte → Taguatinga → Águas Claras → Ceilândia → Guará → Vicente Pires em sequência otimizada); economia foi de um "~0.8 km" hardcoded pra um "~76.1 km" real (a ordem de chegada original saltava de um lado a outro do DF repetidamente).
- Limitação residual conhecida, não corrigida agora: existem **duas** `DeliveryRoute` linhas para a mesma loja no dado de seed (`519c63e0`/`2bf24197`, ambas "Ponte Alta Norte") — artefato de como o seed cria dados, não do código real de criação de pedido (`attach_route_stop` sempre reaproveita a rota ativa da loja via `get_active_delivery_route`, então isso não deveria acontecer em produção). A função só olha a mais recente das duas; o fallback do frontend (pedidos não anexados) cobre a lacuna para exibição, mas `route.optimizedOrder`/`route.driver` ainda refletem só essa rota escolhida.
- `route_status` de `DeliveryRoute` continua nunca transicionando de `"planned"`, e `navigation_url` de `DeliveryRouteStop` continua não populado — achados relacionados da pendência original, não endereçados nesta leva (baixa prioridade, não bloqueiam a operação).

## Ver também

- [[../06_Pendencias/rota-de-entrega-sem-otimizacao-real|Pendência original]] — atualizada com o que foi resolvido e o que segue aberto.
- [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]] — origem do padrão de coordenada `(0,0)` como falha silenciosa de geocodificação.
- [[2026-09-19-pedidos-online-pagamento-traduzido-prazo-e-priorizacao-automatica|Pedidos Online: prazo e priorização automática]] — mesma sessão anterior introduziu `isActiveOrderStatus`/`isFinishedOrderStatus` como funções locais em `orders-screen.jsx`; agora movidas para `internal-shell.jsx` e compartilhadas com esta tela.
