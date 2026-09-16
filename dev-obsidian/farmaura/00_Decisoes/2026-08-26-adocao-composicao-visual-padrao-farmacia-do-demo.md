# 2026-08-26 — Adoção da composição visual "padrão farmácia" do demo em todo o marketplace

## Contexto

Ao longo de várias sessões, um demo estático (`build_demo3.py` → HTML isolado, fora da árvore normal do app) explorou uma composição visual alternativa para o marketplace — apelidada "padrão farmácia": header fixo translúcido, utility topbar, hero, "ofertas do dia" com contador, e **sete faixas de largura total (full-bleed) conectadas por divisores em forma de onda (SVG)**, cada uma com uma cor de fundo diferente da paleta, terminando num rodapé com a logo branca sobre fundo Vermelho Vital. Usa os mesmos tokens de `DESIGN.md`/`Sistema_de_Design.md` (Warm Apothecary) — não é uma identidade nova, é uma composição/estrutura de página diferente sobre a mesma identidade.

Duas levas anteriores já trouxeram para o código real **funcionalidades e correções de UX** descobertas no demo (Meus pedidos com avaliação/nota fiscal real; carrossel de recomendados, modal de recorrência com projeção de economia, correção do desconto combinado, cantos do header, busca no drawer mobile). Essas levas **não mudaram a composição visual** das páginas — só corrigiram comportamento e adicionaram componentes pontuais dentro da estrutura que já existia.

O usuário agora pediu explicitamente que o **visual completo** do demo substitua o visual atual, em todas as telas (home, categorias, marcas, checkout, etc.), faseado.

Investigação do estado real (`screens/home-screen.jsx`, `shop-screen.jsx`, `checkout-screen.jsx`, `core/marketplace-chrome.jsx`) confirmou a diferença estrutural central: **o site real é inteiramente contido em `.fa-wrap` (max-width 1240px) do topo ao fim**, com uma única exceção (o fundo sólido do rodapé). Não existe hoje nenhuma faixa full-bleed, nem divisor em onda, em lugar nenhum do app. `DESIGN.md`/`Sistema_de_Design.md` também não documentam esse padrão — não é uma restauração de algo já formalizado, é uma direção visual nova.

## Alternativas consideradas

- **Manter o layout contido em `.fa-wrap` e só continuar portando funcionalidades pontuais do demo** (o que as duas levas anteriores já fizeram). Descartado como direção única porque o usuário pediu explicitamente a substituição visual completa — mas é o que já está feito e não precisa ser refeito.
- **Reescrever tudo de uma vez, sem fases.** Descartado: a composição full-bleed-com-ondas é uma mudança estrutural (novo primitivo de layout compartilhado, ordem/moldura de cada seção), não um ajuste local — fazer tudo de uma vez cria uma janela grande com o site num estado visualmente inconsistente/quebrado até terminar, e dificulta revisão incremental.
- **Migrar telas na ordem "mais fácil primeiro".** Parcialmente adotado — a ordem de fases no roadmap prioriza construir o primitivo compartilhado primeiro (bloqueante de tudo mais) e depois vai da tela de maior tráfego/impacto (Home) para as de menor superfície de mudança, mas sem ignorar dependências reais (ex: Categoria e Marca compartilham o mesmo componente hoje).

## Decisão

Adotar a composição full-bleed com faixas coloridas e divisores em onda como nova direção visual do marketplace, **em fases**, documentadas em detalhe em [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|Roadmap de composição visual "padrão farmácia"]]. Esta nota registra só a decisão; a execução fica para depois — nenhuma fase foi implementada como parte deste registro.

## Consequências

- Precisa de um primitivo de layout novo e compartilhado (faixa full-bleed + divisor de onda) antes de qualquer tela poder migrar — vira a Fase 0 do roadmap, bloqueante de todas as outras.
- `DESIGN.md` e `Sistema_de_Design.md` devem ganhar uma seção nova documentando esse padrão de composição (faixas + ondas) **quando a Fase 0 for implementada**, não antes — evita documentar um padrão que ainda não existe no código.
- Página de Marca hoje não tem identidade visual própria (reaproveita `ShopScreen` com só um cabeçalho de texto) — a Fase de Marca do roadmap depende de uma checagem de dados ainda não feita (o backend tem tagline/descrição por marca? ver roadmap) antes de poder ganhar o tratamento visual do demo.
- Enquanto o rollout estiver parcial (algumas telas migradas, outras não), o site terá duas composições coexistindo — aceitável e esperado durante a execução faseada, mas deve ficar visível no roadmap qual fase está em qual estado, para não gerar confusão sobre "isso já devia ter mudado?".
