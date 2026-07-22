# Regra de negócio: ocultação no precificador mantém o produto indisponível no marketplace

**Tipo:** Regra de negócio

## Descrição

Ao ocultar um item no precificador do console interno, o produto correspondente permanece no catálogo do marketplace com estoque comprável zero e estado de indisponível. Ele não pode ser adicionado ao carrinho nem finalizado no checkout enquanto todas as suas fontes de estoque equivalentes estiverem ocultas.

Se o mesmo produto tiver ao menos uma fonte equivalente publicada, somente o estoque publicado integra a disponibilidade exibida e comprável.

## Motivo

A ocultação de preço/publicação não deve eliminar a referência do produto da navegação do cliente. Manter o item visível como indisponível evita uma remoção inesperada do catálogo e informa corretamente que a compra está temporariamente indisponível.

## Interface interna

Toda ação que muda um item publicado para oculto exige confirmação explícita. A modal explica que o produto continuará aparecendo no marketplace como indisponível.

## Aplicação técnica

- `app/services/marketplace_projection.py` preserva componentes ocultos no agrupamento e atribui estoque zero a eles;
- catálogo, carrinho e checkout usam a mesma projeção e não permitem compra com estoque zero;
- o cache local do console segue a mesma regra, evitando divergência visual em fallback;
- o precificador exige confirmação tanto no atalho da tabela quanto ao salvar o drawer.

## Atualizações

- 2026-07-20: regra formalizada e implementação concluída.
