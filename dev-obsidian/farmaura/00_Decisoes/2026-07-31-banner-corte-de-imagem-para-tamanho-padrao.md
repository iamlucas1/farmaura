# 2026-07-31 — Banner da home: corte/ajuste de imagem para manter um tamanho padrão entre slides

## Contexto

Cada slide de imagem do banner é enviado avulso (upload individual ou em lote), com dimensões
originais arbitrárias. O usuário pediu uma forma de manter um "padrão de tamanho" entre eles — poder
cortar/ajustar cada arte para um tamanho fixo escolhido por ele, com preview, antes de ir para o
marketplace.

## Alternativas consideradas

- **Redimensionar automaticamente sem intervenção do admin** (ex.: sempre usar `object-fit: cover` só
  no CSS, sem gerar um arquivo já cortado). Já era o comportamento existente — resolve a exibição, mas
  não o pedido: o admin queria controlar o enquadramento (o que fica visível vs. cortado), não só
  garantir que a proporção não quebra o layout.
- **Biblioteca de crop de terceiros** (`react-easy-crop`, `react-image-crop`, etc.). Rejeitada — o
  projeto não tinha nenhuma dependência de imagem até agora, e a interação necessária (arrastar para
  posicionar + zoom, proporção fixa, exportar num canvas) é pequena o suficiente para não justificar
  puxar uma lib externa só para isso. Implementado à mão em `image-crop-modal.jsx` com Pointer Events +
  `<canvas>`.
- **Tamanho de saída fixo, não configurável.** Rejeitada — o pedido foi explicitamente "um tamanho que
  eu desejar". `home_banner` ganhou `target_width`/`target_height` (px, default 1600×480), editável na
  própria tela; todo corte novo usa esse valor como proporção e resolução de exportação do canvas.
- **Recortar automaticamente slides já salvos ao mudar o tamanho padrão.** Rejeitada — mudar
  `target_width`/`target_height` não re-processa imagens já cortadas (ficariam re-cortadas sem o admin
  ver o resultado antes). Em vez disso, cada slide tem um botão "Ajustar" que reabre o cropper com o
  tamanho atual, para o admin decidir conscientemente.

## Decisão

1. **`PortalHomeBannerResponse.target_width`/`target_height`** (novos campos, `320–3840`/`120–1600` px,
   default `1600×480`) — settings persistidos junto do resto do `home_banner`, sem migration (mesmo
   blob JSON de sempre).
2. **`image-crop-modal.jsx`** (novo componente): stage de preview em escala reduzida (largura fixa
   560px, altura derivada da proporção alvo), arrastar com Pointer Events para posicionar, slider de
   zoom (1×–3× sobre a escala "cover" mínima), clamps para a imagem nunca deixar vão vazio no quadro.
   "Aplicar corte" desenha o recorte num `<canvas>` na resolução real (`target_width`×`target_height`)
   e exporta como `image/jpeg` (qualidade 0.87) — cabe com folga no limite de 600.000 caracteres do
   campo `image`.
3. **Todo caminho de entrada de imagem passa pelo cropper**: upload individual de um slide, importação
   em lote (fila sequencial — "Imagem N de M", uma de cada vez), e um botão "Ajustar" em qualquer slide
   que já tenha imagem (inclusive uma colada por URL) para reabrir o corte.
4. **Falha de CORS tratada explicitamente**: recortar uma imagem de URL externa sem cabeçalho CORS
   compatível "suja" o canvas e `toDataURL` lança — capturado com uma mensagem pedindo para baixar e
   reenviar o arquivo, em vez de estourar sem explicação.

## Consequências

- Sem migration, sem dependência nova de imagem.
- Preview dos slides na tela interna usa `aspectRatio` dinâmico (`target_width/target_height`), não
  mais um `16:9` fixo — reflete o padrão real escolhido pelo tenant.
- Mudar o tamanho padrão não afeta slides já salvos até o admin clicar "Ajustar" neles — comportamento
  deliberado (ver alternativas), documentado na própria tela.

## Atualização — seletor visual de tamanho (mesmo dia)

