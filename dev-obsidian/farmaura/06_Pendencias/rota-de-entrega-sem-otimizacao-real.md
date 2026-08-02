# Rota de entrega sem otimização/roteirização real, apesar da UI sugerir

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-25

## Descrição

O frontend do console interno (`deliveries-screen.jsx`) exibe linguagem de produto como "Melhor rota planejada" e "Rota otimizada economiza ~X km", mas o backend nunca calcula uma rota otimizada de fato: `DeliveryPricingService.attach_route_stop` só faz `append` de cada novo pedido na sequência da rota, na ordem em que ficam prontos para despacho — sem TSP, sem reordenação por distância. Os campos `saved_distance_km`, `estimated_duration_minutes`, `route_polyline` e `vehicle_label` de `DeliveryRoute` nunca são escritos em nenhum lugar do backend, então o "~X km economizados" mostrado na tela é sempre 0 na prática.

Achados relacionados no mesmo levantamento (podem ser tratados junto ou separadamente):
- `route_status` de `DeliveryRoute` nunca transiciona de `"planned"` — o botão "Despachar rota" no frontend não aciona nenhum endpoint de rota, só avança pedidos individualmente.
- `navigation_url` de `DeliveryRouteStop` nunca é populado — o frontend sempre cai no fallback de deep-link do Google Maps.

## Contexto

Encontrado ao documentar [[../02_Documentacao/Modulo_Entrega|Modulo_Entrega]]. Não é uma decisão registrada em nenhum ADR — parece lacuna de implementação (feature de produto sinalizada na UI, sem o motor correspondente no backend), não uma limitação aceita conscientemente. Prioridade baixa porque não impede a operação (entregas continuam funcionando, só sem otimização real de sequência).
