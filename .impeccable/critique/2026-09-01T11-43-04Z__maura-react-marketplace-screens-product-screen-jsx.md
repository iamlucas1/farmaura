---
target: pagina de produto (PDP)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-01T11-43-04Z
slug: maura-react-marketplace-screens-product-screen-jsx
---
# Critique — Farmaura, página de produto (PDP)

Method: dual-agent (A: a08c7d02fac674b0b · B: a66248e29acf4966e)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | CEP tem loading real; sem confirmacao visivel ao adicionar ao carrinho. |
| 2 | Match System / Real World | 4 | Linguagem genuinamente brasileira/farmaceutica confirmada ao vivo. |
| 3 | User Control and Freedom | 3 | Modais de confirmacao de perda sao solidos; trocar de dosagem descarta a quantidade sem aviso. |
| 4 | Consistency and Standards | 3 | Componentes compartilhados bem reaproveitados; carrossel deixa foco de teclado alcancar cards fora da tela. |
| 5 | Error Prevention | 3 | CEP validado antes do envio; modais de confirmacao protegem contra perda financeira real. |
| 6 | Recognition Rather Than Recall | 3 | Dosagem/tamanho visivel como chips; specs so com campos reais. |
| 7 | Flexibility and Efficiency | 2 | Sem persistencia de quantidade, sem atalho de recompra; trocar variacao perde progresso. |
| 8 | Aesthetic and Minimalist Design | 2 | IA deu 3; detector achou evidencia que a revisao manual nao pegou (25x texto 10.5px, 1 par de contraste 3.5:1) — reduzindo a nota. |
| 9 | Error Recovery | 3 | Mensagem de erro do CEP e especifica e real, confirmada no DOM ao vivo. |
| 10 | Help and Documentation | 3 | Pagina da bula e ajuda contextual genuina; "Falar com farmaceutico" e saida real. |
| **Total** | | **29/40** | **Bom** |

## Veredito de especificidade do design

Avaliacao da IA: autoral na camada de cor/tipografia/copy (vermelho como confianca nao urgencia, mono so no preco, glow rose nos campos certos, aura ausente aqui corretamente). Generico na camada estrutural: todo produto sem receita usa a mesma caixa branca com marca-dagua "F" — dez remedios ficam indistinguiveis no carrossel. Unica diferenciacao real (faixa preta "VENDA SOB PRESCRICAO MEDICA") usada uma unica vez.

Varredura deterministica: scanner estatico no codigo-fonte encontrou 0 findings. So contra a pagina renderizada de verdade e que apareceram 28 anti-padroes reais: 25x texto 10.5px nos carrosseis, 1 par de contraste confirmado em 3.5:1, 1 dark-glow. A Avaliacao B descartou corretamente 4 outras leituras de contraste que eram artefato do proprio script (fundo gradiente).

## Impressao geral

Honesto onde a maioria dos e-commerces trapaceia (nunca inventa avaliacao, nunca fabrica bula, nunca esconde falta de estoque). Mas trata seu momento de maior risco (comprar remedio pelo celular) como desktop: botao de comprar a quase 1.5 tela no mobile, sem atalho fixo.

## O que esta funcionando

1. Estados vazios honestos verificados ao vivo (bula ausente, descricao ausente).
2. Modais de confirmacao com perda real calculada em R$ antes de cancelar/remover.
3. Diferenciacao visual real para controlados (faixa preta de prescricao).

## Problemas prioritarios

**[P1] Botao de comprar quase 1.5 tela abaixo no mobile, sem fallback fixo**
Por que importa: medido ao vivo em 390x844 — "Comprar agora" a 1194px do topo.
Fix: reordenar pilha mobile ou adicionar barra fixa inferior com preco+CTA.
Comando sugerido: /impeccable adapt

**[P1] Acessibilidade por teclado quebrada de tres formas verificadas**
Por que importa: (a) bula/breadcrumb sao `<a role=button>` sem href/tabIndex, fora da ordem de tabulacao; (b) foco alcanca cards de carrossel fora da tela (x negativo); (c) campo de busca sem nenhum indicador de foco visivel.
Fix: trocar por `<button>` reais; aplicar o glow rose de foco em :focus-visible.
Comando sugerido: /impeccable harden

**[P2] Cards dos carrosseis com bugs reais de legibilidade/contraste e aparecem cortados**
Por que importa: 25x texto 10.5px, 1 par de contraste em 3.5:1, ultimo card de cada carrossel cortado no meio da palavra em 1440px e 390px.
Fix: aumentar piso de fonte dos rotulos de marca; ajustar cor do badge claro para 4.5:1; garantir que o ultimo card nao corte a meio-caractere.
Comando sugerido: /impeccable audit

**[P2] Trocar de dosagem apaga a quantidade escolhida sem avisar**
Por que importa: useEffect por route.id zera qty para 1, sem aviso visual nem no console.
Fix: preservar quantidade entre variacoes, ou mostrar nota "quantidade reiniciada".
Comando sugerido: /impeccable clarify

**[P2] "0.0 estrelas / 0 avaliacoes" universal le como nota ruim, nao honestidade**
Por que importa: confirmado em 8/8 produtos ao vivo — indistinguivel de "media realmente ruim".
Fix: esconder estrelas/0.0 ate ter 1 avaliacao real; mostrar "Produto novo".
Comando sugerido: /impeccable clarify

## Red flags por persona

Casey (mobile distraida): primeira tela e so foto+badges, sem preco/botao; risco real de abandono.
Riley (stress tester): qty 5 -> troca dosagem -> qty volta pra 1 silenciosamente; estranharia o "0.0" universal.
Jordan (primeira vez): 4 sinais de desconto empilhados na Vitamina C sem reconciliar entre si.

## Observacoes menores

- Preco sem desconto aparece duplicado (preco normal + "no Pix" identico).
- Stepper de quantidade sem aria-live.
- Icone (i) da recorrencia pequeno demais para o que explica.
- Sem forma de deixar avaliacao ainda (oportunidade pos-lancamento).
- 1 dark-glow (sombra vermelha decorativa em fundo escuro) — polimento.

## Perguntas provocativas

1. E se preco+comprar fosse a primeira coisa no mobile, galeria depois?
2. E se a nota por estrelas so renderizasse apos a primeira avaliacao real?
3. E se a faixa de prescricao virasse silhuetas por categoria, mesmo sem foto real ainda?
