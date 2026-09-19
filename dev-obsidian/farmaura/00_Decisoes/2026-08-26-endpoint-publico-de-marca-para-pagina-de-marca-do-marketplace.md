---
cssclasses: ia-nota
---

# 2026-08-26 — Endpoint público de marca, escopado por tenant explicitamente (não por RLS)

## Contexto

A Fase 4 do [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|roadmap de composição visual "padrão farmácia"]] pedia identidade visual real pra página de marca do marketplace (hoje `ShopScreen` mode `brand` só troca o texto do cabeçalho). O backend já tem os dados certos — `Brand.description`/`Brand.logo_url` (`app/models/brand.py`), editáveis pelo console interno — mas **nenhum endpoint expõe isso a um visitante anônimo**: todas as rotas de `brands.py` são internas (`require_internal_subject`).

Ao desenhar a rota nova, encontrei que `brands` é uma das tabelas sem política de RLS (já documentado em [[../04_Seguranca_Riscos/rls-ausente-em-tabelas-de-varios-dominios|RLS ausente em tabelas de vários domínios]]) — diferente do endpoint de nota fiscal do cliente ([[2026-08-26-nota-fiscal-acesso-do-cliente-por-pedido|ADR irmão]]), onde o problema era RLS incompleta; aqui é RLS **inexistente**. Uma rota anônima usando `get_session` (sem contexto de tenant) bateria direto numa tabela sem proteção nenhuma — sem um filtro explícito de tenant, ela devolveria a marca de **qualquer** tenant do banco, não só do Farmaura.

## Alternativas consideradas

- **Esperar a RLS de `brands` ser corrigida antes de construir a rota pública.** Descartado: bloquearia a Fase 4 numa correção de infraestrutura sem prazo definido, para um problema que a rota nova pode evitar sozinha sem precisar da correção.
- **Adicionar RLS em `brands` como parte desta mudança.** Descartado do escopo desta leva — mudaria uma política usada por todo o CRUD interno de marca (criação, edição, ativação), risco maior que o necessário pra uma leitura pública de 3 campos. Fica registrado como opção futura no risco já aberto, não decidido aqui.
- **Confiar em `get_session` sem filtro de tenant**, já que hoje só existe um tenant real em produção. Descartado: correto pro estado atual, errado como prática — o mesmo padrão já foi resolvido com a função `SECURITY DEFINER` em outros endpoints públicos (bootstrap, `most-searched`), então reaproveitar é mais barato que aceitar a lacuna conscientemente.

## Decisão

Novo endpoint `GET /brands/public/{brand_name}` (`brands.py`, `PUBLIC_RATE_LIMIT`, sem autenticação), retornando só `name`/`description`/`logo_url` (`PublicBrandResponse`, nunca id/suppliers/timestamps). `BrandService.get_public_brand` resolve o tenant via `app_private.resolve_public_marketplace_tenant_id()` — a mesma função `SECURITY DEFINER` já usada pelo bootstrap anônimo e por `catalog_service.py`/`order_service.py` — e filtra `Brand` por esse `tenant_id` explicitamente na query, em vez de depender de RLS (que essa tabela não tem) ou de contexto de sessão (que não existe pra um visitante anônimo).

`BrandService.__init__` ganhou `subject: TokenSubject | None = None` só pra permitir essa instanciação sem subject — todo método pré-existente continua exigindo subject de verdade via um helper (`_tenant_id()`) que falha alto (`assert`) se for chamado sem um.

## Consequências

- A rota nova é segura mesmo sem a RLS de `brands` existir — não fica esperando aquela correção nem reintroduz o risco que ela mitigaria.
- O gap de RLS em `brands` (já documentado) **continua aberto** — esta decisão resolve só o caso de uso novo, não a lacuna estrutural. Qualquer código futuro que consultar `brands` via `get_session` sem esse mesmo cuidado volta a estar exposto.
- Como `Brand.description`/`logo_url` estão vazios pra quase toda marca hoje (achado durante a implementação — nem o seed popula, e o formulário do console interno não tem campo de logo, só de descrição), a página de marca do marketplace foi construída para degradar graciosamente (avatar com iniciais, sem parágrafo de descrição) em vez de esconder a seção ou inventar texto — ver [[../06_Pendencias/marca-sem-campo-de-logo-no-console-interno|pendência do campo de logo]].