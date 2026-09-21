---
cssclasses: ia-nota
---

# Conta criada só via Google não tem como ganhar uma senha própria depois

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-21

## Descrição

Uma conta criada via `POST /auth/login/google` sem e-mail pré-existente nasce com `users.has_password=false` (senha aleatória inutilizável, nunca exposta). Hoje não existe nenhum endpoint de "definir minha senha" para essa pessoa passar a também entrar por e-mail/senha — e o botão "Alterar senha" em Configurações → Segurança (`account-profile-screen.jsx`, `AccountSettings`) é **decorativo**: só alterna um estado local (`setSavedPass`) e mostra "Senha atualizada" por 2,2s, sem nenhuma chamada à API. Consequência prática: enquanto `has_password=false`, `unlink_google_account` também fica bloqueado (409) — a pessoa nunca consegue se desvincular do Google, porque perderia acesso à própria conta.

## Contexto

Descoberto ao implementar o vínculo de conta Google no marketplace (ver [[../00_Decisoes/2026-09-21-login-google-marketplace-id-token-flow|ADR]]) — não corrigido porque não foi pedido (o pedido era vincular Google a uma conta que **já** tem senha, não o inverso) e envolveria dois fluxos novos (endpoint de troca de senha autenticada para o marketplace, que também não existe hoje para nenhuma conta; e a conexão do botão já existente na tela a ele). Resolver isso destravaria tanto essa pendência quanto o botão hoje decorativo.
