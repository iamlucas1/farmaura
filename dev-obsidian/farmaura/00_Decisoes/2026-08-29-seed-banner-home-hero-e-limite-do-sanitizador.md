---
cssclasses: ia-nota
---

# 2026-08-29 — Banner da home passa a nascer no seed determinístico; limite real do sanitizador documentado

## Contexto

A home real (`HomeScreen`) só renderiza o hero-banner (`HomeBanner`/`BannerSlider`) quando o
`PortalSetting` `home_banner` tem `mode="image"` com pelo menos um slide — por padrão (tenant
novo, ou banco recém-semeado) fica `mode="off"`, e a home simplesmente pula direto para os
Diferenciais, sem hero nenhum. Até aqui, a única forma de preencher isso era rodar
`scripts/populate_demo_content.py` (HTTP, contra a API já no ar — ver
[[popular-conteudo-demo|popular-conteudo-demo]]) manualmente depois do seed — um passo extra,
fácil de esquecer, e que só existia porque banner é "conteúdo de merchandising", não schema.

Pedido do usuário: trazer o hero pro seed de base (`scripts/seed.py`, o que já roda sozinho em
todo `docker compose up -v` com banco vazio) e verificar se o resultado bate com o hero do demo
de referência (`.hero` em `build_demo3.py`/`demo.html` — fundo em gradiente vermelho, três arcos
decorativos posicionados em absoluto, kicker + h1 + parágrafo + dois botões pill).

## Investigação: por que não dá pra bater 100% com o demo

O único jeito de o hero aparecer sem imagem de verdade é um slide `kind="html"` — HTML
livre, mas passado por `PortalService._sanitize_home_banner_html` (nh3) tanto na escrita quanto
(por herança) em qualquer leitura futura. O allowlist de propriedades CSS
(`_HOME_BANNER_ALLOWED_STYLE_PROPERTIES`) é deliberadamente restrito, por dois motivos que já
estavam documentados no código antes desta mudança:

- **sem `position`** — um banner nunca pode se posicionar sobre o resto do chrome da página;
- **sem qualquer propriedade `url()`-capable** (`background-image` incluída) — nh3 só filtra o
  *nome* da propriedade CSS, nunca inspeciona o valor, então liberar `background-image` deixaria
  `url(javascript:...)`/pixel de rastreio passar sem filtro nenhum.

Isso significa que o gradiente 135° do `.hero` do demo e os três `.hero-arc` (círculos
`position:absolute`) **não são reproduzíveis** pelo próprio recurso de banner-HTML como ele
existe hoje — não é um bug deste seed, é o preço de mantar esse campo seguro para um admin real
digitar HTML livre. Confirmado visualmente (screenshots desktop 1440px e mobile 390px,
`localhost:3000` pós-build): cor de fundo plana no lugar do gradiente, sem os arcos — todo o
resto (kicker, título, parágrafo, dois botões pill brancos/translúcidos, `border-radius`
consistente com `--fa-r-card`, `clamp()` de padding/fonte responsivo) bate com o demo.

## Decisão

Adicionado `build_home_banner_settings()` em `scripts/seed.py` (mesmo padrão de
`build_deal_of_the_day_settings`, que já fazia isso pra "ofertas do dia"): grava direto um
`PortalSetting` (`setting_key="home_banner"`, `portal_name="internal"`) com um único slide
`kind="html"`, `mode="image"` já ativo. Copy idêntico ao `.hero` do demo ("A farmácia do seu
bairro" / "Tudo o que a maior farmácia da região teria, perto de você" / ...); cor de fundo
plana `#8C0E14` (ponto médio entre `--fa-primary` `#A11017` e `--fa-primary-ink` `#7C0C12`, os
mesmos tokens que o demo usa nas duas pontas do gradiente) como a aproximação mais próxima
possível dentro do allowlist real. Registrado no `upsert_many` junto de `cnae_settings`.

Como este valor nasce direto no banco (não passa pelo endpoint `PUT
/portal/internal/home-banner`), o HTML foi escrito manualmente já dentro do allowlist — não
sanitizado em runtime, mas equivalente ao que sairia sanitizado se um admin colasse o mesmo HTML
no console. Não alterado o allowlist do sanitizador para "resolver" a diferença visual — seria
trocar uma diferença cosmética por uma superfície de XSS real.

`scripts/populate_demo_content.py` continua existindo e intocado: sua própria variante de banner
(cores/copy diferentes, "Até 30% OFF na semana de lançamento") continua sendo a opção pra ambiente
sem acesso direto a banco (`lumos-dev`/preview) e sobrescreve este banner de seed quando rodado —
comportamento aceito, não um conflito a resolver, já que os dois nunca precisam coexistir no
mesmo ambiente por muito tempo.

## Consequências

- `docker compose down -v && docker compose up --build` (reset local) agora entrega a home já
  com hero, sem precisar do passo manual de `populate_demo_content.py` — só "Marcas em destaque"
  continua exigindo esse script (ver atualização em [[resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]]).
- Se algum dia o allowlist do sanitizador mudar (ex: liberar `background-image` com validação real
  de URL), revisar `_HOME_BANNER_HTML` em `seed.py` pra aproveitar o gradiente/arcos verdadeiros.
- Nenhuma migration necessária (mesma tabela `portal_settings` já usada por `deal_of_the_day`/
  `cnae_settings`).

## Ver também

- [[popular-conteudo-demo|popular-conteudo-demo]] — script HTTP alternativo, ainda necessário para marcas em destaque.
- [[resetar-e-re-semear-dados-locais|resetar-e-re-semear-dados-locais]] — POP de reset local, atualizado por esta mudança.