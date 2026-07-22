# Zero atributo `alt=` no portal; `aria-*` presente só em metade das páginas

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-07-19

## Descrição

`grep -c 'alt='` retorna 0 em todo `resources/views/layouts/portal/*.blade.php`, incluindo o `<img>` do logo no layout mestre e as fotos (inclusive as fictícias de `prontuario*`/`conta.blade.php`). `aria-*` está presente em `agenda`, `checkout`, `configuracoes`, `mensagens`, `pacientes`, `plano`, `usuarios` (5–10 ocorrências cada) mas **ausente por completo** em `conta`, `crm`, `estoque`, `financeiro`, `home`, `luna`, `paineis`, `prontuario`, `prontuario-lista`.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19 — checagem rápida via grep, não uma auditoria de acessibilidade completa (não cobre navegação por teclado, foco em modal, contraste de cor). O padrão de layout compartilhado (`layouts/portal.blade.php`) é consistente — o gap de `alt=`/`aria-*` está nas páginas individuais, não na estrutura base.

## Ver também

- [[padronizar-estados-loading-vazio-erro-acessibilidade]] — gap de acessibilidade equivalente no console interno do Farmaura.
- [[design-system-blade-ausente-e-cores-fora-do-token]] — mesma ausência de componentes Blade compartilhados por trás deste gap.
