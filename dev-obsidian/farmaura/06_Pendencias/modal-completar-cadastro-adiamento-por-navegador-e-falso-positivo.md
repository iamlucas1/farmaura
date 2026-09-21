---
cssclasses: ia-nota
---

# Modal "completar cadastro": adiamento só por navegador e possível falso positivo durante o carregamento

**Status:** Resolvido em 2026-09-20
**Prioridade:** Baixa
**Registrado em:** 2026-09-20

## Descrição

Dois limites conhecidos de `ProfileCompletionNudge` (`account-profile-screen.jsx`), deixados como estavam ao redesenhar a modal ([[../00_Decisoes/2026-09-20-modal-completar-cadastro-enxuta-com-progresso|ADR]]):

1. **O adiamento de 14 dias vive no `localStorage` do navegador**, sem o id do cliente na chave (`farmaura_profile_nudge_dismissed_at`): trocar de navegador/aparelho, limpar dados do site ou entrar em janela anônima faz a modal voltar, e duas pessoas no mesmo navegador dividem o mesmo prazo. O certo é guardar na conta (coluna no cliente + endpoint, com migration).
2. **Falso positivo enquanto o perfil carrega.** `customerProfile` começa como um objeto vazio (gênero/estado civil/filhos em branco) e `addresses` como `[]`; o efeito espera 1,5 s depois do login e depois decide. Numa conexão lenta (bootstrap > 1,5 s) um cliente com cadastro completo pode ver a modal — agora com as quatro pílulas "pendentes", o que é mais visível que antes. Correção: um sinal explícito de "perfil carregado" no contexto do marketplace em vez do atraso fixo.

## Resolução

Resolvida no mesmo dia, a pedido do usuário, por [[../00_Decisoes/2026-09-20-modal-completar-cadastro-estado-no-servidor|esta decisão]]: o adiamento passou a ser a coluna `customers.profile_nudge_dismissed_at` e o veredito ("mostrar?" + campos faltantes) é calculado pelo servidor e devolvido em `GET /customers/me`. O item 1 (adiamento por navegador) deixa de existir; o item 2 (falso positivo durante o carregamento) some porque o navegador não decide mais nada. Depende da migration pendente em [[aplicar-migration-profile-nudge-em-producao|produção]].

## Contexto

Ficou de fora por ser mudança de comportamento/dados (o pedido era só reformular a modal): o item 1 exige coluna nova + migration em produção; o item 2 mexe no carregamento do `marketplace-app.jsx`. Nenhum bloqueia o uso.
