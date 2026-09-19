---
cssclasses: ia-nota
---

# `npm run dev` (vite) serve página em branco — conflito entre `<base href="/">` e `root` do repo

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-08-27

## Descrição

Acessar o marketplace (ou internal) pelo servidor de dev do Vite (`http://localhost:5173/`, `npm run dev:vite`) resulta em página em branco (`#root` vazio, sem erro visível de imediato) — tanto em navegador normal quanto headless. A causa: `farmaura/vite.config.js` roda com `root: repositoryRoot` (raiz do repo `dev/`, não `farmaura/`), pra manter as URLs `/farmaura/...` que o nginx espera em produção. Mas `marketplace.html`/`internal.html` têm `<base href="/">` fixo no HTML-fonte. Em dev, isso faz o navegador resolver `<script src="./src/marketplace-entry.js">` para `/src/marketplace-entry.js` (404 — o arquivo real está em `/farmaura/src/marketplace-entry.js`), então a SPA nunca monta. Confirmado via `curl`: `http://localhost:5173/farmaura/src/marketplace-entry.js` → 200; `http://localhost:5173/src/marketplace-entry.js` → 404.

Em produção isso não afeta nada: o `vite build` reescreve as tags de script pra caminhos absolutos com hash (`/assets/marketplace-XXXX.js`), então o `<base href="/">` + caminho relativo do dev nunca entra em jogo. O container docker `farmaura` (build de produção via nginx) também não é afetado, pelo mesmo motivo.

## Contexto

Descoberto em 2026-08-27 durante uma sessão de correção de fidelidade visual, depois de uma sessão inteira concluindo erroneamente que "Chrome headless não renderiza nada neste ambiente" — na verdade era este bug, não uma limitação de ambiente. Contornado usando o container docker (porta 3000) pra verificação visual em vez do `vite dev`; ver [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|roadmap de composição visual]], seção "Fase 1, terceira rodada". Não corrigido ainda porque o contorno (docker) já resolve a necessidade imediata de screenshot, e uma correção definitiva (por exemplo, um `<base>` dinâmico calculado a partir do path real de request, ou mover `root` do Vite pra `farmaura/` com um proxy separado pros caminhos `/farmaura/...`) precisa de mais investigação pra não quebrar o comportamento de produção nem o rewrite de deep-link (`portalDeepLinkFallback` no `vite.config.js`).