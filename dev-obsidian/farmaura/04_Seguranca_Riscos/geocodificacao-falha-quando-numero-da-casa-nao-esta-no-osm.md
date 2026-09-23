---
cssclasses: ia-nota
---

# Geocodificação falhava por inteiro quando o número da casa não está mapeado no OSM

**Tipo:** Runbook de incidente
**Severidade:** Média
**Status:** Resolvido
**Data de identificação:** 2026-09-23

## Descrição

Checkout de entrega em `lumos-dev` respondia 422 "Não foi possível localizar seu endereço.
Confira o CEP e tente novamente." para um endereço real e corretamente digitado (Quadra QNN 8
Conjunto P, 19A, Ceilândia Sul, Brasília-DF, CEP 72220-096) — dentro da região coberta pelo
extrato OSM importado (Centro-Oeste), então não era o caso já conhecido de região fora do
extrato.

Isolado testando a query do Nominatim self-hosted diretamente por dentro do container
`farmaura_api` (`docker exec ... python3 -c "urllib.request..."` contra
`http://farmaura-nominatim:8080/search`): a busca com o endereço completo (rua + **número**,
bairro, cidade, UF, CEP) devolvia `[]`; a mesma busca **sem o número** ("Quadra QNN 8 Conjunto
P, Ceilândia Sul, Brasília, DF, 72220-096") encontrava o prédio normalmente. Comportamento
conhecido do Nominatim: quando a query inclui um número que não está tagueado como
`addr:housenumber` naquele trecho de via no OSM (comum em dados residenciais do Brasil, mesmo
dentro de áreas "cobertas"), ele rejeita a busca inteira em vez de cair para o nível de
rua/prédio — não é specific do extrato self-hosted, o Nominatim público tem a mesma limitação
para ruas sem numeração completa mapeada.

`GeocodingClient.geocode()` (`app/services/geocoding_client.py`) não tinha nenhum fallback: uma
falha do Nominatim (por qualquer motivo) sempre virava `None` silencioso, sem log — por isso o
diagnóstico exigiu reproduzir a query manualmente, não deu pra ver a causa direto no log.

## Impacto

Bloqueava por completo o checkout de **entrega** (`delivery`/`motoboy`) para qualquer endereço
real cujo número da casa não esteja tagueado no OSM — situação comum, não uma exceção rara.
Afeta potencialmente produção também (`lumos-prd`), não só este ambiente de teste, já que o
código do `GeocodingClient` é o mesmo independente de qual instância Nominatim (self-hosted ou
pública) está configurada — ver [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]].
Retirada na loja (`pickup`) não é afetada (não depende de geocodificação do endereço do
cliente).

## Mitigação / Tratamento

`GeocodingClient.geocode()` agora tenta de novo, uma vez, removendo um token final que parece
número de casa (`19A`, `123`, regex `_TRAILING_HOUSE_NUMBER_RE`) do primeiro segmento do
endereço quando a busca completa não encontra nada — cai para o nível de rua/prédio em vez de
falhar o endereço inteiro. Resultado do fallback é cacheado normalmente (mesma chave: o endereço
original completo). Adicionado log estruturado (`geocode_fallback_used` /
`geocode_not_found`) para o caso continuar diagnosticável — logando sempre a versão **sem** o
número (nunca o endereço original com número, que é PII de endereço do cliente).

Não corrigido nesta sessão: a coordenada resultante do fallback é a do prédio/rua, não da casa
exata — aceitável para cálculo de frete por distância e escolha de loja mais próxima (margem de
poucos metros), mas seria impreciso para algo que exigisse a coordenada exata da porta.

## Referências

Integração: [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]]. Relacionado à
pendência [[../06_Pendencias/subir-nominatim-auto-hospedado-em-producao|subir-nominatim-auto-hospedado-em-producao]]
(mesma integração, ainda pendente aplicar em produção).

## Atualizações

- 2026-09-23: nota criada, incidente já corrigido no mesmo commit.
