---
cssclasses: ia-nota
---

# 2026-09-20 — Seed passa a usar CEPs e coordenadas reais (verificados por geocodificação reversa), não mais fórmulas sintéticas

## Contexto

Pedido do usuário: "ajuste para que utilize cep reais para que consiga testar corretamente o mapa" — depois de duas levas de correções na tela "Entregas & rota" nesta mesma sessão (traçado real via OSRM, distribuição por proximidade no despacho), o dado de teste em si (CEP e coordenada de cada pedido semeado) nunca foi real, o que limitava o quanto dava pra confiar visualmente no resultado dessas correções.

## Achado: CEP e coordenada nunca vieram de um lugar real, e nem batiam entre si

Duas fórmulas geravam esses dados, nenhuma das duas com base em endereço real:

1. **CEP dos clientes "bulk"** (`scripts/seed.py`, antiga `postal_code = f"7{1000 + (row_index * 37) % 9000:04d}-{100 + row_index % 900:03d}"`): produz uma string no formato `7XXXX-XXX` (prefixo `7` bate com o padrão real do DF), mas os dígitos em si são só aritmética determinística — nenhuma relação com um CEP de verdade.
2. **Coordenada de cada entrega no lote "dia de operações"** (`recipient_lat/lng = store.latitude/longitude + offset(i)`): um pequeno deslocamento a partir da própria loja, **sem nenhuma relação com o distrito/CEP** que o mesmo registro afirmava (`address.district`, `address.postal_code`) — um pedido podia dizer "Ceilândia, CEP tal" e ter uma coordenada a poucos km da loja em Gama, nada perto da Ceilândia real.

Confirmado batendo os CEPs antigos contra o Nominatim real (mesmo serviço já usado em produção para geocodificação, ver [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]]): `72426-070` e `71916-540` (os CEPs das próprias lojas) devolviam as duas o mesmo resultado genérico — Banco Central do Brasil, Setor Bancário Sul, Brasília — confirmando que eram inválidos/não localizáveis, não apenas "de bairro errado".

## Correção

Nova tabela `REAL_DF_DISTRICT_ADDRESSES` no topo de `scripts/seed.py` — um `(CEP, latitude, longitude, nome de rua real)` por distrito já usado em todo o resto do seed (Águas Claras, Taguatinga Norte, Taguatinga Sul, Ceilândia, Samambaia, Guará, Ponte Alta Norte, Vicente Pires). Cada entrada foi obtida por **geocodificação reversa real** contra o Nominatim (não digitada de memória) — pedindo "que CEP existe neste ponto real do DF" em vez de inventar uma string e uma coordenada por conta própria e torcer para que fizessem sentido juntas.

Usos trocados para essa tabela:
- As 5 `CustomerAddress` nomeadas (mariana, lucas, camila, bianca, rafael) — CEP trocado, mantendo o mesmo distrito que já tinham.
- `delivery_points` (coordenadas dessas mesmas 5 contas, usadas nos pedidos "nomeados" tipo `online_delivered`/`online_in_transit`) — agora vêm da mesma tabela, com pequeno jitter determinístico por conta pra não empilhar mariana/camila (as duas em "Ponte Alta Norte") no mesmo ponto exato.
- A fórmula de CEP dos ~25 clientes "bulk" — trocada por lookup direto em `REAL_DF_DISTRICT_ADDRESSES[customer.district_label]`; o `street_line` desses clientes também passou a citar o nome de rua real da tabela em vez de um "Rua N, Quadra M" genérico.
- A coordenada de cada entrega do lote "dia de operações" (25 pedidos online simulados) — para `fulfillment_type == "delivery"`, vem de `real_district_point(address.district, i)` (mesma âncora real do distrito do endereço, com jitter de ~0-250m por índice do pedido); para `pickup`, continua sendo a coordenada real da própria loja (correto — o cliente retira lá).
- Novo helper `real_district_point(district, jitter_index)` — centraliza o jitter determinístico, reaproveitado nos dois pontos acima.

**Fora do escopo, deliberadamente**: os CEPs/endereços das duas lojas (`STORE_ADDRESS`/`SECOND_STORE_ADDRESS`) não foram tocados — mudar identidade de loja tem raio de impacto maior (nota fiscal, CNPJ, várias outras referências) e o pedido era especificamente sobre testar o mapa de entregas, não a ficha cadastral da loja. Ficam com o mesmo CEP sintético de antes; considerar numa leva separada se isso também importar.

## Consequências

- Testado com reset completo (`docker compose down -v && up --build`, ok reaplicar em dev local — ver memória de sessão sobre reset de ambiente) e conferência direta no Postgres: todo `customer_addresses.postal_code`/`order_fulfillments.postal_code` agora é um dos 8 CEPs reais da tabela, e o mesmo CEP resolve pro distrito certo quando geocodificado de volta contra o Nominatim ao vivo.
- Testado na tela real "Entregas & rota": endereços na lista "Aguardando planejamento" agora mostram rua real ("Avenida Pau Brasil", "QNM 15", "QSB 7", "Ponte Alta Norte Chácara 5", "QE 24 Conjunto F") com CEP real ao lado, e os pontos no mapa aparecem espalhados pelas cidades-satélite reais (Samambaia, Ceilândia, Taguatinga, Águas Claras, Recanto das Emas/Gama) em vez de agrupados artificialmente perto da loja.
- Um distrito ("Ponte Alta Norte") ficou com um CEP real (`72649-703`) que o Nominatim hoje atribui a "Recanto das Emas" (bairro vizinho), não ao nome exato "Ponte Alta Norte" usado no rótulo — inevitável em alguma medida, já que o Distrito Federal tem zonas de CEP bem mais largas que bairro/subdivisão informal, e nem toda subdivisão tem polígono próprio nos dados do OSM. CEP e coordenada continuam mutuamente reais e consistentes entre si, que é o que importa pro teste de mapa/roteirização — só o rótulo de bairro no texto não é 100% preciso nesse caso específico.
- Reset local apaga qualquer dado de teste manual acumulado na sessão anterior (rotas/pedidos criados via curl/UI nas levas de trabalho anteriores) — esperado e já coberto pela política de "reset de dev é ok" já registrada.

## Ver também

- [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]] — mesmo serviço usado para verificar cada entrada da tabela nova.
- [[../07_POPs_Processos/resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] — atualizado com a nova composição do seed.
- [[2026-09-20-despacho-anexa-parada-por-proximidade-e-zoom-do-mapa-nao-reseta|ADR anterior de hoje]] e [[2026-09-20-entregas-rota-real-via-osrm-e-mapa-mostra-todos-os-pendentes|ADR anterior de hoje (2)]] — as correções de mapa que este dado real agora permite validar visualmente de verdade.
