# Google Analytics (gtag.js)

**Tipo:** API de terceiro

## Propósito

Rastreamento de navegação de clientes no marketplace público — page views e eventos automáticos do
GA4 via `gtag.js`. Pedido do usuário para acompanhar tráfego real do site pela plataforma do Google
Analytics.

## Contrato

- Snippet oficial do Google (`gtag.js` carregado de `googletagmanager.com`, sem lib própria) embutido
  direto no `<head>` de `farmaura/marketplace.html`, o mais cedo possível — segue a recomendação
  oficial do Google de posicionamento.
- Measurement ID `G-3BNX65SWXD`, hardcoded no HTML (não é segredo — IDs de measurement do GA4 são
  públicos por natureza, aparecem no HTML de qualquer site que os usa).
- **Só no marketplace** (`farmaura/marketplace.html`) — decisão explícita do usuário ao ser
  perguntado. `internal.html` (console do farmacêutico/operações) **não** recebeu a tag, para não
  rastrear uso interno da equipe como se fosse tráfego de cliente.
- Sem consentimento/banner de cookie implementado — fora do pedido original; se o volume de tráfego
  justificar preocupação de conformidade LGPD, isso é uma pendência separada a avaliar depois.

## Dependências

- Nenhuma dependência de código do backend — é só HTML estático, servido pelo container `farmaura`
  (nginx). Nenhuma mudança em `farmaura-api/`.

## Atualizações

- 2026-08-16: nota criada — tag adicionada em `marketplace.html` e deployada em produção
  (`drogariafarmaura.com.br`) no mesmo dia, via commit direto em `main` (`2c1d843`), sem passar pela
  branch `staging/lumos-dev` (que tinha outro trabalho não relacionado e ainda não validado em
  andamento — ver [[../00_Decisoes/2026-08-15-ofertas-do-dia-modo-agendado-e-offers-reaproveitada|ADR do modo agendado de ofertas do dia]]). Rebuild/recreate só do container `farmaura` (frontend), sem
  tocar em `farmaura-api`/Postgres/Valkey.
