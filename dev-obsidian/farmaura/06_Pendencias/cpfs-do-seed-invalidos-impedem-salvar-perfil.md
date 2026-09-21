---
cssclasses: ia-nota
---

# CPFs do seed são inválidos: em contas de teste, salvar perfil (e o consentimento da modal) falha

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-20

## Descrição

Nenhum dos 30 clientes do seed com CPF (`scripts/seed.py`) tem um CPF que passe em `is_valid_cpf` (conferido com o mesmo validador do backend). `PUT /customers/me/profile` valida o CPF e responde `422 "CPF inválido."` quando ele vem do banco tal como está, então numa conta de teste:

- **"Completar meu cadastro"** (modal do marketplace) não consegue gravar o aceite de "Promoções e ofertas personalizadas" — o erro é engolido de propósito (o fluxo segue para a tela de perfil) e o console mostra um 422;
- **Salvar** na tela Meu perfil só funciona se quem testa digitar um CPF válido.

Não afeta clientes reais (o CPF deles é validado ao cadastrar). Ao testar o consentimento com uma conta do seed, usar um CPF válido (o mesmo que a tela de perfil aceita) ou corrigir o seed para gerar CPFs com dígitos verificadores corretos, mantendo o determinismo.

## Contexto

Descoberto ao testar de ponta a ponta a modal "completar cadastro" ([[../00_Decisoes/2026-09-20-modal-completar-cadastro-estado-no-servidor|ADR]]). Não corrigido: mexer no seed muda dados que outras notas e testes manuais assumem, e a decisão de como gerar CPFs de teste (válidos porém fictícios) é do time.
