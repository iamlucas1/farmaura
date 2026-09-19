---
cssclasses: ia-nota
---

# Confirmar se `lumos_gateway_fail2ban` em produção (`lumos-prd`) também está sem `TZ`

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-18

## Descrição

[[../../lumos-gateway/04_Seguranca_Riscos/fail2ban-timezone-quebra-deteccao-rate-limit|fail2ban-timezone-quebra-deteccao-rate-limit]] confirmou, num teste 100% local, que o jail `nginx-limit-req` do `fail2ban` nunca bane ninguém porque o container não tem `TZ` definido (fica em UTC) enquanto o nginx loga em horário local — causa raiz confirmada por leitura direta do `docker-compose.yml` deste repositório (`lumos_gateway_fail2ban` não declara `TZ`, `gateway_nginx` declara `TZ: America/Sao_Paulo`).

**Não verificado neste teste**: se o servidor real de produção (`lumos-prd`, `/opt/lumos-gateway`) roda exatamente esse mesmo `docker-compose.yml`, ou se há drift (já documentado historicamente em [[../../farmaura/05_Integracoes_Infra/Lumos_Gateway|farmaura/Lumos_Gateway]] — "git e servidor divergem tanto no conteúdo quanto no branch"). Se o servidor real também estiver sem `TZ` no serviço `fail2ban`, o jail de rate-limit está inoperante em produção agora, não só localmente.

## Contexto

Ficou pendente porque o teste que encontrou isso rodou inteiramente numa stack local (certificados self-signed, upstreams stub) — nunca tocou o servidor de produção (fora dos limites da política de teste). Confirmar isso exige acesso real a `lumos-prd` (`ssh lumos-prd`, ver topologia em [[../../farmaura/05_Integracoes_Infra/Lumos_Gateway|Lumos_Gateway]]) e comparar o `docker-compose.yml` real rodando lá com o deste repositório antes de aplicar qualquer correção — nunca sobrescrever sem diff prévio.
