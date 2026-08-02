# 2026-07-31 — Banner da home: import de imagens em lote e slides mistos (imagem + HTML) no mesmo carrossel

## Contexto

Seguindo o ADR [[2026-07-31-banner-da-home-configuravel-com-html-sanitizado|banner da home configurável]],
o usuário pediu dois ajustes na tela `Banner da vitrine`: (1) poder importar várias artes de uma vez em
vez de uma a uma, reordenando depois; (2) poder "juntar imagens com HTML" no mesmo banner.

## Alternativas consideradas

- **Carrossel com autoplay dentro do modo "HTML próprio".** Perguntado ao usuário e descartado — esse
  modo não roda JavaScript (sanitizado de propósito contra XSS, ver ADR anterior), então um carrossel de
  verdade (troca automática) não é possível ali. O usuário escolheu usar o modo "Imagens", que já tem
  carrossel real.
- **"Juntar imagens com HTML" como dois blocos empilhados na página (um embaixo do outro).** Mais simples
  de implementar, mas não é um carrossel — o pedido original já vinha no contexto de "faça como um
  carrossel", então a interpretação natural é misturar os dois *dentro* do carrossel, não ao lado dele.
- **Um `banner.html` por slide vs. reaproveitar o `PortalHomeBannerSlide` existente.** Adotada a segunda:
  cada slide ganhou `kind: "image" | "html"` e um campo `html` próprio (`PortalHomeBannerSlide.html`),
  em vez de criar um tipo de slide totalmente separado — mantém um único array `slides` reordenável com
  as mesmas setas ▲▼ já existentes, então "importar em lote" e "misturar com HTML" usam exatamente a
  mesma estrutura de dados.

## Decisão

1. **`PortalHomeBannerSlide.kind`** (`image` | `html`) + campo `html` por slide. `update_home_banner`
   sanitiza o `html` de cada slide com `kind="html"` (mesma `_sanitize_home_banner_html`/allowlist de CSS
   do modo HTML inteiro) e zera `image`/`html` cruzado conforme o `kind`, para nunca persistir os dois ao
   mesmo tempo.
2. **`home-banner-screen.jsx`**: novo input `<input type="file" multiple>` ("Importar imagens") que
   converte todos os arquivos escolhidos em slides de uma vez (via `Promise.all` de
   `FileReader.readAsDataURL`), respeitando o limite de 8 slides. Cada slide ganhou um toggle
   Imagem/HTML visível no card; ao trocar para HTML aparece um textarea igual ao do modo inteiro
   (links não se aplicam a slides HTML — ficam embutidos no próprio HTML do slide, mesma lógica do modo
   inteiro). Reordenar continua sendo as setas ▲▼ já existentes, agora servindo tanto imagens quanto
   blocos HTML no mesmo array.
3. **`home-screen.jsx` / `BannerSlider`**: cada item do carrossel decide sua renderização por
   `slide.kind` — `image` renderiza `<img>` (como antes), `html` renderiza o HTML sanitizado do slide via
   `dangerouslySetInnerHTML`. CSS renomeado de `.fa-slide-img` para `.fa-slide-item` (deixou de ser
   exclusivo de imagem) + nova `.fa-slide-item-html`.

## Consequências

- Sem migration — `PortalSetting.value_json` continua sendo o mesmo blob JSON livre.
- **Bug real encontrado durante o teste, não corrigido nesta sessão**: a tela `Banner da vitrine` (e,
  pelo mesmo padrão, `Precificador`/PDV discount/CNAE/Frete) hidrata seu estado local a partir de
  `GET /portal/internal/bootstrap` num `useEffect` com dependências `[user, storeIdOverride]`. Se esse
  efeito refizer o fetch e resolver *depois* que o admin já começou a editar (ex.: `user` ganha uma nova
  referência de objeto pouco depois do login, mesmo sem mudar de valor), a resposta do bootstrap
  sobrescreve o estado local incondicionalmente — qualquer edição feita nesse intervalo é perdida
  silenciosamente, sem aviso. Confirmado via teste automatizado (clique imediatamente após o shell
  montar perdia a seleção de modo; esperar ~2,5s antes de interagir não reproduz o problema). Registrado
  como pendência — ver [[../06_Pendencias/hidratacao-de-settings-pode-sobrescrever-edicao-em-andamento|pendência]].

## Ver também

- [[2026-07-31-banner-da-home-configuravel-com-html-sanitizado|ADR anterior do banner configurável]].
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]].
