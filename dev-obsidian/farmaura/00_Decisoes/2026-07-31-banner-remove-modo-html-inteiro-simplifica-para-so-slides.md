# 2026-07-31 — Banner da home: remove o modo "HTML próprio" de página inteira, fica só "slides"

## Contexto

Com o slide `kind="html"` introduzido em [[2026-07-31-banner-import-em-lote-e-slides-mistos-imagem-html|ADR anterior]],
o antigo modo de topo `mode="html"` (um textarea único para a área inteira do banner) virou
redundante — um carrossel com um único slide `kind="html"` já renderiza exatamente igual (sem
setas/dots, ver `BannerSlider` em `home-screen.jsx`). O usuário pediu para simplificar a tela: em vez de
3 cartões grandes de modo (Sem banner / Imagens / HTML próprio) + uma barra de ações separada, deixar só
uma barra compacta com 3 botões — Importar imagens, Adicionar bloco HTML, Sem banner.

## Decisão

1. **`mode` passa a ter só dois valores**: `off | image`. Removido `html` do enum e o campo
   `PortalHomeBannerResponse.html` (nível banner) inteiro — o único texto HTML que existe agora é
   `PortalHomeBannerSlide.html`, por slide.
2. **`home-banner-screen.jsx`**: removido o seletor de 3 cartões. A tela agora é só uma barra de ações
   (Importar imagens / Adicionar bloco HTML ao carrossel / Sem banner) + a lista de slides (quando
   `mode="image"`). Clicar em "Importar imagens" ou "Adicionar bloco HTML" força `mode="image"`
   automaticamente; "Sem banner" só troca `mode` para `"off"` sem apagar os slides já configurados
   localmente (dá pra reativar sem perder o que já foi montado, só salvando de novo).
3. **Sem migration** — `PortalSetting.value_json` continua sendo o mesmo blob JSON; dados antigos com
   `mode="html"`/campo `html` de nível banner (salvos antes desta mudança) falham a validação do novo
   schema e caem no fallback já existente em `_resolve_home_banner` (`except ValidationError: return
   PortalHomeBannerResponse()`), resetando silenciosamente para "sem banner" — aceitável neste ambiente
   de desenvolvimento, sem dado de produção dependendo disso.

## Consequências

- Menos um eixo de configuração para o admin entender — "banner" agora é sempre "uma lista de slides
  (imagem ou HTML), ou nada", sem um terceiro conceito paralelo fazendo a mesma coisa.
- `.fa-banner-html` (CSS do antigo wrapper de página inteira) removido por estar morto.

## Ver também

- [[2026-07-31-banner-da-home-configuravel-com-html-sanitizado|ADR original do banner configurável]].
- [[2026-07-31-banner-import-em-lote-e-slides-mistos-imagem-html|ADR do import em lote e slides mistos]].
