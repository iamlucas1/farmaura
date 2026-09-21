---
cssclasses: ia-nota
---

# 2026-09-20 — Modal "completar cadastro" enxuta, com progresso real e um único caminho

## Contexto

A modal `ProfileCompletionNudge` (marketplace, `account-profile-screen.jsx`) convida o cliente logado com cadastro incompleto a preencher gênero, estado civil, filhos e endereço — dados que segmentam promoções (ver [[2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|promoção aplicada no checkout]]). Pedido do usuário: havia texto demais e pouca atratividade para preencher. A versão antiga tinha ~58 palavras visíveis (título em pergunta, subtítulo de 19 palavras listando os 4 campos, parágrafo de consentimento de 27 palavras, botão longo "Completar cadastro e aceitar promoções") e um ícone `gift` que, no conjunto de ícones do app, desenha uma grade que lê como tabela.

## Alternativas consideradas

- **Só cortar texto na modal existente** — descartada: o problema não era só o volume, era não haver nada a *ver*. Texto menor sem um elemento visual continua um aviso.
- **Assistente de vários passos dentro da modal (preencher ali mesmo)** — descartada: mudaria o comportamento e o escopo (formulário, validação, salvar perfil), e a tela de perfil já faz isso. A modal continua sendo só a porta de entrada.
- **Guardar o "agora não" no servidor (por conta)** — adiada, ver [[../06_Pendencias/modal-completar-cadastro-adiamento-por-navegador-e-falso-positivo|pendência]]; exige coluna nova + migration e não foi pedida.
- **Manter o componente `Modal` do kit** — trocado por `ModalShell` sem padding, para ter uma faixa de topo de ponta a ponta; mantém o mesmo casco (overlay, Esc, foco/pilha de modais, botão fechar).

## Decisão

Mesmo sistema visual (Warm Apothecary), menos e melhor:

- **Faixa de topo em rosé** (`--fa-rose-soft`) com dois arcos "aura" (assinatura da marca, sem inventar decoração nova) e o ícone `percent` num tile branco — no lugar do ícone `gift` (que parecia uma tabela).
- **Título curto**, sem pergunta: "Ofertas feitas pra você". **Uma frase** que muda com o que falta: "Faltam só N dados e as ofertas passam a combinar com o seu perfil." (singular tratado: "Falta só 1 dado…").
- **Quatro pílulas em grade 2×2** — Gênero, Estado civil, Filhos, Endereço — feitas (verde-suave + check) ou pendentes (contorno rosé + ícone do campo), calculadas dos mesmos dados que já decidem se a modal aparece. Mostra o quanto *já* está pronto e o quanto falta; cada pílula tem texto para leitor de tela ("preenchido"/"falta preencher"), não depende só de cor. Entrada escalonada (uma única animação, respeita `prefers-reduced-motion`).
- **Um só caminho principal**: "Completar meu cadastro →". O consentimento continua obrigatório e explícito, em uma linha logo abaixo do botão ("Ao continuar, você aceita receber promoções personalizadas. Mude quando quiser em Minha Conta → Privacidade."), e "Agora não" virou botão de texto discreto (alvo de 44 px).
- **Comportamento preservado**: o botão principal grava o aceite de "Promoções e ofertas personalizadas" pelo mesmo `saveCustomerPrivacyPreferences` e leva ao perfil; "Agora não", fechar no X ou Esc adiam por 14 dias (`farmaura_profile_nudge_dismissed_at`); cadastro completo → não aparece.
- **Endurecimento junto**: leitura/gravação do `localStorage` agora dentro de `try/catch` — antes, com armazenamento bloqueado, o `setItem` lançava erro antes do `setOpen(false)` e a modal podia não fechar.

Resultado: ~42 palavras visíveis (28 em prosa, contra ~46), sem rolagem em 1280×820 e 390×844.

## Consequências

- **Verificado no Chrome real** (Docker local, cliente de teste): desktop e celular, com 2 de 4 campos feitos (dado real) e 0 de 4 (resposta da API alterada só no navegador), sem rolagem, sem erro no console, botão principal 50 px, "Agora não" 44 px, X clicável sobre a faixa. Comportamento: "Agora não" fecha e grava; não volta ao recarregar; volta com o adiamento vencido (simulado a 15 dias); Esc fecha.
- **Não testado**: clicar no botão principal ponta a ponta (gravaria o consentimento no banco local; o handler não foi alterado além de gravar o adiamento por `markNudgeDismissed`), e o comportamento numa conexão lenta (ver pendência).
- O detector de design do Impeccable não achou nada nas linhas escritas (os achados existentes são do CSS antigo).
- Classes novas em `marketplace.css`: `.fa-nudge*` (só tokens existentes: `--fa-rose-soft`, `--fa-rose`, `--fa-success-soft`, `--fa-primary(-ink)`, `--fa-ink*`, `--fa-r-icon/-btn/-pill`).

## Ver também

- [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]]
- [[2026-09-05-perfil-completo-e-idade-dos-filhos|Perfil completo e idade dos filhos]] — os campos que a modal pede.
