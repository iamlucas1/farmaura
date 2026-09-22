---
cssclasses: ia-nota
---

# 2026-09-22 — Reformulação de "Meus pedidos" e correção dos rótulos de pagamento

## Contexto

A tela "Meus pedidos" do marketplace (`farmaura/react/marketplace/screens/account-health-screen.jsx` e `account-shared.jsx`) exibia a forma de pagamento em inglês/com underscore (`credit_card`, `pix`) em vez de português legível. A seção "Avalie suas compras recentes" e o card de pedido (com o rastreamento/andamento) também estavam com um design abaixo do padrão "Warm Apothecary" documentado em `farmaura/DESIGN.md` — pedido explícito do usuário via `/impeccable`.

Investigando a origem do bug de rótulo, o checkout real (`order_service.py::_build_payment_label`) já humanizava corretamente — o problema estava só em `farmaura-api/scripts/seed.py`, que gravava o valor bruto do enum (`payment_method_label="credit_card"`) em 7 pontos diferentes, gerando dados de demonstração incorretos.

## Alternativas consideradas

- **Corrigir só o `seed.py` inline, duplicando o dicionário de labels que já existe em `order_service.py`** — descartado: cria uma segunda fonte de verdade que pode divergir de novo no futuro.
- **Resetar o banco de staging do zero (`down -v`) para gerar dados corretos** — descartado como primeira opção porque apagaria a conta Google de teste do usuário e qualquer dado criado por ele na sessão anterior; usado só como estratégia de verificação local (ambiente 100% descartável).

## Decisão

1. Extraído `farmaura-api/app/domain/payment_labels.py` como fonte única de verdade para rótulos de forma de pagamento online (`pix`, `credit_card`, `debit_card`, `pickup_cash`, `cash` → português sem underscore). `order_service.py` e `scripts/seed.py` passam a importar dali.
2. Redesenhada a seção "Avalie suas compras recentes" como galeria horizontal com miniatura real do produto (antes: lista vertical simples sem imagem de destaque).
3. Redesenhado o card de pedido: rail de progresso com ícones por etapa (`Confirmado → Separação → A caminho/Pronto p/ retirada → Entregue/Retirado`), nota de status contextual (ETA, cancelado, entregue), badges com ícone no resumo colapsado, grid de metadados com ícones, e ações convertidas de links soltos para botões (`fa-btn fa-btn-soft`).
4. Corrigidos dois nomes de ícone inexistentes em `FA_ICON_PATHS` (`"box"`, `"store"`) que o novo pill de status expôs — antes eram silenciosamente invisíveis (`Icon` retorna `null` para nome desconhecido, sem erro).
5. **Achado incidental, corrigido na mesma leva**: bug de cascata CSS pré-existente em `marketplace.css` — a media query `@media (max-width: 880px) { .account-nav { position: static; } }` estava declarada *antes* da regra base `.account-nav { position: sticky; ... }` no arquivo. Com especificidade igual, a ordem de declaração decide, e a regra base sempre vencia — o sidebar de conta ficava `sticky` mesmo em telas ≤880px e "vazava" visualmente por cima do conteúdo ao rolar (bug real, não artefato de screenshot — confirmado via `getComputedStyle` antes/depois). Corrigido movendo o override mobile para depois das regras base e `.is-pinned`, cobrindo os dois casos.

## Consequências

- Pedidos já persistidos no banco de staging (`lumos-dev`) precisaram de um `UPDATE` direto em SQL para os 50 registros com rótulo antigo — reexecutar `scripts/seed.py` via `merge()`/upsert só atualizou 3 de 53 pedidos, porque a geração em lote parece ser escalonada por dia ("pedidos gerados para hoje") e não revisita pedidos de dias anteriores. Documentado aqui para not surprise numa próxima correção de dado de seed: **um fix em `seed.py` não retroage sozinho sobre uma base de staging já populada**; é preciso ou um reset completo (`down -v`, quando não há dado real do usuário a preservar) ou um `UPDATE` cirúrgico equivalente.
- Encontrado, mas **não corrigido** (fora do escopo pedido): uma cor bruta pré-existente (`rgba(0,0,0,.14)`) no dropdown de seleção de pedido do `ConversationsInbox`, linha ~342 de `account-health-screen.jsx` — registrado como pendência separada, ver [[../06_Pendencias/cor-bruta-dropdown-conversationsinbox|cor-bruta-dropdown-conversationsinbox]].
- Verificado em Docker local e no ambiente de staging `lumos-dev` (`https://dev.drogariafarmaura.com.br`), desktop e mobile (390px), incluindo o fix do sidebar.
