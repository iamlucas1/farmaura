---
cssclasses: ia-nota
---

# 2026-09-16 — Correção: RLS pós-commit fazia parecer que salvar endereço no PDV "não fazia nada"

## Contexto

Reportado pelo usuário: "Para dentro da modal do sistema interno de cadastrar o endereço eu clico para salvar mas ele não muda nada na tela, parecendo que não salvou." Ao investigar, o bug já estava **documentado como risco conhecido e não corrigido** desde uma auditoria de 2026-08-17 (ver [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|nota de risco]], item 4) — só nunca tinha sido de fato exercitado ponta a ponta antes.

## Investigação

Reproduzido via Chrome headless com instrumentação de `window.fetch` (monkeypatch para logar corpo da resposta de `/crm/customers/{id}/addresses`). O `POST` respondia `200 OK` com `{"items": []}` — lista vazia — mesmo com o endereço realmente persistido no banco (confirmado por SQL direto). Causa raiz: `CrmService.create_address` fazia `await self.session.commit()` e, na sequência, `return await self.list_addresses(customer_id)` — mas `commit()` encerra a transação e limpa as variáveis de sessão do RLS transaction-local (`app.current_tenant_id` etc., setadas por `apply_tenant_context` uma vez por request). A releitura seguinte roda sem contexto nenhum, o RLS filtra todas as linhas, e a lista volta vazia — sem lançar nenhum erro.

No frontend, `PdvFulfillmentPicker.handleSaveAddress` recebe essa lista vazia e nunca encontra um endereço "novo" para selecionar — a modal nunca fecha, dando a impressão exata de "não salvou". Pior: como o `POST` de fato tinha sucesso a cada clique, um usuário clicando "Salvar" várias vezes (por achar que não funcionou) criava **múltiplas linhas duplicadas de verdade** no banco — confirmado com uma conta de teste real que acumulou 4 endereços idênticos.

Ao revisar o mesmo arquivo (`portal_service.py`), encontrei o mesmo padrão exato em `create_subscription`/`update_subscription`/`delete_subscription` — as três mutações de assinatura do marketplace, usadas pela tela "Assinaturas" do cliente — não documentadas na auditoria original porque não tinham sido exercitadas ainda.

## Decisão

Aplicado o padrão já estabelecido no restante do código (`apply_tenant_context(self.session, self.subject)` — ou `subject`, a variável local, dependendo do método — logo após cada `commit()` e antes de qualquer releitura subsequente):

- `CrmService.create_address` (`crm_service.py`).
- `PortalService.create_subscription`, `update_subscription`, `delete_subscription` (`portal_service.py`).

Nenhuma migration, nenhuma mudança de schema — só a reaplicação do contexto de sessão já usado em vários outros pontos do mesmo arquivo.

## Consequências

- Testado ponta a ponta via Chrome headless: modal de endereço agora fecha sozinha após salvar, e o endereço aparece imediatamente na lista (testado com o cliente `Lucas Matheus`, criado numa sessão anterior para testes de recorrência).
- Confirmado via `curl` direto no endpoint que a resposta agora retorna a lista completa e atualizada.
- Endereços de teste duplicados (criados durante a reprodução do bug) removidos do banco.
- **Ainda aberto, fora do escopo desta correção**: `InventoryService.update_location`/`update_location_status` tem o mesmo padrão (usa `session.refresh()` em vez de nova query, gerando `ObjectDeletedError` não tratado) — não corrigido agora por não ter sido o que o usuário reportou; seguir a nota de risco para retomar.

## Ver também

- [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|nota de risco atualizada]] — histórico completo desta classe de bug em todo o backend.
- [[2026-09-16-retirada-ou-entrega-movida-para-o-carrinho-com-cadastro-em-modal|ADR que criou a modal de cadastro de endereço]] — a funcionalidade afetada por este bug.