---
cssclasses: ia-nota
---

# 2026-09-18 — Carrinho/caixa do PDV: cashback calculado, modal duplicada, local persistido e teto de quantidade por receita

## Contexto

Leva de quatro pedidos pontuais sobre o mesmo card do carrinho/fluxo caixa do PDV, na sequência:

1. Trocar "O cashback ganho é calculado ao emitir a nota" pelo valor já calculado.
2. "Enviar para o caixa" mostrava duas confirmações (um toast + a modal "Enviado para o caixa").
3. O local de retirada que o farmacêutico escolhe não chegava configurado para o caixa depois do claim da fila.
4. Item controlado (não-MIP) não podia ter a quantidade aumentada na tela do caixa além do que já foi validado na receita.

## Decisão

### 1. Cashback ganho — preview real, não só um aviso

`PdvService.get_discount_limit` (endpoint `POST /pdv/discount-limit`, já chamado com debounce a cada mudança do carrinho para o teto de desconto) passou a **também** devolver `cashback_earned_preview` — o mesmo cálculo por regra de `_compute_cashback` (percentual por item, piso de pedido mínimo, teto por linha), só que contra as linhas do carrinho ainda não finalizado (`_resolve_preview_lines`, sem lock/sem persistir nada) em vez de um `PdvOrder` já salvo. Reaproveitar o mesmo endpoint (em vez de criar um novo) evita mais uma chamada de rede a cada digitação — o carrinho já debate essa consulta.

`_resolve_preview_lines` ganhou `inventory_item_id` no dict retornado (precisava disso para casar com `CashbackRepository.resolve_rules_for_items`, que antes só era chamado a partir de um pedido já persistido).

Frontend: `KV "Cashback a ganhar"` no resumo, só aparece quando `cashbackPreview > 0` — a mensagem genérica antiga foi removida, não escondida atrás de uma condição.

### 2. Duas confirmações ao enviar para o caixa → uma só

O clique em "Enviar para o caixa" disparava `finalizeSale("Pedido enviado ao caixa")` (um toast) **e** `setSentModal(true)` (a modal "Enviado para o caixa", com corpo explicando o que aconteceu e botão "Atender próximo paciente"). Removido o toast — a modal já é mais informativa e tem uma ação clara, o toast era só ruído duplicado.

### 3. Local de retirada não sobrevivia ao claim do caixa

Achado ao investigar: `PdvOrderItem` (o model do item de pedido na fila) **nunca teve uma coluna `location_id`** — só `storage_location_snapshot` (o código do local, tipo "A2-07", como texto solto). O frontend já enviava `location_id` corretamente ao "Enviar para o caixa" (`pdvSendToCashier`), e a resposta IMEDIATA daquele mesmo request até devolvia o valor certo (lido de um dict transitório só daquele request) — mas assim que o caixa dava claim na fila **numa requisição separada**, `PdvLineResponse.location_id` sempre voltava vazio (não tinha de onde ler), e o `<select>` do local no carrinho do caixa nunca vinha pré-selecionado.

Corrigido: nova coluna `pdv_order_items.location_id` (migração `20260918_01`), preenchida no `create_queue_order` a partir do dict já resolvido por `_prepare_lines`, e lida de volta em todo lugar que monta `PdvLineResponse` a partir de um `PdvOrderItem` persistido (`list_queue`, `claim_order`, `_return_stock_and_cancel`, `complete_sale`) — não só no response imediato do próprio `create_queue_order`.

### 4. Item controlado: caixa não aumenta além do validado na receita

Investigação de arquitetura antes de codar: como a quantidade validada precisaria sobreviver ao claim (farmacêutico e caixa podem ser sessões/PCs diferentes), qualquer solução só no `prescriptionStatus` local (React state) não bastaria — precisava vir do servidor, igual ao item 3.