O controle de `target_width`/`target_height` virou dois `<input type="number">` cru inicialmente — o
usuário pediu algo mais visual: "abrir uma modal com uma imagem de exemplo em vários tamanhos" em vez de
digitar pixels às cegas. Adicionado `banner-size-modal.jsx`: uma grade de presets (Panorâmico, Padrão,
Clássico, Alto, Quadrado, Retrato + Personalizado), cada card mostrando a **mesma arte de exemplo**
(um SVG inline simulando um banner real — badge, título, subtítulo, botão, ícone) cortada na proporção
daquele preset, para comparação lado a lado antes de escolher. O botão "Escolher tamanho visualmente"
na tela principal substitui os inputs numéricos diretos; um card "Personalizado" dentro do próprio modal
ainda permite digitar largura/altura livres, com o mesmo preview ao vivo.

## Atualização 2 — autosave, "sem banner" não apaga slides, reencaixe automático (mesmo dia)

Três ajustes de UX pedidos em sequência pelo usuário:

1. **Autosave em toda importação de imagem**: `saveHomeBanner` ganhou um parâmetro `patch` opcional —
   permite salvar um valor que ainda não está em `homeBanner` (estado React) sem esperar o próximo
   render, evitando ler o closure desatualizado. Cada `handleCropApply` (slide único, um passo da
   fila de import em lote, ou "Recortar novamente") chama `saveHomeBanner(patch, {silent:true})` na
   hora — nenhuma imagem fica só em estado local esperando o botão "Salvar banner".
2. **`mode="off"` deixou de apagar `slides`** (mudança de contrato do backend, ver `update_home_banner`
   em `portal_service.py`) — é só um toggle de exibição agora. A tela mostra os slides existentes em
   cinza (`opacity`/`grayscale`/`pointer-events:none`) com um botão "Reativar com estes slides"
   (`mode="image"` de novo, mesmo array).
3. **Reencaixe automático ao trocar o tamanho padrão**: `fitImageToSize(src, w, h)` (mesma lógica de
   "cover, centralizado" do primeiro frame do `ImageCropModal`, mas headless/sem modal) roda pra cada
   slide de imagem já salvo assim que um novo preset/tamanho é aplicado no `BannerSizeModal` — sem
   isso, mudar o tamanho padrão só afetaria slides *novos*, deixando o carrossel com proporções
   misturadas. Falhas por imagem de URL externa sem CORS são capturadas por slide (`Promise.all` com
   catch individual) e reportadas count-a-count, sem travar o reencaixe dos demais. O botão por slide
   foi renomeado de "Ajustar" para "Recortar novamente", já que agora existe um reencaixe automático
   *e* um manual — o nome deixa claro que é a ação manual de reposicionar.

## Atualização 3 — preserva a imagem original para recorte repetido (mesmo dia)

Bug de qualidade percebido pelo usuário: "Recortar novamente" reabria o cropper usando `slide.image`
(o resultado já cortado, geralmente já na resolução final e às vezes já com zoom aplicado) — recortar
esse resultado de novo compunha perda de qualidade a cada rodada, e não permitia "dar zoom pra fora"
além do que sobrou do primeiro corte.

**Decisão**: `PortalHomeBannerSlide` ganhou `original_image` — a imagem crua, tal como enviada, mantida
ao lado da `image` (o recorte atual, o que o marketplace efetivamente exibe). `original_image` é
**console-only**: `PortalService._resolve_home_banner` ganhou `include_original: bool`, `False` por
padrão — `get_marketplace_public_bootstrap`/`get_marketplace_bootstrap` (ambos public-facing) nunca a
expõem, só `get_internal_bootstrap` e a resposta de `update_home_banner`. Sem isso, cada slide de imagem
dobraria de tamanho no bootstrap público (até ~600KB extra × 8 slides) sem nenhum uso pro visitante.

Frontend: toda vez que uma imagem nova é enviada (`onPickSlideImage`/import em lote), `original_image`
é gravado junto do recorte. "Recortar novamente" (`openCropForSlide`) sempre abre a partir de
`slide.originalImage || slide.image` (fallback pra slides antigos, criados antes deste campo existir).
O reencaixe automático ao trocar o tamanho padrão (Atualização 2) também passou a usar a original como
fonte, não o recorte anterior — evita a mesma degradação em cascata.

## Ver também

- [[2026-07-31-banner-import-em-lote-e-slides-mistos-imagem-html|ADR do import em lote]].
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]].
