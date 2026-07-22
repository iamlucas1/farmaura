# 2026-03-22 — Adotar Laravel como BFF, navegador nunca fala direto com a API Python

## Contexto

O domínio de negócio do LumosMed (agenda, pacientes, faturamento, etc.) vive num serviço Python separado (`lumos-api`). Era preciso decidir como o frontend do LumosMed acessaria esses dados.

## Alternativas consideradas

- **Frontend consome `lumos-api` diretamente (SPA pura)** — descartado; exigiria expor a API Python diretamente ao navegador e replicar ali toda a lógica de sessão/autenticação.
- **Laravel como BFF (Backend For Frontend)** — adotado.

## Decisão

`lumosmed/` (Laravel) renderiza o site público e atua como BFF: todas as rotas autenticadas do portal (`/app/*`) fazem proxy para `lumos-api` através do Laravel. O token de acesso fica **inteiramente no lado do servidor** (sessão Laravel), nunca exposto ao JavaScript do navegador. Commit `e0726a0` ("Adicionando BFF e integração com API").

## Consequências

- Cada área funcional do portal (agenda, pacientes, usuários, WhatsApp, configurações da clínica, IA, faturamento) tem um controller Laravel espelhando 1:1 um módulo de rota Python (`domains/lumosmed/api/routes/`) — ver [[../Hub|Hub]].
- Centraliza toda chamada HTTP para `lumos-api` num único client (`app/Services/LumosApi/LumosApiClient.php`), o que possibilitou a decisão seguinte de autenticação interna assinada ([[2026-03-27-autenticacao-interna-rs256-assinada]]).
- O Laravel revalida pouco por conta própria — o próprio middleware de sessão nota que a revogação de token continua sendo checada pela API Python a cada request protegido (defesa em profundidade, sessão Laravel não é o único gate).

## Ver também

- [[padrao-bff-validacao-minima-laravel]] — convenção de validação que decorre desta arquitetura BFF.
- [[padrao-nova-pagina-portal-autenticado]] — como toda nova rota autenticada segue este mesmo padrão.
- [[Lumos_Api_Cliente_Interno]] — contrato completo do client centralizado citado aqui.
