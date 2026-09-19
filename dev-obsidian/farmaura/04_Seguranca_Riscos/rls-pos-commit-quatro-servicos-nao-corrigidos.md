---
cssclasses: ia-nota
---

# Bug de classe "commit() limpa contexto RLS transaction-local" — mais generalizado do que se pensava em `portal_service.py`

**Tipo:** Vulnerabilidade/robustez (falha funcional pós-commit, mesma classe já documentada em memória de sessão)
**Status:** PARCIALMENTE CORRIGIDO — `ChatService` corrigido em 2026-08-30; `PrescriptionService.decide` corrigido em 2026-09-02; `CrmService.create_address`, `PortalService.create_subscription`/`update_subscription`/`delete_subscription`/`save_favorite`/`delete_favorite` corrigidos em 2026-09-16; `DeliveryService.plan_routes` corrigido proativamente em 2026-09-19 (ver atualização); `InventoryService` continua confirmado e aberto; **~9 métodos de configuração administrativa em `portal_service.py` identificados com o mesmo padrão, ainda não testados/corrigidos** (ver seção nova abaixo).
**Severidade:** MÉDIO (ALTO especificamente para `InventoryService.update_location`/`update_location_status`, que gera exceção não tratada em vez de erro controlado)
**Sistema afetado:** `farmaura-api`
**Categoria:** Consistência de RLS pós-commit / robustez
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

O padrão já conhecido e corrigido em vários pontos do sistema (`portal_service.py`, `team_service.py`, `customer_service.py`, parte de `inventory_service.py`) — `session.commit()` limpa o contexto RLS transaction-local (`app.current_tenant_id` etc., setado via `set_config(..., true)`), então qualquer leitura protegida por RLS logo depois de um commit sem reaplicar `apply_tenant_context` roda com contexto vazio — **não foi aplicado consistentemente**. A auditoria encontrou quatro métodos adicionais, em três services, com o mesmo problema:

1. ~~**`ChatService`** (`send_message`, `send_customer_message`, `ensure_customer_thread`) — cada um persiste e comita, depois relê a mesma thread via `list_threads()`/`list_customer_threads()` (tabela `chat_threads`, `FORCE ROW LEVEL SECURITY`). Sem contexto, a busca vem vazia → `HTTPException(500, "Thread payload unavailable after send.")`. A escrita já foi persistida com sucesso antes do erro.~~ **CORRIGIDO em 2026-08-30** — `_reapply_tenant_context()` adicionado após os 4 pontos de commit do serviço (os três originais mais `submit_customer_prescription`, que ganhou o mesmo padrão desde a criação). Ver [[../00_Decisoes/2026-08-30-chat-farmaceutico-anti-spam-vinculo-pedido-e-congelamento|ADR do trabalho que corrigiu]].
2. ~~**`PrescriptionService.decide`** — mesmo padrão: decide, comita, relê a fila (`list_review_queue()`, tabela `prescriptions` com RLS) → `HTTPException(500, "Prescription payload unavailable after update.")`.~~ **CORRIGIDO em 2026-09-02** — `apply_tenant_context` adicionado logo após o commit. Achado ao testar ponta a ponta o gate de pagamento por receita (aprovar/recusar sempre estourava esse 500, mascarado porque o fluxo nunca tinha sido exercitado completamente antes). Ver [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR do trabalho que corrigiu]].
3. **`InventoryService.update_location`/`update_location_status`** — em vez de uma nova `SELECT` via repository, usa `session.refresh(location)` (recarga explícita pela PK, que ignora `expire_on_commit=False` porque é uma chamada explícita). Sobre uma tabela com `FORCE ROW LEVEL SECURITY` (`inventory_locations_access_policy`), sem contexto isso não retorna nenhuma linha para o PK — o comportamento do SQLAlchemy nesse caso é `ObjectDeletedError`, **não tratado** em `core/exceptions.py` (que só trata `DomainError`/`IntegrityError`), resultando em exceção não capturada / 500 genérico. Métodos vizinhos no mesmo arquivo já foram corrigidos com `apply_tenant_context` — a correção não chegou a esses dois.
4. ~~**`CrmService.create_address`** — persiste endereço, comita, relê via `list_addresses(customer_id)` (que depende só de RLS, sem filtro manual de tenant — ver [[../04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv|achado relacionado sobre ausência de filtro manual]]). Sem contexto, retorna lista **vazia**, sem lançar exceção nenhuma — o operador vê "sucesso" mas a lista de endereços parece não ter o que acabou de cadastrar.~~ **CORRIGIDO em 2026-09-16** — reportado pelo usuário como "clico em salvar o endereço na modal do PDV e não muda nada na tela". Reproduzido ponta a ponta via Chrome headless com instrumentação de `fetch`: a resposta do `POST /crm/customers/{id}/addresses` vinha `{"items": []}` mesmo com o endereço realmente persistido no banco — o frontend (`PdvFulfillmentPicker.handleSaveAddress`) então não encontrava um endereço "novo" na lista vazia e nunca fechava a modal, dando a impressão de que nada foi salvo (e levando a múltiplos cliques/endereços duplicados reais no banco, já que cada clique de fato criava uma linha). `apply_tenant_context(self.session, self.subject)` adicionado logo após o commit.
5. **`PortalService.create_subscription`/`update_subscription`/`delete_subscription`** (`portal_service.py:1032`/`1054`/`1065`, antes da correção) — mesmo padrão exato, encontrado ao auditar os arredores do bug nº 4 por serem parte do mesmo recurso (assinaturas). Sem contexto pós-commit, um cliente criando, pausando/editando ou cancelando uma assinatura no marketplace veria a lista de assinaturas voltar vazia — mesmo sintoma de "não parece ter salvo". **CORRIGIDO em 2026-09-16** junto com o item 4, mesmo padrão (`apply_tenant_context(self.session, subject)` após cada um dos três commits).

