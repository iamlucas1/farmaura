# lumos-gateway (roteamento específico do LumosMed)

**Tipo:** Infraestrutura / integração interna

## Propósito

Ponto de entrada público único para `lumosmed` (Laravel) e `lumos-api` (Python), com TLS, GeoIP e Fail2ban centralizados.

## Contrato

- `lumos-gateway/nginx/conf.d/30-lumosmed.conf.template` — roteia para `lumosmed_upstream` (Laravel, porta 8000). Tem locations dedicadas além do catch-all: `/app/prontuario/audio/interpretar` (corpo grande, timeout longo — transcrição de áudio) e uma família de rotas `^/app/telemedicina/salas/...` / `/telemedicina/guest/...` (sinalização WebRTC — SDP/ICE, diagnósticos, eventos, aprovação de participante) com `proxy_buffering off` — ou seja, **o próprio Laravel hospeda sinalização de telemedicina**, não é só a casca da SPA.
- `lumos-gateway/nginx/conf.d/21-lumos-api.conf.template` — roteia direto para o upstream Python (`https://${LUMOS_API_UPSTREAM}:8443`), com location dedicada para `/v1/whatsapp/meta/webhook` (rate-limit e `client_max_body_size` próprios).
- GeoIP (`05-geoip.conf.template`): allowlist de país (`$allowed_country`) via MaxMind GeoLite2-Country — explicitamente documentado como "não deve ser usado para decisão de auth/authz", só filtragem de borda.
- Fail2ban: jails `nginx-badbots`, `nginx-probes`, `nginx-fake-searchbots`, `nginx-limit-req` sobre os logs do Nginx.
- Certbot: rotação de certificado documentada em `lumos-gateway/RUNBOOK-TLS-ROTATION.md` (ver [[resposta-a-chave-tls-exposta-em-git]] em `_Compartilhado/POPs_Processos/`).
- O mesmo gateway também fronteia outros sites não relacionados (`lumosneon`, `michele`, `thamara`, `adcrdf`, `horizon`) e, desde `8a4d85c`, o Farmaura ([[Lumos_Gateway]]) — é infraestrutura genuinamente compartilhada, não exclusiva do Lumos.

## Dependências

- Qualquer novo endpoint de longa duração ou alto volume (como o de áudio) precisa de ajuste explícito nesse template — não assumir os limites default do catch-all.

## Ver também

- [[chaves-privadas-tls-expostas-no-historico-git]] — vulnerabilidade crítica encontrada neste mesmo repositório de gateway.
- [[WhatsApp_Meta]] — webhook Meta roteado por este gateway (`/v1/whatsapp/meta/webhook`).

## Atualizações

- 2026-07-19: nota criada.
