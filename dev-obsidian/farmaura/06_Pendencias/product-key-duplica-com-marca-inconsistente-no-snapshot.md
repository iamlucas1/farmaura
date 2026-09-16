# Chave de agrupamento de produto duplica quando a marca vem vazia em algumas transações

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-15

## Descrição

`PurchaseHistoryService._product_key(name, brand)` agrupa compras do mesmo produto por `slug(nome)::slug(marca)`. Encontrado ao testar a nova detecção de recorrência ([[../00_Decisoes/2026-09-15-recorrencia-por-padrao-real-de-compra-e-assinatura-asaas|ADR]]): o cliente Rafael Martins tem duas compras reais de "Losartana Potassica 50mg 30 comprimidos" — uma com `brand_name_snapshot="Genfar"`, outra com `brand_name_snapshot=""` (vazio) — o que gera duas chaves diferentes (`...::genfar` vs `...::sem-marca`) para o que é visivelmente o mesmo produto. Efeito visível: a mesma linha de produto aparece duplicada em "Oportunidades de recorrência"/"Oportunidades de venda", cada uma com metade do histórico real.

## Contexto

Bug pré-existente na geração de dados de demonstração (`build_daily_operations`, `scripts/seed.py`), não introduzido por nenhuma mudança recente — só ficou visível agora porque a nova lógica de recorrência exibe o produto e sua contagem de forma mais destacada que antes. Duas correções possíveis: (a) fazer `build_daily_operations` sempre preencher `brand_name_snapshot` de forma consistente para o mesmo produto; (b) tornar `_product_key` mais tolerante, ignorando marca vazia ao invés de tratá-la como um valor distinto (ex.: cair para agrupar só por nome quando uma das marcas estiver vazia). Não corrigido nesta sessão por ser um problema de dado de demonstração, não do algoritmo em si — vale decidir a abordagem antes de mexer, já que a opção (b) muda o comportamento de agrupamento para todo o serviço, não só para este cliente.
