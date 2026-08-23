# Bug de classe "commit() limpa contexto RLS transaction-local" — 4 métodos novos não corrigidos (Chat, Prescrição, Localização de estoque, Endereço CRM)

**Tipo:** Vulnerabilidade/robustez (falha funcional pós-commit, mesma classe já documentada em memória de sessão)
**Status:** CONFIRMADO
**Severidade:** MÉDIO (ALTO especificamente para `InventoryService.update_location`/`update_location_status`, que gera exceção não tratada em vez de erro controlado)
**Sistema afetado:** `farmaura-api`
**Categoria:** Consistência de RLS pós-commit / robustez
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

O padrão já conhecido e corrigido em vários pontos do sistema (`portal_service.py`, `team_service.py`, `customer_service.py`, parte de `inventory_service.py`) — `session.commit()` limpa o contexto RLS transaction-local (`app.current_tenant_id` etc., setado via `set_config(..., true)`), então qualquer leitura protegida por RLS logo depois de um commit sem reaplicar `apply_tenant_context` roda com contexto vazio — **não foi aplicado consistentemente**. A auditoria encontrou quatro métodos adicionais, em três services, com o mesmo problema:

1. **`ChatService`** (`send_message`, `send_customer_message`, `ensure_customer_thread`) — cada um persiste e comita, depois relê a mesma thread via `list_threads()`/`list_customer_threads()` (tabela `chat_threads`, `FORCE ROW LEVEL SECURITY`). Sem contexto, a busca vem vazia → `HTTPException(500, "Thread payload unavailable after send.")`. A escrita já foi persistida com sucesso antes do erro.
2. **`PrescriptionService.decide`** — mesmo padrão: decide, comita, relê a fila (`list_review_queue()`, tabela `prescriptions` com RLS) → `HTTPException(500, "Prescription payload unavailable after update.")`.
3. **`InventoryService.update_location`/`update_location_status`** — em vez de uma nova `SELECT` via repository, usa `session.refresh(location)` (recarga explícita pela PK, que ignora `expire_on_commit=False` porque é uma chamada explícita). Sobre uma tabela com `FORCE ROW LEVEL SECURITY` (`inventory_locations_access_policy`), sem contexto isso não retorna nenhuma linha para o PK — o comportamento do SQLAlchemy nesse caso é `ObjectDeletedError`, **não tratado** em `core/exceptions.py` (que só trata `DomainError`/`IntegrityError`), resultando em exceção não capturada / 500 genérico. Métodos vizinhos no mesmo arquivo já foram corrigidos com `apply_tenant_context` — a correção não chegou a esses dois.
4. **`CrmService.create_address`** — persiste endereço, comita, relê via `list_addresses(customer_id)` (que depende só de RLS, sem filtro manual de tenant — ver [[../04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv|achado relacionado sobre ausência de filtro manual]]). Sem contexto, retorna lista **vazia**, sem lançar exceção nenhuma — o operador vê "sucesso" mas a lista de endereços parece não ter o que acabou de cadastrar.

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

`app/services/chat_service.py` (`send_message`, `send_customer_message`, `ensure_customer_thread`), `app/services/prescription_service.py` (`decide`), `app/services/inventory_service.py` (`update_location`, `update_location_status`), `app/services/crm_service.py` (`create_address`).

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

- 2026-08-17: achado registrado via auditoria completa de segurança.