## Evidência

```python
# chat_service.py:83-93
await self.repository.add_message(message)
...
await self.session.commit()
response = await self.list_threads()
match = next((item for item in response.items if item.id == thread_id), None)
if match is None:
    raise HTTPException(status_code=500, detail='Thread payload unavailable after send.')
```
```python
# prescription_service.py:236-246 — mesmo padrão
```
```python
# inventory_service.py:279-285 (update_location) e :309-315 (update_location_status)
await self.session.commit()
await self.session.refresh(location)   # ObjectDeletedError sem contexto RLS
```
```python
# crm_service.py:111-114
await address_repository.add(address)
await self.session.commit()
return await self.list_addresses(customer_id)   # lista vazia, sem exceção
```

## Cenário de risco

Nenhum requer payload malicioso — acontece em qualquer chamada normal aos métodos afetados: enviar mensagem de chat, decidir uma prescrição, editar uma localização de estoque, cadastrar um endereço de cliente no CRM/PDV.

## Impacto

Todos falham **fechado** (sem vazamento cross-tenant) — a diferença é a qualidade da falha: os casos 1 e 2 retornam 500 controlado com a escrita já persistida (cliente não sabe que funcionou, pode reenviar e duplicar); o caso 3 é uma exceção ORM não tratada, potencialmente pior para diagnóstico e quebra a tela de gestão de localizações de estoque; o caso 4 é o mais silencioso — sucesso aparente com resultado vazio, sem nenhum sinal de erro, o que pode levar a duplicação de cadastro por reenvio "porque pareceu que não salvou".

## Pré-condições

Nenhuma — comportamento determinístico em qualquer chamada normal aos quatro métodos.

## Escopo afetado

~~`app/services/chat_service.py` (`send_message`, `send_customer_message`, `ensure_customer_thread`)~~ — corrigido. ~~`app/services/prescription_service.py` (`decide`)~~ — corrigido. ~~`app/services/crm_service.py` (`create_address`)~~ — corrigido. ~~`app/services/portal_service.py` (`create_subscription`, `update_subscription`, `delete_subscription`, `save_favorite`, `delete_favorite`)~~ — corrigido. Ainda aberto: `app/services/inventory_service.py` (`update_location`, `update_location_status`).

## Achado em 2026-09-16: suspeitos adicionais em `portal_service.py` (configuração administrativa)

Ao corrigir `save_favorite`/`delete_favorite` (ver [[../00_Decisoes/2026-09-16-oportunidades-de-venda-visualizacoes-favoritos-e-desejados|ADR]]), uma varredura por `commit()` seguido imediatamente de releitura em `portal_service.py` encontrou mais ~9 métodos com o mesmo padrão, todos ligados a configurações administrativas (não testados nem corrigidos nesta leva — superfície diferente do que estava sendo trabalhado):

- Banner da home, marcas em destaque, tendências da home, modo de lançamento.
- Preço/áreas de entrega, desconto do PDV, CNAE, custos de construção, configurações financeiras.

Todos seguem o padrão `await self.session.commit()` imediatamente seguido de `return await self._resolve_<algo>(tenant_id=...)` sem reaplicar `apply_tenant_context` — mesmo formato exato dos casos já corrigidos. Não confirmado com teste real ainda (diferente dos casos 4/5 acima, que já foram reproduzidos e corrigidos) — listado aqui como suspeita forte a validar/corrigir numa varredura dedicada, não como confirmado.

## Causa raiz

