# 2026-07-20 — Política de senha forte no cadastro e reset

## Contexto

Mesma revisão de segurança que motivou [[2026-07-20-rate-limit-e-bloqueio-exponencial]]. Antes desta decisão, os únicos requisitos de senha eram `min_length=8, max_length=128` (Pydantic `Field`) em `LoginRequest`, `CompletePasswordResetRequest.new_password` e `PortalRegisterRequest.password` — nenhuma exigência de variedade de caractere, então `"aaaaaaaa"` era uma senha válida.

## Decisão

Toda senha **escolhida por um humano** (cadastro em `/auth/register`, definição de nova senha em `/auth/complete-first-access`) passa a exigir, além do tamanho mínimo já existente: letra minúscula, letra maiúscula, número e caractere especial. Implementado como `is_strong_password()` em `app/domain/validators.py`, aplicado via `field_validator` do Pydantic nos dois schemas (`CompletePasswordResetRequest.new_password`, `PortalRegisterRequest.password`).

**Não aplicado a:**
- `LoginRequest.password` — validar força no login quebraria contas antigas que nunca tiveram a senha trocada; a checagem de força só faz sentido no momento em que a senha é *definida*, não a cada uso.
- Senha temporária gerada pelo sistema (`generate_temporary_password()`, usada no fluxo de primeiro acesso via PDV) — 12 caracteres aleatórios de um alfabeto de 62 já carregam mais entropia (~71 bits) que qualquer senha memorizável por humano; e o usuário é obrigado a trocá-la no próximo login (`must_change_password=True`), momento em que a nova senha *escolhida por ele* já passa pela validação.

## Consequências

- Mensagem de erro em português explicando o requisito, devolvida como `422` pelo Pydantic.
- Skill `secure-auth-rbac-jwt` atualizada com este controle como obrigatório para qualquer stack nova.
- Testado manualmente: senha sem maiúscula/especial rejeitada com 422; senha completa (`Senha@Forte1`) aceita.

## Ver também

- [[2026-07-20-rate-limit-e-bloqueio-exponencial]] — decisão irmã, mesma revisão.
- [[../04_Seguranca_Riscos/2026-07-20-revisao-acesso-anonimo|Revisão de acesso anônimo (2026-07-20)]].
- [[../../_Compartilhado/Skills/secure-auth-rbac-jwt]].
