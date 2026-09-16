# Carrinho mesclado no login não é persistido de volta no servidor

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-08-27

## Descrição

Desde a correção em [[../00_Decisoes/2026-08-27-correcao-carrinho-perdido-ao-logar-no-checkout|2026-08-27-correcao-carrinho-perdido-ao-logar-no-checkout]], o carrinho anônimo é mesclado com o carrinho do servidor no login, mas só em memória/`localStorage` do navegador atual — nenhuma chamada é feita pra persistir esse carrinho mesclado de volta em `PUT/POST /customers/me/cart`. Se o cliente logar num outro navegador/dispositivo antes de voltar a mexer no carrinho neste, o item mesclado não aparece lá — só existe localmente até a próxima ação que já sincronize o carrinho (adicionar/remover item, ida ao checkout que já usa o estado local, etc.).

## Contexto

Descoberto durante a mesma investigação que achou o bug original (verificação de fidelidade visual + funcional do marketplace, 2026-08-27). Resolvido o sintoma mais grave (item sumindo da tela) sem persistir a mesclagem no servidor, por ser escopo maior (decidir se a sincronização deve ser síncrona no login ou best-effort em background, tratar falha de rede sem travar o login). Fica como próximo passo, não bloqueante.