Mesma raiz já identificada e corrigida em outros services do sistema (ver referência de memória de sessão abaixo) — falta reaplicar `apply_tenant_context(self.session, self.subject)` logo após `session.commit()` e antes de qualquer releitura/refresh subsequente protegida por RLS. A correção existe como padrão conhecido no codebase, mas não foi propagada a estes quatro pontos.

## Correção sugerida para análise futura

Adicionar `await apply_tenant_context(self.session, self.subject)` imediatamente após cada `await self.session.commit()` nos quatro métodos listados, antes da releitura/refresh subsequente — exatamente o padrão já aplicado em `portal_service.py`/`team_service.py`/outros pontos de `inventory_service.py`.

## Dependências da correção

Nenhuma migration — mudança de lógica de aplicação, mecânica e de baixo risco.

## Riscos de regressão

Muito baixo — é a reaplicação de um padrão já usado com sucesso em outros pontos do mesmo codebase.

## Como validar futuramente que a correção funcionou

Testar cada fluxo afetado ponta a ponta (enviar mensagem de chat, decidir prescrição, editar localização de estoque, cadastrar endereço) e confirmar que a resposta reflete o estado real persistido, sem 500/lista vazia espúria.

## Referências

- Memória de sessão `feedback_farmaura_rls_context_after_commit` (não é uma nota do cofre, é memória de sessão do agente — mesma classe de bug, já documentada em múltiplos ADRs, ver [[../00_Decisoes/2026-08-03-ofertas-do-dia-ciclos-automaticos-e-sorteio-por-parametros|ADR onde o bug foi originalmente encontrado e corrigido]]).
- [[../03_Padroes_Politicas/excecao-deal-of-the-day-cross-service-em-leitura|excecao-deal-of-the-day-cross-service-em-leitura]] — outro ponto do sistema que precisou do mesmo cuidado.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-09-19: sexta ocorrência da mesma classe, encontrada e corrigida de forma proativa (não por bug reportado): `DeliveryService.plan_routes` (`app/services/delivery_service.py`), escrita nesta mesma data como parte da reformulação de rotas de entrega (Dijkstra bidirecional + grafo de proximidade k-NN + sweep clustering multi-entregador/multi-loja). O método cria/atualiza `DeliveryRoute`/`DeliveryRouteStop`, comita, e imediatamente relê via `list_active_routes()` (tabelas com RLS). Sem reaplicar contexto, a releitura pós-commit voltava com zero rotas mesmo tendo persistido corretamente — depurado com instrumentação temporária (`print` em pontos-chave) até isolar a causa. Corrigido com `await apply_tenant_context(self.session, self.subject)` logo após o commit, mesmo padrão dos casos 4/5. Ver [[../00_Decisoes/2026-09-19-entregas-rota-otimizacao-real-e-correcoes|ADR do trabalho que corrigiu]] (a ser complementado com o Dijkstra bidirecional).
- 2026-09-16 (2): `save_favorite`/`delete_favorite` também corrigidos (mesmo dia, leva de trabalho separada sobre favoritos/desejados/visualizações no motor de recomendação) — e uma varredura por esse mesmo padrão em `portal_service.py` encontrou ~9 métodos de configuração administrativa com o mesmo formato, ainda não testados/corrigidos (ver seção "Achado em 2026-09-16" acima e [[../00_Decisoes/2026-09-16-oportunidades-de-venda-visualizacoes-favoritos-e-desejados|ADR]]).
- 2026-09-16: casos 4 e 5 corrigidos (`CrmService.create_address` e as três mutações de assinatura em `PortalService`). O caso 4 deixou de ser risco teórico — confirmado em produção de dados reais: o cliente de teste tinha 4 endereços "Casa" idênticos duplicados no banco, claramente de múltiplos cliques em "Salvar" feitos por um usuário real convencido de que nada estava acontecendo. Ver [[../00_Decisoes/2026-09-16-correcao-rls-pos-commit-endereco-pdv-e-assinaturas|ADR desta correção]] para o passo a passo da investigação. Só `InventoryService` (item 3) segue aberto.
- 2026-09-02: `PrescriptionService.decide` corrigido como parte do trabalho de bloqueio de
  pagamento até validação de receita — `apply_tenant_context()` aplicado após o commit. Restam 2
  dos 4 métodos originais (Estoque, CRM).
- 2026-08-30: `ChatService` corrigido como parte do trabalho de guarda anti-spam/vínculo de pedido/congelamento do chat — `_reapply_tenant_context()` aplicado nos 4 pontos de commit do serviço. Os outros 3 métodos (Prescrição, Estoque, CRM) continuam confirmados e sem correção.
- 2026-08-17: achado registrado via auditoria completa de segurança.