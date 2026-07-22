# lumos-gateway (integração)

**Tipo:** Infraestrutura / integração interna

## Propósito

Farmaura-api roda atrás do gateway Nginx compartilhado `lumos-gateway`, que também serve o ecossistema Lumos. O backend nunca é exposto diretamente ao público.

## Contrato

- `farmaura-api/docker-compose.gateway.yml` (overlay) conecta apenas o serviço `farmaura-api` à rede Docker externa `lumos_gateway`.
- `app/main.py`, `api/middleware/security_headers.py` e `api/middleware/body_limits.py` documentam explicitamente a suposição de rodar atrás do gateway (headers e limites de corpo alinhados, não duplicados).
- Histórico do próprio `lumos-gateway` confirma a extensão recente: commit `8a4d85c` ("adjustment to start farmaura development") — o gateway passou a também rotear para `farmaura-api`.

## Dependências

- Nunca publicar a porta do `farmaura-api` diretamente no host além da rede do gateway, salvo debug local documentado — ver skill [[secure-service-communication]].
- Config de roteamento específica do Farmaura dentro do `lumos-gateway` (arquivo `nginx/conf.d/`) não foi localizada nominalmente pela pesquisa — confirmar nome do template quando for mexer nesse roteamento.

## Ver também

- [[Lumos_Gateway_Roteamento]] — mesmo gateway, documentado do lado LumosMed (roteamento detalhado por template Nginx).
- [[chaves-privadas-tls-expostas-no-historico-git]] — vulnerabilidade crítica encontrada neste mesmo repositório de gateway, relevante para ambos os produtos.
- [[Docker_Compose]] — overlay que conecta o `farmaura-api` a esta rede.

## Atualizações

- 2026-07-19: nota criada.
