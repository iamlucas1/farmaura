---
cssclasses: ia-nota
---

# Duas categorias do demo sem equivalente real no catálogo ("Vitaminas e Suplementos", "Higiene e Cuidados")

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-29

## Descrição

Mapeando os ícones/cores da faixa "Categorias" da home real para bater com o `.catjar` do demo
de referência (ver [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|roadmap]]),
confirmado que o catálogo seedado (`scripts/seed.py`) só tem 5 categorias reais — Medicamentos,
Higiene, Infantil, Perfumaria, Bem-estar — enquanto o demo mostra 6: as mesmas 5 (a de higiene
lá chamada "Higiene e Cuidados", mais longa) mais **"Vitaminas e Suplementos"**, que não existe
como `Category` real aqui. "Vitaminas e Suplementos" só aparece no catálogo como
`therapeutic_class` de alguns produtos (linha de suplementos dentro de "Bem-estar"), nunca como
categoria própria.

## Contexto

`CATEGORY_GLYPH_BY_LABEL`/`CATEGORY_ORDER` (`farmaura/react/marketplace/screens/home-screen.jsx`)
já têm a entrada para "Vitaminas e Suplementos" pronta (ícone `vitaminSun`, cor
`var(--fa-success)`, mesma posição relativa do demo) — ela só nunca aparece porque nenhuma
`Category` com esse nome existe no seed. Decisão, na mesma linha da faixa "Tendências" (ver
[[faixa-tendencias-sem-sinal-real-no-catalogo|pendência irmã]]): não inventar uma categoria vazia
só para bater visualmente com o demo — se um dia fizer sentido de produto separar
"Vitaminas e Suplementos" de "Bem-estar" como categoria própria (produtos reais, não só
decoração), a faixa já sabe renderizar o ícone/cor certos assim que a categoria existir.

## Ver também

- [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|Roadmap composição visual "padrão farmácia"]] — atualização 2026-08-29 que trouxe os ícones/cores/ordem da faixa Categorias.