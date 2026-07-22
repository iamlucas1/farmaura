# _Compartilhado

Biblioteca de conteúdo genérico e reutilizável, sem vínculo a nenhum projeto deste cofre. Serve para o usuário copiar manualmente (arquivo ou pasta) para outro repositório ou vault quando começar/mantiver outro projeto — a IA não grava fora deste repositório automaticamente, então a cópia em si é sempre uma ação manual do usuário.

## Subpastas

- **`Skills/`** — biblioteca canônica de skills genéricas e reutilizáveis. Para cada skill, o arquivo `<skill-name>.md` serve à leitura humana e `<skill-name>/SKILL.md` é a definição operacional lida por agentes. Não é uma chave de projeto porque não é código de nenhum produto.
- **`Agentes/`** — definições/prompts de agentes genéricos, não amarrados a um domínio de produto.
- **`Prompts/`** — biblioteca canônica de prompts reutilizáveis. Para cada prompt, `<prompt-name>.md` é a nota humana e `<prompt-name>/PROMPT.md` é a instrução operacional para agentes, executada quando o prompt for aplicável ou explicitamente solicitado.
- **`Padroes_Politicas/`** — padrões técnicos e políticas genéricas aplicáveis a qualquer projeto novo (ex: baseline de segurança, convenções de commit, política de dependências).
- **`POPs_Processos/`** — procedimentos operacionais e templates de processo genéricos (ex: como abrir um ADR, POP de resposta a incidente, checklist de onboarding de projeto novo).

## Quando algo vira compartilhado

Se um padrão, prompt, skill ou processo nasceu num projeto (`<projeto>/03_Padroes_Politicas/`, etc.) mas se mostrou genérico o suficiente para outros contextos, mover para a subpasta correspondente aqui e deixar um link no lugar de origem, em vez de manter as duas cópias divergindo.

## Exemplos já generalizados a partir de um projeto

- [[Padroes_Politicas/padrao-rls-multitenant-via-session-guc]] — generalizado a partir de implementações independentes no Farmaura e no lumos-api.
- [[Padroes_Politicas/padrao-autenticacao-webhook-segredo-e-ip-allowlist]] — idem, a partir dos webhooks Asaas de ambos os produtos.
- [[Padroes_Politicas/padrao-supply-chain-multi-stack]] — travamento de versão (npm, Composer, uv, Docker) para todas as stacks, incluindo `lumosmed`/`lumos-api`, que não têm `claude.md`/`agent.md` próprio.
- [[Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste]] — ataques comuns a defender (SQLi, XSS, CSRF, DDoS, brute force, race condition), controles defensivos obrigatórios (CAPTCHA, MFA, mensagem genérica, aviso anti-phishing) e limites seguros de teste.
- [[POPs_Processos/resposta-a-chave-tls-exposta-em-git]] — generalizado a partir de um incidente real no `lumos-gateway`.
- [[Skills/Hub|Skills/Hub]] — skills de segurança do Claude Code aplicadas a todas as stacks do repositório, incluindo as de teste (vulnerabilidade, QA funcional, orientação de projeto/docker).
- [[Prompts/prompt-varredura-vulnerabilidades]], [[Prompts/prompt-qa-funcional]], [[Prompts/prompt-teste-geral-feature]] — prompts prontos que invocam as skills de teste acima.
