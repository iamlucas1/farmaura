# 2026-07-31 — Seção "Entrega/Cashback/Retirada/Receita" da home vira sem-card (Direção D); Direção E documentada para depois

## Contexto

A seção de 4 destaques logo abaixo do banner da home (`Differentials` em `home-screen.jsx`) era um grid
de cards brancos com borda, sombra e elevação no hover (`.fa-diff`) — o usuário gostou do conteúdo
interno (ícone, título, texto, link com seta) mas não do formato "card", pedindo uma referência visual
inspirada em Apple/Samsung: limpo, funcional, sem caixa.

## Processo

1. Explorado fora do código primeiro: um artifact HTML standalone com 6 direções (A–F), cada uma
   reaproveitando o mesmo conteúdo/cores por item (verde entrega, âmbar cashback, azul retirada, vinho
   receita — informativo, não decorativo) só variando a moldura. Ver o artifact publicado nesta sessão
   (link não persiste aqui — a decisão e o código-fonte de cada direção é o que importa, registrado
   abaixo).
2. Por pedido do usuário, as duas finalistas (**D** — traço de cor à esquerda, sem card nenhum; **E** —
   zona com uma lâmina de cor de fundo bem sutil, sem borda/sombra) foram implementadas **de verdade**
   dentro do marketplace real (`home-screen.jsx` + `marketplace.css`, usando os tokens `--fa-*` reais e
   o componente `Icon` real) e exibidas uma embaixo da outra na home ao vivo, pra decisão com fonte,
   espaçamento e cor de produção — não a aproximação do artifact isolado.
3. **Decisão: Direção D.** Reflete `.fa-diff-grid`/`.fa-diff` atuais em `marketplace.css` e `Differentials`
   em `home-screen.jsx`.

## Direção D (escolhida — como está implementada hoje)

Sem card: cada item é um traço de cor de 3px à esquerda (`::before`), ícone pequeno solto (sem badge/
círculo), ícone grande do mesmo glifo como marca d'água no canto inferior direito (opacidade .08,
sobe pra .12 no hover), texto direto no fundo da página. Grid de 4 colunas fixas, 36px de gap.

Classes: `.fa-diff-grid`, `.fa-diff`, `.fa-diff-glyph`, `.fa-diff-icon`, `.fa-diff-t`, `.fa-diff-d`,
`.fa-diff-link`, `.fa-diff-arrow` — ver `marketplace.css` (bloco "Differentials (home benefits — colored
rule to the left, no card)") e `home-screen.jsx::Differentials` para o código-fonte vivo e atual.

## Direção E (não escolhida — receita completa para reaplicar no futuro)

Zona tingida: cada item recebe um fundo `color-mix(in srgb, var(--acc) 8%, var(--fa-bg))` (sem borda,
sem sombra — só uma lâmina de cor identifica a zona), as 4 colunas encostam uma na outra formando uma
faixa contínua com cantos arredondados só nas pontas externas (`overflow:hidden` no grid pai), ícone
grande como marca d'água mais visível que na D (opacidade .16, sobe pra .2 no hover, já que tem mais
contraste contra o fundo tingido).

**CSS** (cole de volta em `marketplace.css`, próximo ao bloco `.fa-diff*` atual):

```css
.fa-diffE-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-radius: var(--fa-r-card); overflow: hidden; }
.fa-diffE {
  --acc: var(--fa-primary);
  position: relative; overflow: hidden;
  display: flex; flex-direction: column;
  text-align: left; cursor: pointer;
  border: none; padding: 26px 22px;
  background: color-mix(in srgb, var(--acc) 8%, var(--fa-bg));
  transition: background .2s ease;
}
.fa-diffE:hover { background: color-mix(in srgb, var(--acc) 13%, var(--fa-bg)); }
.fa-diffE-glyph {
  position: absolute; right: -8px; bottom: -14px;
  color: var(--acc); opacity: .16; pointer-events: none;
  transition: transform .25s ease, opacity .2s ease;
}
.fa-diffE:hover .fa-diffE-glyph { transform: scale(1.06); opacity: .2; }
.fa-diffE-icon { position: relative; color: var(--acc); margin-bottom: 16px; }
.fa-diffE-t { position: relative; font-weight: 800; font-size: 15.5px; line-height: 1.25; color: var(--fa-ink); letter-spacing: -.01em; margin: 0 0 7px; }
.fa-diffE-d { position: relative; margin: 0 0 16px; font-size: 13px; line-height: 1.45; color: var(--fa-ink-2); text-wrap: pretty; }
.fa-diffE-link {
  position: relative; margin-top: auto;
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 700; font-size: 12.5px; color: var(--acc);
  letter-spacing: .01em; width: fit-content;
}
.fa-diffE-arrow { display: inline-flex; transition: transform .2s ease; }
.fa-diffE:hover .fa-diffE-arrow { transform: translateX(4px); }
@media (max-width: 860px) { .fa-diffE-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .fa-diffE-grid { grid-template-columns: 1fr; } }
```

**JSX** (substitui o corpo de `Differentials` em `home-screen.jsx`, mesmo array `items` de hoje):

```jsx
return (
  <div className="fa-diffE-grid">
    {items.map((item) => (
      <button key={item.t} className="fa-diffE" style={{ '--acc': item.acc }} onClick={item.action}>
        <Icon name={item.icon} size={118} stroke={1} className="fa-diffE-glyph" />
        <Icon name={item.icon} size={28} stroke={1.6} className="fa-diffE-icon" />
        <div className="fa-diffE-t">{item.t}</div>
        <p className="fa-diffE-d">{item.d}</p>
        <span className="fa-diffE-link">
          {item.cta}
          <span className="fa-diffE-arrow" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </span>
      </button>
    ))}
  </div>
);
```

Pra trocar de volta: renomear as classes `fa-diffE*` pra `fa-diff*` (ou manter os dois blocos de CSS
coexistindo, um por vez usado no JSX) e trocar o `className`/JSX de `Differentials` de acordo — o mesmo
`items` array (ícone/título/texto/cta/acc/action por item) serve pras duas direções sem alteração.

## Consequências

- `.fa-diff-badge` (círculo colorido atrás do ícone pequeno, do card antigo) foi removido — não existe
  em D nem em E, nenhuma das duas usa badge.
- Nenhuma migration/mudança de backend — troca é puramente visual em `marketplace.css`/`home-screen.jsx`.
- As 6 direções do artifact original (A–F) continuam só como histórico de exploração — C e F nunca
  chegaram a ser implementadas no site real; se quiser retomá-las, a receita de cores/ícones por item
  é a mesma, só a moldura muda (mesmo princípio das duas acima).
