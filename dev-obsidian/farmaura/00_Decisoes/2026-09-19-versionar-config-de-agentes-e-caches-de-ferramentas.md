---
cssclasses: ia-nota
---

# 2026-09-19 — Versionar configuração de agentes de IA e caches de ferramentas (`.claude`, `.agents`, `.agent`, `.codex`, `.gemini`, `.impeccable`, `.vite`)

## Contexto

Pedido explícito do usuário, em duas partes na mesma sessão: primeiro "suba tudo para o git, tanto da farmaura quanto as documentações" (código + `dev-obsidian/`); depois, especificamente, "quero que suba também as pastas claude e .agents" e, em seguida, mais três pedidos avulsos confirmando o mesmo padrão para `.vite`, `.gemini` e por fim `.agent`/`.codex`. Objetivo declarado logo depois, na mesma linha de trabalho: poder clonar este repositório numa máquina nova e já ter o mesmo ambiente de agente de IA calibrado (permissões, skills instaladas, histórico de críticas de design), sem reconstruir isso manualmente a cada máquina.

## Decisão

Passar a versionar, no repositório `dev`/`farmaura`, as pastas de configuração/estado de ferramentas de agente que antes eram tratadas como puramente locais:

- `.claude/` — allow-list de permissões do Claude Code (`settings.json`) e skills instaladas (`skills/`).
- `.agents/`, `.agent/`, `.codex/`, `.gemini/` — a mesma skill (`impeccable`, de crítica/design) espelhada para cada ferramenta de agente usada nesta máquina.
- `.impeccable/` (raiz, `farmaura-api/`, `farmaura/`) — configuração e histórico de críticas de design (`critique/*.md`) da skill Impeccable.
- `.vite/` (dentro de `farmaura/`) — cache de pre-bundle de dependências do Vite.

**Exceção mantida, não versionada**: arquivos que o próprio Impeccable já marca como estritamente locais via `.git/info/exclude` (não um `.gitignore` versionado, mas um exclude local do próprio clone) — `hook.cache.json`, `hook.pending.json`, `config.local.json`, em cada uma das três cópias de `.impeccable/`. Esses arquivos guardam estado voláteis de execução (cache de hook, consentimento local), não configuração compartilhável. Também mantido fora: `.claude/settings.local.json` — excluído por um `.gitignore` **global** do usuário (`~/.config/git/ignore`, regra `**/.claude/settings.local.json`), aplicada a qualquer repositório nesta máquina, não decidida nesta sessão; não foi sobrescrita com `git add -f`.

## Alternativas consideradas

- **Não versionar nada disso, documentar só os passos manuais de reconfiguração** — rejeitada pelo próprio usuário: o objetivo explícito é zero passo manual de configuração de agente numa máquina nova, e nenhum dos arquivos envolvidos contém segredo real (confirmado por varredura por padrões de chave/token/senha antes de cada commit — só encontradas credenciais de seed de desenvolvimento já documentadas publicamente neste mesmo cofre, como `Farmaura@123`, e o formato de token esperado citado em um comentário de código, nunca um valor real).
- **Versionar só `.claude/`** (a ferramenta em uso nesta sessão) e deixar as outras (`.agents`, `.agent`, `.codex`, `.gemini`) de fora — não foi essa a decisão final; o usuário pediu explicitamente cada uma das pastas em mensagens separadas ao longo da mesma sessão, então todas entraram.

## Consequências

- Uma máquina nova, ao clonar o repositório na branch `staging/lumos-dev`, já recebe as allow-lists de permissão e as skills instaladas sem nenhum passo de setup adicional — ver [[../../_Compartilhado/POPs_Processos/replicar-ambiente-de-desenvolvimento-em-nova-maquina|POP de replicação de ambiente]], escrito na mesma leva de trabalho.
- `.vite/` é cache de build puro — versionar não traz risco, mas também não é a prática usual (normalmente fica em `.gitignore`); decisão explícita do usuário supera a convenção padrão, documentada aqui para não ser "corrigida" por engano numa sessão futura sem contexto.
- A nota [[../../_Compartilhado/POPs_Processos/topologia-git-repositorios-e-branches|topologia-git-repositorios-e-branches]] tinha uma orientação anterior (2026-09-16) dizendo exatamente o contrário — nunca commitar essas pastas de estado de ferramenta de IA. Atualizada na mesma data desta decisão para refletir a reversão.
- Comandos de commit usados (para referência futura, não repetir a esmo): `git add` com pathspec explícito por pasta (`.claude`, `.agents`, `.agent`, `.codex`, `.gemini`, `.impeccable`/`farmaura-api/.impeccable`/`farmaura/.impeccable`, `.vite`), nunca `git add -A`/`.` — para nunca depender de exclusão implícita e sempre poder auditar exatamente o que entrou antes do commit.

## Ver também

- [[../../_Compartilhado/POPs_Processos/replicar-ambiente-de-desenvolvimento-em-nova-maquina|replicar-ambiente-de-desenvolvimento-em-nova-maquina]] — guia completo de onboarding de máquina nova que depende diretamente desta decisão.
- [[../../_Compartilhado/POPs_Processos/topologia-git-repositorios-e-branches|topologia-git-repositorios-e-branches]] — convenção de branch/commit por repositório, atualizada com a reversão desta decisão.
- `dev-obsidian/CLAUDE.md` → "Regra de Segurança do Cofre" — por que nenhum valor real de segredo entrou em nenhum desses commits, e por que não entra nesta nota.
