---
cssclasses: ia-nota
---

# "Minha conta" do console interno: controles que não fazem nada

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-20

## Descrição

O modal "Minha conta" (`AccountModal`, `farmaura/react/internal/core/internal-shell.jsx`) tem controles sem efeito real, herdados do protótipo "Farmaura Operações":

- **Preferências:** os quatro interruptores de notificação (novos pedidos, receita pendente, estoque baixo, resumo diário) têm `onChange={() => {}}` e valores fixos — não gravam nada nem disparam nenhuma notificação. Só o seletor **Aparência** (tema) é real (ver [[../00_Decisoes/2026-09-20-tema-claro-escuro-preferencia-por-usuario|ADR]]).
- **Perfil:** os campos Nome/E-mail/CRF são `defaultValue` sem handler — editar não salva, e o botão do rodapé "Salvar alterações" só fecha o modal.
- **Segurança:** o campo de senha mostra um valor fixo (`••••••••••`) e não tem fluxo de troca.

## Contexto

Encontrado ao adicionar o seletor de tema nesta aba. Fora do escopo do pedido, então não mexi. Resolver: ou ligar cada controle a um endpoint real (o `PATCH /auth/preferences` já existe e é o lugar natural para as preferências de notificação), ou removê-los — o modal hoje sugere ao usuário que salvou algo que não foi salvo. Ver também [[padronizar-estados-loading-vazio-erro-acessibilidade]].
