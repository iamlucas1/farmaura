# Hidratação de settings no console interno pode sobrescrever edição em andamento

Telas de configuração do console interno que hidratam estado local a partir de
`GET /portal/internal/bootstrap` — `Banner da vitrine` (`homeBanner`), e pelo mesmo padrão
`Precificador` (`marketplace`/taxas), desconto do PDV, CNAE, e áreas/preço de entrega — usam um
`useEffect` com dependências `[user, storeIdOverride]` em `internal-app.jsx` que refaz o fetch e chama
`setXState(response)` **incondicionalmente**, sem checar se o usuário já alterou o estado localmente
nesse meio tempo.

Se esse efeito refizer o fetch e a resposta chegar depois que o admin já começou a editar — por exemplo,
se `user` ganhar uma nova referência de objeto (mesmo com os mesmos dados) pouco depois do login, ou a
troca de loja no seletor de `ADMIN` disparar o efeito de novo — a resposta do bootstrap sobrescreve
qualquer edição feita nesse intervalo, silenciosamente, sem nenhum aviso ao usuário.

**Como foi encontrado**: teste automatizado (Playwright) clicando no modo "Imagens" da tela Banner da
vitrine imediatamente após o shell interno montar — a seleção de modo era revertida para o valor
persistido (`off`) alguns instantes depois, mesmo sem nenhuma navegação ou reload visível. Esperar ~2,5s
antes de interagir evitava o problema, confirmando que é uma corrida entre o clique do usuário e a
resolução tardia do fetch de bootstrap.

## Possíveis correções (não avaliadas em profundidade)

- Só sobrescrever o estado local se ele ainda não tiver sido tocado pelo usuário (flag "dirty" por tela).
- Mesclar em vez de substituir (`setXState((prev) => ({...prev, ...response}))`) — reduz o problema mas
  não elimina (ainda perde edições em campos que a resposta também traz).
- Investigar por que `user` muda de referência após o login (memoizar/estabilizar) para reduzir a chance
  do efeito refirar sem uma ação real do admin.

## Ver também

- [[../00_Decisoes/2026-07-31-banner-import-em-lote-e-slides-mistos-imagem-html|ADR onde foi encontrado]].
