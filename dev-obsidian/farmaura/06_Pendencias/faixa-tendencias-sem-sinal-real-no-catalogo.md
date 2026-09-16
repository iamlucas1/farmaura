# Faixa "Tendências" da home (demo) sem sinal real de tendência no catálogo

**Status:** Resolvido em 2026-08-29 — ver [[../00_Decisoes/2026-08-29-faixa-tendencias-curadoria-manual|ADR]]
**Prioridade:** Baixa
**Registrado em:** 2026-08-27

## Descrição

O demo de referência da composição visual "padrão farmácia" tem 7 faixas coloridas na home, na ordem: Categorias (rose-soft), Marcas em destaque (rose), Visto recentemente (beige), Mais procurados (bg), Sugestões para você (info-soft), **Tendências** (success-soft), Cuidados e Infantil (warn-soft). A implementação real (`farmaura/react/marketplace/screens/home-screen.jsx`) reproduz as outras 6 com dados reais, mas pula a faixa "Tendências" — não existe hoje nenhum sinal real de tendência/alta de vendas por período no catálogo (`products`) que a diferencie de "Mais procurados" (`tags.includes('mais-vendido')`) sem duplicar a mesma lista com um rótulo fabricado.

## Contexto

Decisão tomada durante a revisão de fidelidade visual ao demo (2026-08-27): preferir uma faixa a menos a inventar um sinal de "tendência" sem lastro em dado real (violaria o Princípio 5 do PRODUCT.md sobre não fabricar conteúdo). Se no futuro o backend ganhar um sinal real de tendência (ex: crescimento de vendas período-a-período, `catalog_service` ou analytics), essa faixa pode ser adicionada usando o índice de cor 5 (`success-soft`, sem flip) do `FA_BAND_SEQUENCE` em `core/marketplace-bands.jsx`, mantendo a ordem/cor do demo.
