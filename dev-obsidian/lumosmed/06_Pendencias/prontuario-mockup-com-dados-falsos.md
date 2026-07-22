# Páginas de Prontuário são mockups não-funcionais com dados fabricados, sem sinalização de "em construção"

**Status:** Aberto
**Prioridade:** Alta (risco de confiança/produto, não só técnico)
**Registrado em:** 2026-07-19

## Descrição

`resources/js/portal/prontuario.js` (432 linhas) e `prontuario-lista.js` (238 linhas) **não fazem nenhuma chamada `fetch()`** — para comparação, `pacientes.js` (feature real) tem 7. `prontuario-lista.blade.php` hardcoda tiles de estatística ("4.382 Registros Ativos", "3" aguardando) e três pacientes fictícios (Mariana Costa, Roberto Carlos, Ana Clara) com fotos geradas via `ui-avatars.com`; `prontuario.blade.php` usa fotos de banco de imagem (Pexels) como se fossem foto de paciente. Não existe domínio "prontuario" correspondente em `lumos-api` — é uma tela sem backend nenhum por trás.

**Isso é diferente das páginas genuinamente "em construção"** do mesmo portal (`nfs.blade.php`, `telemedicina.blade.php`, `tiss.blade.php` — 10 linhas cada, renderizam honestamente um partial `_placeholder` com texto tipo "esta área já está prevista e será implementada nas próximas entregas"). Prontuário se apresenta como funcionalidade pronta e populada, mas é fachada.

## Impacto

Se essa tela for vista por um usuário real, cliente em demonstração, ou investidor, ela comunica uma funcionalidade que não existe como se existisse — inclusive com nomes de pacientes fictícios que parecem reais. Risco de expectativa quebrada (cliente acha que já pode usar) ou, pior, de má interpretação em uma demo/due diligence.

## Mitigação / Tratamento

Nenhuma ainda. Duas saídas possíveis: (a) trocar pelo mesmo padrão honesto de `_placeholder` já usado em `nfs`/`telemedicina`/`tiss`, ou (b) se o prontuário estiver genuinamente em desenvolvimento ativo, conectar de fato ao backend antes de deixar essa tela acessível.

## Referências

Ver [[../Hub|Hub]] (área "Prontuário" no catálogo de páginas do portal, `portal_access_rules.py`).

## Ver também

- [[prontuario-sem-criptografia-em-nivel-de-campo]] — outro achado sobre a mesma área "prontuário" (ali é sobre proteção de dado real, aqui é sobre a tela nem ter dado real por trás).
