---
cssclasses: ia-nota
---

# 2026-09-14 — Tela de login/criar conta/recuperação de senha redesenhada: halo "Auréola Dupla" full-bleed

## Contexto

Usuário pediu, via skill `impeccable`, uma reformulação da tela única que cobre login, criar
conta, esqueci a senha (primeiro acesso) e troca de senha — `LoginScreen` em
`farmaura/react/marketplace/screens/account-screen.jsx` — para algo "mais intuitivo, mais clean,
mais direto", pedindo explicitamente modelos visuais antes de qualquer alteração de código.

O estado anterior era um split-screen (`fa-card fa-login-grid`, grid 2 colunas): painel esquerdo
sólido `var(--fa-primary)` com `AuraLayer` decorativo + headline/3 bullets de marketing, painel
direito com o formulário.

## Alternativas consideradas

15 modelos no total, em 3 rodadas (gerados como Artifact interativo, com o mecanismo de sorteio do
`impeccable` — `concept-seed.mjs --scope surface --mode operate` — usado para evitar convergir
sempre nas estruturas mais óbvias):

**Rodada 1** (todos rejeitados — "não gostei de nenhum"): Cartão Direto (abas segmentadas num
cartão centralizado), Acesso por E-mail (fluxo progressivo, e-mail primeiro), Vitrine & Acesso
(evolução do split-screen antigo), **Auréola** (halo atmosférico full-bleed + cartão flutuante em
vidro), Trilho Lateral (navegação lateral vermelha, sorteada como líder).

**Rodada 2** (5 estruturas de natureza deliberadamente diferente da rodada 1, todas também
rejeitadas): Trilha de Progresso (stepper horizontal, linguagem de checkout), Escolha Bifurcada
(fork "já sou cliente" vs "quero me cadastrar"), Painel sobre o Catálogo (drawer sobre a loja
desfocada), Conversa com a Farmácia (formulário em chat), Faixa Fixa no Topo (flyout no header).

**Rodada 3** (usuário pediu para aprofundar especificamente a Auréola da rodada 1): Clássica
(referência), Arco Único (banda única tipo "amanhecer"), Escura (paleta invertida quase-preta —
sinalizada como fora da paleta clara documentada em `DESIGN.md`, não adotada), Micro (halo
contido, só nos cantos do cartão), **Dupla** (halos cruzados de dois tons + cartão deslocado +
nome da marca como marca d'água no espaço negativo) — escolhida.

## Decisão

Implementada a direção **Dupla**, substituindo o `fa-login-grid` por completo. Painel de marca
esquerdo (headline + bullets + `AuraLayer`) removido; import de `AuraLayer` e de
`MARKETPLACE_LOGO_FULL_WHITE_URL` retirados de `account-screen.jsx` (não usados em mais nenhum
lugar deste arquivo).

Novo padrão em `marketplace.css` (`.fa-login-aureola*`), sobre o mesmo card único que já continha
toda a lógica de `mode`/`stage` (login/register/first-access, 2FA, `password_change`) —
intocada, só reancorada:

- `.fa-login-aureola-bg` — halo radial de dois tons (`var(--fa-rose)` no canto superior-esquerdo,
  `var(--fa-primary)` no inferior-direito), **full-bleed**: rompe o `max-width` do `.fa-wrap` via
  `left:50%; width:100vw; transform:translateX(-50%)` (truque padrão, depende do `.fa-wrap` ficar
  centralizado via `margin:0 auto` — se essa regra-base mudar, a centralização quebra em
  silêncio). Intensidade controlada pelo dial já existente `--fa-aura`.
- `.fa-login-aureola-mark` — logo completa (`MARKETPLACE_LOGO_FULL_URL`, com o nome "Farmaura"
  escrito, não só o isotipo) centralizada atrás do cartão, como marca d'água.
- `.fa-login-aureola-card` — cartão sempre centralizado (não mais deslocado), com leve
  transparência (`rgba(255,255,255,.9)` + `backdrop-filter: blur(18px)`) para a marca d'água
  aparecer suavemente por trás do formulário.

Três rodadas de ajuste depois da escolha inicial, a partir de screenshots enviados pelo usuário:

1. Marca d'água trocada de isotipo para logo completa; cartão centralizado (estava deslocado à
   direita); fundo tornado full-bleed (estava confinado a uma caixa arredondada perto do cartão).
2. Marca d'água aumentada e mais opaca (ainda ficava praticamente tampada atrás do cartão opaco);
   cartão ganhou a transparência/blur para deixá-la visível através do formulário.
3. Raios do halo aumentados (de 50%/60% para 75%/90% do fundo) para eliminar um vazio visível
   entre as duas manchas de cor em telas largas; marca d'água aumentada de novo (até 980px) e mais
   opaca; e a causa real de um espaço em branco persistente abaixo do cartão foi identificada: a
   regra global `.fa-footer { margin-top: 64px }` (pensada para telas que terminam num `.fa-wrap`
   comum) não é zerada para este caso — mesma classe de problema que `.fa-band` já tinha resolvido
   para outras telas (`main:has(.fa-band:last-child) + .fa-footer { margin-top: 0 }`). Adicionada
   regra equivalente: `main:has(.fa-login-aureola:last-child) + .fa-footer { margin-top: 0 }`.

## Consequências

- Painel de marca esquerdo (headline "Cuidado que acompanha você" + 3 bullets + `AuraLayer`) não
  existe mais em lugar nenhum do fluxo de login — conteúdo perdido deliberadamente, não uma
  omissão (a direção escolhida pelo usuário não tem espaço de marketing, só o halo + marca d'água).
- `.fa-login-grid` (CSS) removido — só era usado por esta tela.
- 2FA, primeiro acesso (senha temporária por e-mail), `password_change`, pills de troca de modo e
  `UnlockAccountScreen` (landing de desbloqueio de conta por e-mail) — lógica 100% intocada, só
  reancorada dentro do novo wrapper.
- Verificação visual real em cada rodada (não só `vite build`): `docker compose build farmaura` +
  `docker compose up -d farmaura` (porta 3000) + screenshots via `google-chrome --headless=new
  --screenshot` (desktop, ultrawide e mobile), lidos de volta antes de reportar concluído —
  `chromium-cli`/Playwright continuam indisponíveis nesta sessão (mesma limitação de várias ADRs
  de design anteriores), mas o fallback com Chrome headless direto permitiu confirmação visual
  real em vez de só build limpo.
- Nenhuma mudança de backend/dado — troca puramente de apresentação.

## Ver também

- [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]] — tokens `--fa-primary`/`--fa-rose`/
  `--fa-aura` reaproveitados sem alteração; este ADR não muda o sistema de design, só uma
  composição de tela específica sobre ele.
- [[2026-09-04-shell-de-conta-unificado-conforme-demo|Shell de conta unificado]] — último redesenho
  grande da área de conta antes deste.