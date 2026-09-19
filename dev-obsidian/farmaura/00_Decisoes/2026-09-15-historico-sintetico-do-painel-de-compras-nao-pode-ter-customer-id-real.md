---
cssclasses: ia-nota
---

# 2026-09-15 — Histórico sintético do Painel de Compras não pode ter customer_id de cliente real

## Contexto

Usuário reportou: no card "Oportunidades de recorrência" do PDV, a cliente Mariana Souza aparecia com uma sugestão de Vitamina D3 "para oferecer 45 unidades" — quantidade incompatível com um consumo pessoal real (ninguém compra 45 unidades de vitamina por vez, em casa).

Investigação por SQL direto: os `order_items` reais de Mariana para Vitamina D3 tinham quantidades 46, 44, 47, 42, 45 (média 44,8 ≈ 45) — batendo exatamente com `quantity // 2` da lista `PURCHASE_ANALYTICS_HISTORY_PLAN["vitamin_d3"] = [92, 88, 95, 85, 90]` em `build_purchase_analytics_history` (`scripts/seed.py`). Ou seja: **o algoritmo de recorrência (`_detect_interval_pattern`, ver [[2026-09-15-recorrencia-por-padrao-real-de-compra-e-assinatura-asaas|ADR da recorrência]]) calculou corretamente a partir de um dado de entrada errado** — não era um bug de lógica de recorrência, e sim de geração de dado de demonstração.

`build_purchase_analytics_history` gera histórico multi-mês de demanda **agregada da loja inteira**, pensado exclusivamente para o Painel de Compras (classificação ABC/XYZ) — não para representar o comportamento de compra de nenhum cliente específico. A função já dividia corretamente esse volume entre um pedido online (`Order`) e uma venda de balcão (`PdvSale`) por mês/produto, mas só o lado do `PdvSale` usava `customer_id=None`/`customer_display_name="Cliente balcao"` (anônimo, correto); o lado do `Order` usava `customer_id=buyer.id` com `buyer = customers["mariana"]` — atribuindo toda a demanda agregada da loja a ela como se fosse histórico de compra pessoal real, contaminando recorrência, upsell e "costuma comprar".

## Decisão

Removido o parâmetro `customers` e a variável `buyer` de `build_purchase_analytics_history`. O lado `Order` passou a espelhar o padrão já usado no `PdvSale`: `customer_id=None`, `customer_display_name="Cliente app"`, snapshots de documento/telefone/e-mail vazios. Histórico sintético do Painel de Compras agora é **sempre anônimo nos dois canais** (online e balcão) — nunca aparece como compra pessoal de nenhum cliente nomeado.

## Consequências

- Banco local resetado (`docker compose down -v && up -d`) para que o seed corrigido rodasse do zero; migração `20260915_01` já estava reproduzida via `create_all` do bootstrap, só precisou `alembic stamp head`.
- Verificado via SQL: os 5 `order_items` de Vitamina D3 antes atribuídos a Mariana agora têm `customer_id` nulo e `customer_display_name="Cliente app"`; a busca por `order_items` com `customer_id` da Mariana para Vitamina D3 retorna 0 linhas — ela não deve mais receber essa sugestão de recorrência para esse produto.
- Padrão a repetir: qualquer gerador de dado sintético/agregado no seed que preencha `Order`/`PdvSale` para fins de relatório (não de "vida" de um cliente específico) deve usar `customer_id=None` — nunca reaproveitar um `Customer` nomeado só porque ele está disponível no escopo da função.

## Ver também

- [[2026-09-15-recorrencia-por-padrao-real-de-compra-e-assinatura-asaas|ADR da recorrência]] — a lógica que consumiu esse dado corretamente, mas com entrada contaminada.
- [[../06_Pendencias/product-key-duplica-com-marca-inconsistente-no-snapshot|pendência irmã, causa raiz diferente]] — outro problema de qualidade de dado de seed no mesmo conjunto de features, não confundir os dois.