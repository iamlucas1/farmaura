---
cssclasses: ia-nota
---

# Marca não tem campo de logo no console interno, apesar do backend suportar

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-26

## Descrição

`Brand.logo_url` existe no backend (`app/models/brand.py`) e já é aceito/persistido pelos endpoints internos de marca (`BrandCreateRequest`/`BrandUpdateRequest`), mas `brands-screen.jsx` (console interno → Catálogo → Marcas) **não tem nenhum campo de logo** no formulário — só nome e descrição (`brands-screen.jsx:396`). Toda marca semeada tem `logo_url=""`, e não há como um operador preencher isso hoje, mesmo que quisesse.

## Contexto

Encontrado ao implementar a Fase 4 do [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|roadmap de composição visual]] — a página de marca do marketplace (`GET /brands/public/{brand_name}`, novo) já está pronta para mostrar o logo real quando existir (`ShopScreen` mode `brand`, fallback para avatar com iniciais quando `logo_url` vazio). `description` já é editável e só precisa ser preenchida pelo time; `logo_url` precisa de um campo novo no formulário (provavelmente reaproveitando o mesmo padrão de upload já usado em `home-brands-screen.jsx` para os círculos de "marcas em destaque" da home, que já resolve upload de imagem — não é um mecanismo novo a inventar, só falta ligar ao formulário de marca em si).