- Nova coluna `prescription_items.validated_quantity` (migração `20260918_02`) — quantas unidades o farmacêutico validou ao aprovar/enviar a receita pelo PDV. Nula para prescrições de outros fluxos (pedido online, upload de receita completa), que não passam por este código.
- `PdvPrescriptionCreateRequest.quantity` (novo campo, `1..100`) — o frontend manda `line.qty` (a quantidade da linha do carrinho no momento da validação) ao criar/validar a receita.
- `PdvPrescriptionResponse`/`PdvPrescriptionCartStatusResponse.validated_quantity` — devolvido tanto na hora de validar quanto na consulta de status (`GET /pdv/prescriptions/status`), então sobrevive a um claim em outra sessão.
- **Reforço server-side, não só UI**: `PdvService._enforce_prescription_gate` (o gate que já bloqueia "Enviar para o caixa" sem receita aprovada) passou a **também** comparar a quantidade da linha contra `validated_quantity` — se o farmacêutico aumentar a quantidade depois de validar e tentar enviar sem revalidar, o envio é rejeitado (422) com uma mensagem explicando quanto foi validado vs. solicitado. Esse é o ponto que realmente importa, porque é aqui que o estoque é decrementado e o pedido é travado — ver próxima seção sobre por que a UI do caixa sozinha não bastaria.
- Frontend: na **tela do caixa** (só lá — o farmacêutico continua livre para ajustar e revalidar), o botão "+" da linha do carrinho fica desabilitado ao atingir `validated_quantity` para item controlado já aprovado, com um aviso ("Quantidade validada na receita: N un. — para mais, o farmacêutico precisa revalidar.") em vez do aviso de teto de estoque (quando os dois se aplicam, o de receita tem prioridade na mensagem).

## Achado ao investigar o item 4 — quantidade do caixa é só cosmética hoje

`POST /pdv/orders/{id}/complete` (o endpoint que finaliza a venda) **nunca recebeu `items` no payload** — só `payment_method`, `include_cpf_on_invoice`, `cashback_applied`, `payment_terminal_reference`. Ele sempre fatura pelas linhas **já persistidas** em `PdvOrderItem` no momento em que o farmacêutico enviou à fila, não pelo que o caixa vê/edita em tela naquele momento. Isso significa que o stepper +/- do carrinho na tela do caixa, hoje, **não tem nenhum efeito real na venda** — é só um valor local (`pdvCart`/React state) que nunca chega ao servidor nessa etapa.

Consequência prática: o problema de segurança/conformidade que o usuário descreveu (vender mais do que a receita cobre) já era estruturalmente impossível de fato — mas o valor mostrado em tela (quantidade, subtotal, total) podia ficar **incorreto/enganoso** em relação ao que de fato seria cobrado, o que é um bug de UX sério por si só (operador ou cliente veem um preço que não é o real). O bloqueio implementado no item 4 resolve isso taticamente para o caso descrito (impede a edição visual também), mas o problema de fundo — o stepper do caixa editar algo que não é enviado a lugar nenhum — é maior e não foi resolvido aqui. Registrado como pendência.

## Achado ao verificar de ponta a ponta — "Tela do caixa" nunca tinha sido testada com uma conta cashier de verdade

Ao testar os itens 3 e 4 com uma conta `cashier` real (não admin/pharmacist, que é o que todo teste anterior deste projeto usou), a tela do caixa estava quase inteiramente quebrada — nenhum dos dois sintomas tinha a ver com o código desta leva; eram lacunas de RLS e de um flag hardcoded que sempre existiram, só nunca expostas porque ninguém tinha testado como cashier de verdade antes:

