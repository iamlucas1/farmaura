# Revisão de acesso anônimo (marketplace exposto à internet)

**Tipo:** Vulnerabilidade + Risco identificado
**Severidade:** Alta (vazamento de PII/dado de negócio) e Média (corrupção de dado)
**Status:** Resolvido
**Data de identificação:** 2026-07-20

## Descrição

A pedido do usuário ("será exposto a internet e não poderá acessar nada que for de informação de usuarios, compras, alterar preços"), mapeei todo endpoint sem autenticação do backend e testei cada um contra dados reais. Achados:

1. **`/catalog/public` bloqueado por RLS** — mesma causa raiz da separação de roles do Postgres (`farmaura` superuser → `farmaura_app` restrito): a rota resolvia o tenant via query normal, sem contexto de sessão (`app.current_tenant_id`), então a policy `inventory_items_access_policy` bloqueava tudo silenciosamente. Catálogo público retornava `total: 0` sempre.
2. **`/portal/marketplace/public-bootstrap` com o mesmo bug**, independente — lojas, farmacêutico, serviços de saúde e cupons vinham todos vazios.
3. **Vazamento real mascarado pelo bug acima**: ao corrigir a resolução de tenant, a rota pública passaria a expor **e-mail do farmacêutico responsável** (`pharmacist.email`) e **comissão/taxa de pagamento/taxa fixa/margem mínima do marketplace** (`marketplace.commission_percent` etc.) — dado de funcionário e configuração financeira interna, sem motivo de estar acessível a qualquer visitante não logado.
4. **Corrupção de dado em cadastro público**: `/auth/register` e `/portal/marketplace/first-access` usavam a mesma resolução de tenant quebrada — todo cadastro novo estava gravando `tenant_id=""` no banco, uma conta permanentemente órfã (RLS nunca mais casaria `tenant_id = current_tenant_id()` depois do login real).

## Impacto

- (1)+(2): funcional, não vazamento — vitrine pública inutilizável (todo produto/loja "sumia" para quem não está logado).
- (3): vazamento real de e-mail de funcionário e de configuração financeira interna (comissão/margem) a qualquer visitante anônimo, uma vez que (1)/(2) fossem corrigidos sem tratamento adicional.
- (4): toda conta criada via cadastro público ficava quebrada — cliente nunca mais conseguiria ser reconhecido pelo RLS após o primeiro login.

## Mitigação / Tratamento

Todos os quatro pontos corrigidos no mesmo dia:

- Nova função `SECURITY DEFINER` `app_private.resolve_public_marketplace_tenant_id()` (bypass de RLS estritamente limitado a devolver um tenant id, nunca dado de linha) + `apply_public_marketplace_context()` (novo, em `app/core/tenant_context.py`) aplicando `app.current_tenant_id` + `app.current_user_role='customer'` para a sessão anônima — reaproveitado em `catalog_service.py` e `portal_service.py`.
- `PortalService._resolve_primary_pharmacist(..., include_contact=False)` no caminho público — e-mail nunca preenchido, independente do que a RLS permitir no futuro (defesa em profundidade).
- `marketplace.commission_percent`/`payment_fee_percent`/`fixed_fee`/`minimum_margin_percent` zerados especificamente na resposta pública (`get_marketplace_public_bootstrap`), resposta autenticada sem mudança.
- `portal_service._resolve_public_tenant_id()` corrigida para usar a mesma função `SECURITY DEFINER` — cadastro público testado antes/depois: `tenant_id` agora grava o valor real.

Verificações adicionais confirmaram que já estava correto: toda rota interna exige token válido (401 sem token, 403 com token de cliente comum); `register` não permite escolher role/escopo (fixado no servidor); webhook do Asaas falha fechado sem assinatura+IP; catálogo/reviews públicos não expõem custo, IDs internos de estoque nem PII de avaliador.

## Referências

Decisão relacionada de rate limit/senha forte (mesma sessão de trabalho, motivada pelo comentário de "sem rate limiting" encontrado durante esta revisão): [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial]], [[../00_Decisoes/2026-07-20-politica-de-senha-forte]]. Sem pendência aberta — os quatro pontos foram resolvidos e verificados na mesma sessão.

## Atualizações

- 2026-07-20: nota criada.
