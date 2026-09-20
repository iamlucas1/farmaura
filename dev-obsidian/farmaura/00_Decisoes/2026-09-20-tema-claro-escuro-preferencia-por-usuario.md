---
cssclasses: ia-nota
---

# 2026-09-20 — Tema claro/escuro do console interno: escolha por usuário, gravada na conta

## Contexto

O `internal.css` já tinha os tokens dos dois temas (claro e escuro), mas a única forma de ativar o escuro era a configuração do sistema operacional (`prefers-color-scheme`) — nenhuma tela deixava a pessoa escolher, e nada no JS jamais definia `data-theme`. Pedido do usuário: um seletor dentro das configurações do console interno, e — em seguida, na mesma conversa — que a escolha seja **de cada usuário**, salva e mantida como preferência dele.

## Alternativas consideradas

- **`localStorage` do navegador** — descartada pelo próprio pedido ("preferência do usuário"): valeria por navegador/dispositivo, não por pessoa, e se perderia ao limpar dados do navegador ou trocar de máquina.
- **Seletor na tela "Configurações" (fiscal)** — descartada: essa rota (`settings`) só existe para `admin` em `INTERNAL_ROUTE_ACCESS` (`shared/access-control.js`); gerente, farmacêutico, caixa e entregador nunca a alcançariam, e a tela guarda dados fiscais da farmácia (por loja/tenant), não preferências pessoais.
- **Coluna dedicada `users.ui_theme`** (escolhida) em vez de um JSON genérico de preferências — só existe uma preferência hoje; um JSON aberto exigiria validação própria e esconderia o contrato. Uma segunda preferência vira uma segunda coluna (ou a decisão de migrar para JSON, num ADR novo).

## Decisão

- **Backend:** `users.ui_theme` (`String(16)`, `NOT NULL`, check `auto|light|dark`, backfill `auto`), enum `UiTheme` em `domain/enums.py`. `GET /auth/session` passou a devolver `ui_theme` (já é o endpoint que o console chama ao restaurar sessão e depois de cada login, então nenhuma chamada extra). Novo `PATCH /auth/preferences` (`{ "ui_theme": "auto|light|dark" }`), exigindo portal interno (`require_internal_subject()`), sempre gravando na conta do **próprio** token — o corpo não carrega id de usuário, e `StrictModel` rejeita campos extras (role, scope, tenant). A RLS de `users` já permite `id = current_user_id()` no `UPDATE`.
- **Frontend:** seletor "Aparência" (Automático / Claro / Escuro) na aba **Preferências** de "Minha conta" (menu do usuário na barra lateral) — a única tela de preferências pessoais que todos os papéis internos alcançam. `internal-theme.js` aplica o valor em `data-theme` na raiz do documento (sem atributo = segue o sistema). Aplicação é otimista: o tema muda na hora e é revertido, com aviso, se o `PATCH` falhar.
- **Logout/login:** ao não haver sessão, o tema volta para `auto`, para quem entrar depois num computador compartilhado (balcão/PDV) não herdar a escolha de quem saiu.
- **Correção junto:** as cores das faixas de fidelidade (Diamante/Ouro/Prata/Bronze) em `internal.css` usavam `:root:not([data-theme="light"])` **sem** `@media (prefers-color-scheme: dark)`, então no modo "sem atributo" pegavam as cores escuras mesmo com o sistema claro — invisível enquanto ninguém podia escolher "automático" explicitamente. Agora só valem em `dark` forçado ou automático com sistema escuro.

## Consequências

- **Migration obrigatória antes de subir o backend novo em produção** (`20260920_01_user_ui_theme`): o `SELECT` do modelo `User` passa a incluir `ui_theme`, então sem a coluna **todo login falha** (inclusive de clientes do marketplace). Registrado em [[../06_Pendencias/aplicar-migration-user-ui-theme-em-producao|a pendência]]; a IA gera e testa, não aplica em produção sem confirmação.
- O tema só existe no console interno; o marketplace continua só claro (sem paleta escura) — fora do escopo pedido.
- Há um instante em que a página pode abrir no tema do sistema antes de `/auth/session` responder (a restauração de sessão é assíncrona); depois disso o tema salvo é aplicado. Trocar para um cache local só para evitar esse instante reintroduziria o problema de "preferência por navegador" — não feito.
- Testes: contrato do schema (valores aceitos, rejeição de valor fora da lista/campos extras/payload vazio), constraint do modelo e testes de API de autorização (sem token → 401, cliente do marketplace → 403, valor inválido e overposting → 422). **Não** há teste com banco real do `PATCH` gravando e do `GET /auth/session` relendo — a suíte atual não tem fixtures de banco (ver `test_two_factor.py`).

## Ver também

- [[../02_Documentacao/Modulo_Auth|Modulo_Auth]] — tabela `users` e endpoints de auth.
- [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]] — tokens do tema escuro do console interno.
- [[../06_Pendencias/aplicar-migration-user-ui-theme-em-producao|Aplicar migration `20260920_01` em produção]]
- [[../06_Pendencias/preferencias-da-conta-com-controles-sem-efeito|Controles sem efeito na aba Preferências]]
