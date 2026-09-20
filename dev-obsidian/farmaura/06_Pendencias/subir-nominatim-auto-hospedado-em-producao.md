---
cssclasses: ia-nota
---

# Subir `farmaura-nominatim` (geocodificação auto-hospedada) em staging/produção

**Status:** Aberto
**Prioridade:** Alta — deploy do backend sem isso quebra geocodificação em produção, silenciosamente
**Registrado em:** 2026-09-20

## Descrição

Ver [[../00_Decisoes/2026-09-20-nominatim-auto-hospedado-substitui-instancia-publica|ADR]]: o
`docker-compose.yml` base ganhou um novo serviço `farmaura-nominatim` (Nominatim auto-hospedado,
imagem `mediagis/nominatim:5.3.2`, extrato OSM do Centro-Oeste) e `farmaura-api` passou a apontar
`APP_GEOCODING_BASE_URL` para ele (`http://farmaura-nominatim:8080`) **nesse mesmo arquivo base**
— não só em dev. `docker-compose.prod.yml`/`docker-compose.staging.yml` não sobrescrevem essa
variável, então herdam o mesmo valor.

**Consequência concreta**: assim que este código for deployado em staging (`lumos-dev`) ou
produção sem o serviço `farmaura-nominatim` também estar rodando lá, toda geocodificação passa a
falhar (fechado — sem coordenada, sem crash, mas sem funcionar) porque `farmaura-api` tenta
alcançar um serviço que não existe no ambiente. Isso afeta: cálculo de frete por distância,
resolução de loja mais próxima, endereços de checkout, endereços de PDV, e o novo picker de mapa
do marketplace.

## O que falta fazer (só sob pedido explícito do usuário — nunca por iniciativa própria, ver
`dev-obsidian/CLAUDE.md` → "Regras de deploy")

1. Confirmar que o servidor (`lumos-prd`/`lumos-dev`) tem RAM/disco suficiente para o import do
   extrato Centro-Oeste (~200MB de PBF; a importação com índices tende a usar bem mais que isso —
   confirmar antes de rodar, não assumir).
2. `docker compose -f docker-compose.yml -f docker-compose.<prod|staging>.yml -f docker-compose.gateway.yml up -d farmaura-nominatim` no servidor, **antes** de atualizar `farmaura-api` para a versão que já espera esse serviço — ou os dois numa mesma leva de deploy, nunca `farmaura-api` sozinho na frente.
3. Acompanhar a importação (`docker compose logs -f farmaura-nominatim`) até `status.php` responder OK antes de considerar o deploy concluído.
4. Se o servidor não tiver capacidade para isso, alternativa é manter `APP_GEOCODING_BASE_URL` apontando pra instância pública só nesses ambientes (via `.env` do servidor, que tem precedência sobre o valor do compose base) — mas nesse caso perde-se o benefício de throttle mais rápido/sem terceiro que motivou a decisão original.

## Ver também

- [[../00_Decisoes/2026-09-20-nominatim-auto-hospedado-substitui-instancia-publica|ADR desta decisão]].
- [[../07_POPs_Processos/publicar-staging-lumos-dev|publicar-staging-lumos-dev]] — processo de publicação onde este passo precisa ser incluído.
