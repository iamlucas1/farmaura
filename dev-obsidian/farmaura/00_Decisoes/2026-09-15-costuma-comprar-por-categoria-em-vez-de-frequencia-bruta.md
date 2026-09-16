# 2026-09-15 — "Costuma comprar" no PDV passa a refletir categoria, não só frequência bruta

## Contexto

O card de cliente do PDV mostrava "Costuma comprar" como um top-5 simplesmente ordenado por quantidade de compras (`×N`), o que tendia a ficar dominado por um único item muito recorrente (ex.: um medicamento de uso contínuo comprado toda semana), sem mostrar a variedade real do consumo do cliente. Pedido: remover o número de vezes exibido e tratar a lista analisando categoria (Medicamentos, Bem-estar, Cosméticos/Perfumaria, Fitoterápicos, uso contínuo etc.), não só frequência — com o seed ajustado para ter dados ricos o bastante para demonstrar isso.

## Decisão

### Dado novo: categoria e uso contínuo por item do histórico

`CrmTopProductResponse` (`app/schemas/crm.py`) ganhou `category: str` e `continuous_use: bool`, lidos em `crm_service._serialize_customer` a partir de `Customer.top_products_snapshot` (JSON denormalizado, sem migração — só novas chaves dentro do mesmo campo). `internal-app.jsx` mapeia esses dois campos para `topProducts[].cat`/`.continuous` no shape já consumido pelo PDV.

### Seleção: um item representativo por categoria, não top-N por frequência

Novo helper `representativePurchasesByCategory` (`point-of-sale-screen.jsx`): agrupa `topProducts` por categoria e escolhe só o item de maior quantidade **dentro de cada categoria**, limitado a 5 categorias. O card renderiza essa lista sem nenhum contador — só o nome do produto, um badge "Uso contínuo" quando aplicável, e a categoria à direita.

### Seed: categoria nova (Fitoterápicos) + dados de compra diversificados

- Duas linhas novas em `bulk_product_rows` (`scripts/seed.py`): "Passiflora Incarnata 400mg" e "Valeriana 300mg", categoria **Fitoterápicos** (nova — catálogo antes só tinha Medicamentos/Bem-estar/Perfumaria/Infantil/Higiene). `location_prefix_by_category` ganhou o prefixo `"F"` para essa categoria.
- `top_products_snapshot` de cada cliente nomeado (Mariana, Lucas, Camila, Bianca, cliente com diabetes) reescrito para trocar a chave inexistente `"count"` (nunca lida pelo backend — bug preexistente silencioso, o "0×" visto antes desta mudança) por `"quantity"` de fato, e para cobrir várias categorias reais por cliente em vez de 1-2 itens da mesma categoria; itens de uso contínuo real (Losartana, Tiras de Glicemia) marcados com `"continuous_use": True`.
- Clientes em lote (`bulk_customer_rows`) ganharam `favorite_item_categories` (categoria + uso contínuo por item do pool) e um item de Fitoterápicos ocasional (1 em cada 4 clientes), determinístico por `row_index`.

## Consequências

- **Colisão de SKU corrigida durante o teste**: adicionar 2 linhas a `bulk_product_rows` (numeração automática `FA-PROD-{row_index+11}`) empurrou a faixa auto-gerada para `041`/`042`, colidindo com o SKU **fixo** `FA-PROD-041` já usado por `losartan_100` (a variante de 100mg da Losartana, em `product_specs`). Corrigido trocando esse SKU fixo para `FA-PROD-043` — única referência a ele em todo o repositório (`grep` confirmado antes da troca).
- Exigiu reset completo do banco local (`docker compose down -v && up`, dados de dev — ok resetar sem confirmação prévia) para o novo seed rodar; `scripts/bootstrap_database.py` só semeia banco vazio, não reaplica sobre um banco já populado. Cadastro de filhos de teste feito na sessão anterior (cliente seed Mariana Souza) foi perdido no reset — dado de teste, não uma perda real.
- Testado ponta a ponta via Chrome headless: card da Mariana Souza mostra "Losartana 50mg [Uso contínuo] Medicamentos", "Vitamina C 1g Bem-estar", "Passiflora Incarnata 400mg Fitoterápicos", "Protetor Solar FPS 70 Perfumaria" — quatro categorias diferentes, sem nenhum contador de vezes. Catálogo de Produtos confirmado exibindo a nova categoria/produto Fitoterápicos.

## Ver também

- [[2026-09-14-nome-dos-filhos-e-reorganizacao-do-card-de-cliente-no-pdv]] — mudança anterior no mesmo card (filhos, cashback, e a primeira versão — por frequência — de "Costuma comprar", agora substituída por esta).
