# Leaflet carregado via CDN (unpkg) sem Subresource Integrity — combinado com token em `localStorage` e CSP ausente

**Tipo:** Vulnerabilidade (supply-chain de dependência client-side)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** `farmaura`
**Categoria:** Supply chain / integridade de recurso externo
**Data de identificação:** 2026-08-19

## Descrição

`farmaura/react/shared/leaflet.js` carrega CSS e JS do Leaflet via `unpkg.com` (`https://unpkg.com/leaflet@1.9.4/...`) criando `<link>`/`<script>` dinamicamente via `document.createElement`, sem `.integrity`/`.crossOrigin` em nenhum dos dois. Confirmado também que nenhum recurso externo nos HTMLs reais (`marketplace.html`, `internal.html` — Google Fonts, Google Tag Manager) usa `integrity=`.

## Evidência

```js
const script = document.createElement("script");
script.id = LEAFLET_SCRIPT_ID;
script.src = LEAFLET_SCRIPT_SRC; // https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
script.async = true;
// sem script.integrity / script.crossOrigin
```

## Cenário de risco

Se o CDN `unpkg.com` for comprometido (supply-chain attack) ou houver MITM sem certificado pinning, o JS malicioso injetado executa com plenos privilégios de origem na página — incluindo leitura de `localStorage`/`sessionStorage`, onde residem os tokens de acesso (auth é Bearer-token-only, guardado em storage do browser). O vetor alcança tanto clientes no checkout (`checkout-screen.jsx`) quanto papéis internos privilegiados (ADMIN/MANAGER/PHARMACIST) na tela de Entregas (`deliveries-screen.jsx`) — ou seja, chega a sessões de alto privilégio. Sem CSP (ver [[csp-ausente-nas-paginas-html-de-producao]]), não há mitigação de defesa em profundidade caso esse vetor se materialize.

## Impacto

Comprometimento potencial de sessão (roubo de token via JS malicioso injetado pelo CDN) em telas que carregam o mapa — checkout de cliente e tela interna de entregas.

## Pré-condições

Comprometimento do CDN `unpkg.com` ou posição de rede para MITM sem pinning — nenhum dos dois confirmado como tendo ocorrido, é um risco estrutural, não um incidente confirmado.

## Escopo afetado

`farmaura/react/shared/leaflet.js`.

## Causa raiz

Dependência de CDN em runtime (escolha consciente e já documentada — "sem API key", consistente com o geocoding via Nominatim) nunca recebeu o hardening de SRI que mitigaria o risco de supply-chain dessa escolha.

## Correção sugerida para análise futura

Adicionar `integrity`/`crossorigin="anonymous"` ao script e ao link do Leaflet (hash disponível publicamente para a versão pinada `1.9.4`), ou hospedar o pacote localmente via build (`npm install leaflet` + bundle Vite), eliminando a dependência de CDN em runtime.

## Dependências da correção

Nenhuma migration. Se optar por bundlar localmente, aumenta o tamanho do bundle do frontend — avaliar contra a pendência já registrada de ausência de code-splitting (ver [[../06_Pendencias/sem-code-splitting-frontend|sem-code-splitting-frontend]]).

## Riscos de regressão

Baixo — SRI com hash incorreto quebraria o carregamento do mapa (fail-safe, não fail-open) — testar o hash antes de aplicar.

## Como validar futuramente que a correção funcionou

Inspecionar o HTML gerado e confirmar atributo `integrity` presente e válido no script/link do Leaflet; confirmar que o mapa continua carregando normalmente nas telas de checkout e entregas.

## Referências

- [[csp-ausente-nas-paginas-html-de-producao]] — mitigação de defesa em profundidade que também falta.
- `dev-obsidian/farmaura/05_Integracoes_Infra/Mapas_Frontend.md` — contrato da integração.

## Atualizações

- 2026-08-19: achado registrado.
