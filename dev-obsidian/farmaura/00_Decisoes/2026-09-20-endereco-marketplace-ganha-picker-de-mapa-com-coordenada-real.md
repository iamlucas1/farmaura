---
cssclasses: ia-nota
---

# 2026-09-20 — Endereço do marketplace passa a guardar coordenada real confirmada no mapa, além do texto digitado

## Contexto

Pedido do usuário: "sempre tem que ter o endereço que o cliente coloca, mas também no marketplace faça pesquisar no mapa, puxe a localização exata, salve as coordenadas para que possamos também ter os dois dados." — o endereço digitado continua sendo obrigatório e a fonte de verdade; a coordenada real confirmada no mapa passa a ser um dado adicional, opcional, guardado junto.

## Estado anterior

`CustomerAddress` (endereço salvo do cliente, `customer_addresses`) nunca teve `latitude`/`longitude` — só existiam coordenadas em `OrderFulfillment`/`DeliveryRouteStop`, sempre derivadas de geocodificação automática do texto **no momento do pedido**, nunca de uma confirmação visual do próprio cliente. Não existia nenhum mapa em lugar nenhum do fluxo de cadastro/edição de endereço do marketplace — só autocompletar por CEP via ViaCEP (sem coordenada nenhuma, só texto).

## O que foi construído

**Backend:**
- Migration `20260920_02_customer_address_coordinates` — `customer_addresses.latitude`/`longitude` (`Numeric(10,7)`, **nullable**, sem valor padrão). Nullable de propósito: `NULL` significa "endereço só digitado, nunca confirmado no mapa" — diferente de "confirmado em (0,0)", então não existe valor de fallback como em `OrderFulfillment` (onde `(0,0)` significa "geocodificação automática falhou" — convenção antiga que não se aplica aqui, pois aqui não há geocodificação automática de fallback nenhuma).
- `CustomerAddressUpsertRequest`/`CustomerAddressResponse` (`app/schemas/customers.py`) ganharam `latitude`/`longitude` opcionais; `CustomerService.create_address`/`update_address`/`_build_address_response` passam a persistir e devolver os dois campos.
- Novo endpoint `GET /customers/me/addresses/search?query=` (`CustomerService.search_addresses`) — reaproveita o `GeocodingClient.search()` já existente (mesmo cliente usado pelo endereço interno `/internal/address-search` do portal), só que com autenticação de cliente do marketplace (`require_marketplace_subject(UserRole.CUSTOMER)`) em vez de admin/PDV — o customer não tinha (e não devia ter) acesso à rota interna.

**Frontend (marketplace):**
- Novo componente `AddressMapPicker` (`screens/account-profile-screen.jsx`) — mapa Leaflet real (mesmo padrão `loadLeaflet()` já usado no mapa estático da loja em `checkout-screen.jsx`, mesmo ícone de pin `fa-map-pin-icon`), com:
  - Busca por texto (botão "Buscar", **não busca a cada tecla digitada** — o `GeocodingClient` do backend já se auto-limita a ~1 requisição/segundo *para o processo inteiro*, não por usuário, então digitação ao vivo multiplicaria carga sobre um recurso compartilhado e enfileiraria a busca de todo mundo; um clique explícito mantém isso previsível).
  - Clique no mapa ou arraste do marcador — os dois chamam `onConfirm({ lat, lng })` direto da posição real do Leaflet, sem outra chamada de geocodificação.
  - Mensagem de status deixando claro que o texto digitado continua valendo e o mapa é só um dado extra.
- `AddressForm` (compartilhado entre "Meus endereços" e o modal de novo endereço do checkout) ganhou o picker, sem tornar `lat`/`lng` obrigatórios pra salvar — a validação existente (CEP, rua, bairro, cidade, UF, destinatário) não mudou.
- `marketplace-address.js` (`createEmptyAddress`/`normalizeAddress`) e o par `toBackendAddressPayload`/`fromBackendAddress` (`marketplace-app.jsx`) ganharam `lat`/`lng` no fluxo de ida e volta com o backend.

## Escopo deliberadamente fora desta leva

O fluxo de **criação de pedido** (`OrderService`/`DeliveryPricingService.resolve_geo_from_store`) continua geocodificando o texto do endereço do zero a cada pedido — não foi alterado para preferir a coordenada já confirmada num `CustomerAddress`, mesmo quando ela existe. O pedido do usuário foi especificamente sobre capturar/guardar os dois dados no cadastro de endereço; usar a coordenada salva para pular a geocodificação no checkout é uma extensão natural e de baixo risco, mas não foi pedida explicitamente nem implementada agora — fica como possível próximo passo.

## Consequências

- Testado ponta a ponta: `POST /customers/me/addresses` com `latitude`/`longitude` reais persiste e devolve os dois campos; um endereço já existente do seed (sem confirmação de mapa) continua voltando com `latitude: null, longitude: null` — confirma que o dado é genuinamente opcional, não quebra endereços antigos.
- Testado via Playwright contra a UI real: login como cliente, "Meus endereços" → editar um endereço já com pin confirmado (mapa mostra o pin real na posição certa, mensagem "Localização confirmada"); "Adicionar endereço" → buscar "Avenida Pau Brasil, Águas Claras" → selecionar resultado → mapa recentra e posiciona o pin exatamente no ponto real devolvido pelo Nominatim.
- Resultado do `GET .../addresses/search` já usa dado real (não sintético) — testado contra o Nominatim ao vivo, mesma infraestrutura já validada em [[2026-09-20-cep-e-coordenadas-reais-no-seed-para-testar-o-mapa|ADR anterior de hoje]] sobre CEPs reais no seed.

## Ver também

- [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]] — o mesmo `GeocodingClient` reaproveitado aqui, incluindo a nota sobre auto-throttle de ~1 req/s por processo (motivo direto da decisão de busca por clique, não por digitação).
- [[2026-09-20-cep-e-coordenadas-reais-no-seed-para-testar-o-mapa|ADR anterior de hoje]] — CEPs/coordenadas reais no seed, mesma preocupação de fundo (dado de endereço real, não só plausível).
- [[../06_Pendencias/aplicar-migration-customer-address-coordinates-em-producao|Pendência: aplicar a migration em produção]] — bloqueante, quebra o cadastro de endereço existente se o deploy for sem ela.
