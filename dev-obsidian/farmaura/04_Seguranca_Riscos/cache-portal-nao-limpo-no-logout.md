# Logout não limpa o cache de portal (`FA_PORTAL_CACHE`) — PII de vendas PDV, chat e dado financeiro seguem no `localStorage`

**Tipo:** Vulnerabilidade (exposição de dado residual em dispositivo compartilhado)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** `farmaura`
**Categoria:** Gestão de sessão / dados sensíveis em cliente
**Data de identificação:** 2026-08-19

## Descrição

`onLogout` (console interno) e `logout` (marketplace) chamam corretamente `authClient.logout()`, que limpa **apenas** as chaves de autenticação (`<namespace>_auth_local`/`<namespace>_auth_session`). Nenhum dos dois limpa `FA_PORTAL_CACHE` — as chaves `fa:<portal>:<tenant>:<userId>:*` escritas ao longo da sessão permanecem no `localStorage` indefinidamente após o logout. Essas chaves incluem: histórico de vendas do PDV com nome/CPF/telefone de clientes (`pdv_sales`), carrinho e itens recentes do marketplace, **threads de chat** (potencialmente descrevendo sintomas/receitas), e o payload financeiro completo do bootstrap (ver [[bootstrap-vaza-dados-financeiros-para-cliente-e-caixa]]).

## Evidência

`farmaura/react/internal/core/internal-app.jsx:4189-4196` (`onLogout`) e `farmaura/react/marketplace/core/marketplace-app.jsx:1595-1603` (`logout`) — nenhum dos dois chama `FA_PORTAL_CACHE.removeLocal`/`removeSession` para as chaves do usuário que está saindo.

## Cenário de risco

Em terminais de PDV compartilhados (farmácia com turnos de caixas/farmacêuticos revezando o mesmo computador — cenário operacional comum e real), o histórico de vendas (nome/CPF/telefone de clientes) e dados financeiros do turno anterior continuam recuperáveis via DevTools mesmo depois do funcionário fazer logout. No marketplace, o histórico de chat de um cliente (que pode conter descrição de sintomas/receitas) fica em `localStorage` de um dispositivo compartilhado/público após logout.

## Impacto

Exposição de PII de cliente (nome, CPF, telefone) e potencialmente dado de saúde (conteúdo de chat) a qualquer pessoa com acesso físico/DevTools ao mesmo navegador depois que o usuário legítimo já saiu — relevante especificamente em terminais de PDV multiusuário.

## Pré-condições

Acesso físico (ou de DevTools) ao mesmo navegador/dispositivo depois de um logout — cenário mais provável em PDV de farmácia com múltiplos operadores no mesmo terminal.

## Escopo afetado

`farmaura/react/internal/core/internal-app.jsx` (`onLogout`), `farmaura/react/marketplace/core/marketplace-app.jsx` (`logout`), módulo `FA_PORTAL_CACHE` (formação de chave via `buildScope`/`buildKey`).

## Causa raiz

O fluxo de logout foi implementado só pensando em invalidar a autenticação (token), não em limpar o cache de dado de negócio acumulado durante a sessão — são dois mecanismos de armazenamento separados (`auth_*` vs `fa:*`) e só o primeiro foi coberto.

## Correção sugerida para análise futura

Adicionar, em ambos os fluxos de logout, uma limpeza de todas as chaves `fa:<portal>:<tenant>:<userId>:*` do usuário que está saindo — a função `buildScope`/`buildKey` já centraliza a formação da chave, então um método `FA_PORTAL_CACHE.clearAllFor(portal, actor)` seria direto de implementar.

## Dependências da correção

Nenhuma. Mudança de frontend, sem dependência de backend.

## Riscos de regressão

Baixo — limpar cache no logout não deveria quebrar nenhum fluxo (o próximo login já re-hidrata o cache do zero).

## Como validar futuramente que a correção funcionou

Fazer login, gerar alguma atividade que popule `FA_PORTAL_CACHE` (venda no PDV, mensagem de chat), fazer logout, e confirmar via DevTools que as chaves `fa:*` daquele usuário não estão mais presentes no `localStorage`.

## Referências

- [[bootstrap-vaza-dados-financeiros-para-cliente-e-caixa]] — o payload financeiro que também fica exposto por este achado.

## Atualizações

- 2026-08-19: achado registrado.
