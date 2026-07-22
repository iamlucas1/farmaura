# Regra de negócio: placeholders por controle regulatório

**Tipo:** Conformidade sanitária e regra de negócio

## Fonte de decisão

A imagem pública de um medicamento é definida exclusivamente pelos campos persistidos no Controle do estoque:

- `controlled_category`: `none`, `prescription`, `prescription_retention`, `special_control` ou `black_stripe`;
- `is_generic`: define se a variante genérica do placeholder deve ser usada.

Não é permitido inferir tarja, retenção ou condição de genérico pelo nome, marca, EAN ou classe terapêutica.

## Matriz de placeholders

| Tipo regulatório | Não genérico | Genérico | Imagem personalizada |
| --- | --- | --- | --- |
| Nenhum | Placeholder padrão ou imagem cadastrada | Placeholder genérico ou imagem cadastrada | Permitida |
| Sob prescrição | Prescrição | Prescrição genérico | Bloqueada |
| Prescrição com retenção | Retenção de receita | Retenção de receita genérico | Bloqueada |
| Controle especial | Retenção de receita | Retenção de receita genérico | Bloqueada |
| Tarja preta | Tarja preta | Tarja preta genérico | Bloqueada |

## Aplicação técnica

- O backend deriva a restrição de imagem do tipo regulatório e descarta imagem e galeria na projeção pública de medicamentos restritos.
- O precificador bloqueia a galeria para qualquer tipo diferente de `none`.
- A API rejeita tentativa de persistir imagem personalizada ou galeria para medicamento restrito.
- O campo operacional `is_controlled` é derivado do tipo regulatório para manter os fluxos de receita coerentes.

## Base normativa

- RDC nº 44/2009 da Anvisa, art. 54.
- RDC nº 96/2008 da Anvisa, art. 29.

## Atualizações

- 2026-07-20: classificação explícita e flag persistente de medicamento genérico adicionadas.