- **RLS bloqueava `cashier` de ver o próprio estoque**: `inventory_items_access_policy`, `inventory_stock_lots_access_policy`, `inventory_locations_access_policy` e `inventory_products_access_policy` só liberavam `admin`/`manager`/`pharmacist` — `cashier` nunca esteve na lista, nem para a própria loja. Isso quebrava a busca de produto do caixa (sempre vazia) e o dropdown de local de retirada (sempre vazio, fazendo o teto de estoque mostrar "0 un." pra qualquer item). Corrigido com 4 policies aditivas novas (`*_cashier_read_policy`, só `SELECT`, só a própria loja via `can_access_store_row`) — mesmo padrão das policies cross-loja de pharmacist/manager já documentadas acima na sessão anterior.
- **Rota de status de receita excluía `cashier`**: `GET /pdv/prescriptions/status` exigia `admin`/`manager`/`pharmacist` no `require_internal_subject` — nada a ver com RLS, era o próprio decorator da rota. Adicionado `CASHIER` (a rota é só leitura; `POST /pdv/prescriptions`, que registra a decisão, continua restrita aos três papéis originais).
- **RLS de `prescriptions`/`prescription_items` também excluía `cashier`**: mesmo depois de liberar a rota, a query ainda voltava vazia — `can_access_prescription_row()` (função compartilhada entre `USING` e `WITH CHECK`) também só considerava os três papéis. Como editar essa função daria a `cashier` permissão de **escrita** em receita (indesejado), a correção foi uma policy aditiva `SELECT`-only nova em cada tabela, não uma mudança na função compartilhada.
- **`PdvLineResponse.controlled` vinha hardcoded `False`** em `list_queue`, no fallback de `claim_order` e em `_return_stock_and_cancel` — ou seja, a "Tela do caixa" nunca soube que um item era controlado, então nem o selo "Tarja", nem a linha de receita, nem o teto de quantidade do item 4 apareciam, não importa o que o backend/RLS devolvesse. Corrigido usando `order.includes_controlled_items` (o mesmo flag de nível-pedido, não por item, que `PdvSaleItem.is_controlled` já usa — uma simplificação já aceita e documentada no projeto, não uma nova). Efeito colateral esperado dessa simplificação: um pedido com 1 item controlado marca **todos** os itens do pedido como controlados na tela do caixa (visto no teste: Vitamina D3 ganhou o selo "Tarja" só por estar no mesmo pedido do Clonazepam) — consistente com o que já acontece na nota fiscal final, não uma regressão nova.

Nenhuma dessas 7 correções (4 policies de estoque + 1 papel de rota + 2 policies de receita + 1 flag de model) tem qualquer relação direta com os 4 pedidos originais desta leva — foram só o que apareceu ao testar com o papel certo pela primeira vez.

## Achado à parte: disco cheio travou o Docker durante o trabalho

No meio da verificação, `~/.docker/desktop/vms/0/data/Docker.raw` (o disco virtual do Docker Desktop) tinha crescido até ~187G num disco de 187G, deixando só 2,6G livres e travando o daemon. Usuário limpou espaço manualmente (o que também apagou o volume do Postgres — aceitável, dado como dado de dev descartável). Depois da limpeza, o build do backend passou a falhar por um motivo **diferente e novo**: download de pacotes Debian falhando ("Error reading from server") — isolado como conflito de MTU entre o ProtonVPN ativo no host (interface `proton0`, MTU 1420) e o MTU padrão do Docker (1500). Corrigido adicionando `"mtu": 1420` em `~/.docker/daemon.json` e reiniciando o serviço `docker-desktop` (`systemctl --user restart docker-desktop`) — confirmado com um `apt-get install` de teste antes de seguir para o build real.

## Consequências

- Build do frontend (`npm run build`) e checagem de sintaxe dos arquivos Python, OK.
- **Verificado de ponta a ponta em Docker** (stack recriado do zero após a limpeza de disco, migrations aplicadas via `alembic stamp head` já que o bootstrap recria o schema atual diretamente): farmacêutica identifica cliente, monta carrinho com item controlado + item comum, cashback previsto aparece no resumo (`+ R$ 3,14`), valida receita, envia ao caixa com uma única modal de confirmação; caixa (conta `cashier` real, não admin) recebe o pedido da fila, ambos os locais de retirada vêm pré-selecionados, e o item controlado mostra "Quantidade validada na receita: 1 un." com o "+" desabilitado.
- Duas migrations novas aplicadas: `20260918_01_pdv_order_item_location_id`, `20260918_02_prescription_item_validated_quantity`.

## Ver também

- [[../06_Pendencias/quantidade-do-caixa-nao-afeta-a-venda|quantidade do caixa não afeta a venda]] — o achado descrito acima, registrado à parte.
- [[../06_Pendencias/queries-em-loop-checkout-pdv|queries em loop no checkout PDV]] — outra pendência conhecida do mesmo módulo.
