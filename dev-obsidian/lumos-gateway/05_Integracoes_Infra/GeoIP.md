# GeoIP — bloqueio por país (MaxMind GeoLite2)

**Tipo:** Infraestrutura (segurança de borda)

## Propósito

Restringir acesso ao gateway apenas a visitantes de países configurados numa allowlist, usando a base MaxMind GeoLite2-Country.

## Contrato

- `nginx/conf.d/05-geoip.conf.template` — usa o módulo `libnginx-mod-http-geoip2` (compilado na imagem, `Dockerfile`) para resolver `$geoip2_data_country_name` a partir de `$remote_addr`.
- Base de dados: `geoip/GeoLite2-Country.mmdb` — **está commitada no repositório** apesar do `.gitignore` dizer que deveria ser "baixada em runtime"; a infraestrutura de secret (`GEOIP_LICENSE_KEY_FILE`) para baixar via licença MaxMind existe no `docker-compose.yml`/`entrypoint.sh` mas nunca foi de fato conectada a um mecanismo de download — ver [[../04_Seguranca_Riscos/supply-chain-e-hardening-diversos|achado relacionado]].
- Países liberados hoje (conforme `README.md`): Brasil (`BR`), Costa Rica (`CR`), República Dominicana (`DO`), Estados Unidos (`US`), Portugal (`PT`), Espanha (`ES`), França (`FR`), Itália (`IT`), Alemanha (`DE`), Reino Unido (`GB`), Argentina (`AR`), Uruguai (`UY`), Chile (`CL`), Canadá (`CA`), Dinamarca (`DK`).
- Lógica de decisão (`$deny_country`): permite se QUALQUER uma destas condições for verdadeira — país na allowlist, origem interna (`$is_internal_source`, RFC1918/loopback), desafio ACME em andamento (`$is_acme_challenge`), ou descoberta pública liberada (`$allow_public_discovery` — só quando `ENVIRONMENT=production` **E** método seguro (GET/HEAD) **E** URI casa exatamente `/robots.txt`, `/sitemap.xml`, `/llms.txt` ou variação de sitemap XML). Verificado em 2026-08-19 que esse bypass de descoberta está corretamente escopado, sem vazar para rotas sensíveis.
- Existem 4 variáveis `$lumos_forwarded_client_*` definidas neste template para aceitar IP/país/UA declarados por header do próprio cliente — **não usadas em nenhuma decisão real hoje** (código morto), mas com risco de virar bypass de geoip se alguém um dia conectá-las sem antes restringir a origem confiável desses headers — ver [[../04_Seguranca_Riscos/supply-chain-e-hardening-diversos|achado relacionado]].

## Dependências

- `Dockerfile` — instala `libnginx-mod-http-geoip2` via apt (sem pin de versão).
- Licenciamento MaxMind: redistribuir o binário `.mmdb` versionado no Git pode não estar de acordo com os termos de licença da MaxMind (exige licença própria por usuário/organização) — ponto de atenção, não resolvido nesta auditoria.

## Atualizações

- 2026-08-19: nota criada.
