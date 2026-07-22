# WhatsApp (Meta Graph API)

**Tipo:** API de terceiro

## Propósito

Conversas, mensagens e mídia de WhatsApp integradas ao portal da clínica.

## Contrato

- Lado Python: `lumos-api/domains/lumosmed/services/meta_whatsapp.py` — fala com a Graph API da Meta (`WhatsAppSettings.graph_base_url`, padrão `https://graph.facebook.com`), via `requests.Session` com `HTTPAdapter` próprio.
- Lado Laravel: `Portal/PortalWhatsAppApiController.php` faz proxy de conversas/mensagens/mídia através do `LumosApiClient`.
- Webhook dedicado no gateway: `/v1/whatsapp/meta/webhook`, com zona de rate-limit própria e `client_max_body_size 1m` — ver [[Lumos_Gateway_Roteamento]].
- Rota Laravel de alto custo: `/app/prontuario/audio/interpretar` (transcrição de áudio), com timeout e limite de corpo maiores no gateway.

## Dependências

- Depende de credenciais/tokens da Meta configurados no lado `lumos-api` (não documentar valor real aqui).

## Atualizações

- 2026-07-19: nota criada.
