# Backend é sempre a fonte única de verdade — nunca confiar em validação/cálculo feito no client

**Tipo:** Diretriz de segurança (princípio arquitetural)
**Status:** Vigente
**Data:** 2026-07-30

## Descrição

Nenhuma decisão que afete dinheiro, estoque ou elegibilidade de negócio pode se basear em um valor
ou resultado calculado no frontend e simplesmente aceito pelo backend. O servidor **sempre** revalida
contra o dado persistido — preço, estoque, frete, e agora cupom (ver [[cupom-validado-so-no-client]],
mitigado em 2026-07-30) já seguem essa regra. Qualquer UI (client-side) pode calcular um preview para
dar feedback instantâneo ao usuário, mas esse cálculo é **decoração**, nunca decisão — a mesma regra
de negócio precisa ser reexecutada do zero no servidor antes de qualquer efeito real acontecer
(cobrança, baixa de estoque, gravação de pedido).

## Motivo

Um client é sempre controlável pelo usuário — DevTools, payload manipulado à mão, chamada direta à
API sem passar pela UI. Qualquer regra que só existe no frontend (elegibilidade de cupom, cálculo de
desconto, limite de uso) é, na prática, uma regra que não existe — só protege usuários bem-
intencionados usando a UI normalmente, não bypass deliberado nem bug de client desatualizado.

## Como aplicar

- Todo valor que o client manda pro servidor e que **afeta dinheiro ou estoque** (desconto, preço,
  quantidade, frete) deve ser recalculado a partir de dado persistido no servidor — nunca só
  reaplicado/confiado.
- Toda regra "pode ou não pode" (elegibilidade, limite de uso, janela de vigência, escopo) precisa
  ser checada no servidor mesmo que o client já tenha uma checagem equivalente para UX responsiva.
- Preview client-side é bem-vindo e desejável para UX (evita round-trip pra descobrir que algo é
  inválido) — mas mensagens de erro específicas no client não são um vazamento de informação **desde
  que** o client já tenha acesso legítimo ao dado que embasa a mensagem (ex.: a lista completa de
  cupons do tenant já chega no bootstrap do marketplace, então detalhar "esse cupom é só pra clientes
  novos" no preview não expõe nada que o client não pudesse já inferir).
- Quando o servidor **não** quer expor o motivo exato de uma rejeição (ex.: um atacante testando
  cupons por tentativa e erro), a mensagem do servidor pode continuar genérica mesmo que o preview do
  client seja específico — os dois níveis de mensagem não precisam ser idênticos, só o efeito real
  (aplicar ou não o desconto) precisa depender só do servidor.

## Exceções conhecidas

Nenhuma aceita conscientemente até o momento. Toda vez que esse princípio foi violado neste projeto
(cupom, antes de 2026-07-30) foi tratada como risco de segurança a corrigir, não como exceção
deliberada.

## Referências

- [[cupom-validado-so-no-client|cupom-validado-so-no-client]] — primeiro caso concreto, mitigado.
- [[promocao-nao-reaplicada-no-checkout|promocao-nao-reaplicada-no-checkout]] — segundo caso concreto,
  mitigado: promoção dinâmica valia só na vitrine, nunca no checkout.
- [[../00_Decisoes/2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR: cupom validado no servidor]] — a correção que consolidou o padrão para cupom.
- [[../00_Decisoes/2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR: promoção reaplicada no checkout]] — a correção equivalente para promoção dinâmica.
- [[../02_Documentacao/Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — preço e estoque no checkout já seguiam este princípio antes do cupom ser corrigido (precedente já estabelecido na base).

## Atualizações

- 2026-07-30 (2): segundo caso concreto do mesmo princípio — promoção dinâmica por perfil
  (`PricingPromotion`) só era aplicada na listagem do catálogo, nunca revalidada no checkout; corrigida
  com a mesma receita (função de aplicação compartilhada entre os dois pontos).
- 2026-07-30: nota criada, formalizando o princípio a partir da correção de cupom (client-trusted → server-authoritative) e da extensão do preview client-side (canal, público-alvo, limite por cliente) que seguiu o mesmo princípio — preview mais completo, mas nunca fonte de verdade.
