---
cssclasses: ia-nota
---

# 2026-08-30 — Chat com farmacêutico: substitui "Receita digital", ganha guarda anti-spam, vínculo a pedido e congelamento automático

## Contexto

"Receita digital" era uma tela isolada no marketplace, com upload de arquivo tratado **só localmente** (sem chamada real de backend — ver antiga `PrescriptionScreen`, removida). O usuário pediu para dobrar essa funcionalidade inteira dentro do chat com o farmacêutico: um botão lateral flutuante que, para quem não está logado, vai direto para o WhatsApp (com mensagem pré-preenchida), e para quem está logado abre o chat real — com upload de receita tratado como um anexo de mensagem, validado de verdade no backend (sniffing de magic bytes, não só extensão/Content-Type).

Isso expôs superfície nova de abuso (qualquer cliente logado podia mandar mensagens sem limite nenhum) e uma lacuna de escopo: chat vinculado a pedido existia como conceito no schema (`chat_threads.order_id`) mas nunca era exposto pela rota nem tinha regra de encerramento quando o pedido terminava.

Numa segunda leva, o usuário pediu explicitamente: limite de mensagens por minuto, flag de spam pelo farmacêutico reduzindo ainda mais esse limite, bloqueio com backoff exponencial e bloqueio definitivo, opção de vincular o chat a um pedido específico, congelamento automático da conversa quando o pedido é concluído (entregue/retirado), botão de desbloqueio direto pelo farmacêutico e uma fila de contestação para o cliente recorrer de um bloqueio. Numa terceira leva: separar "todos os chats já abertos" (página nova, link no dropdown de usuário) de "chats ativos nesta sessão" (o botão flutuante, com seletor entre eles).

## Alternativas consideradas

- **WebSocket/SSE para o chat em tempo real** — descartado sem discussão nesta leva; o módulo já era REST puro por decisão anterior (polling manual, sem push), e nada aqui pediu mudar essa base.
- **Rate limit só em Valkey (TTL puro, sem coluna persistida)** — mais simples, mas um bloqueio **definitivo** não pode depender de uma chave com TTL/cache que pode ser limpa (restart, flush, falha de conexão) — inaceitável para a garantia mais forte pedida ("bloqueio definitivo"). Descartado.
- **Rate limit só em Postgres (sem Valkey)** — plausível, mas o codebase já tem o padrão de janela fixa em Valkey para outros limites (`app/core/rate_limit.py`, `AUTH_RATE_LIMIT` etc.) e reaproveitar o mesmo mecanismo para "quantas mensagens neste minuto" evita reinventar contagem de janela em SQL.
- **Um único endpoint de desbloqueio (só pelo farmacêutico, sem fila de contestação)** — foi o pedido inicial do usuário, mas ele mesmo pediu depois, no mesmo fio, também a fila de contestação do cliente — os dois caminhos coexistem (ver "Decisão").
- **Página de histórico completo reaproveitando a modal já existente (`PharmacistChatModal`)** — descartado a pedido explícito do usuário ("crie uma página"); a modal continua existindo para quem chega por outros pontos de entrada (não foi removida), mas deixou de ser o único destino de "ver tudo".

## Decisão

- **Guarda de spam em duas camadas** (`app/core/chat_guard.py`): janela de mensagens por minuto em Valkey (efêmera, mesmo padrão de `rate_limit.py`/`login_guard.py`), e o **estado que realmente importa** (nível de violação, bloqueio temporário, bloqueio definitivo, flag de spam) como colunas em `customers` — sobrevive a restart, é visível para o farmacêutico e é seedável para teste. Limite normal: 5 msgs/min; com flag de spam: 2 msgs/min. Violação escalona 1min → 5min → 15min → 60min → **definitivo** na 5ª. Uma violação só é contada na *primeira* mensagem que estoura o limite depois do último desbloqueio — reenviar durante um bloqueio já ativo não escala mais.
- **Commit síncrono no meio do guard, antes de lançar o 429**: se a violação for registrada mas a request falhar (como deveria), o estado teria sido perdido no rollback implícito do fim de request sem commit — por isso `check_and_register_customer_message` faz seu próprio `session.commit()` antes de levantar a exceção, garantindo que o bloqueio persista mesmo numa chamada que "falha".
- **Vínculo a pedido reaproveita `ChatService.ensure_customer_thread(order_id=...)`**, que já existia mas não estava exposto pela rota `POST /chat/customer/threads` — só precisou de um schema novo (`ChatEnsureThreadRequest`) e repassar o campo.
- **Congelamento automático em vez de status manual**: `chat_threads.thread_status`/`closed_reason` (colunas que já existiam mas nunca eram usadas de fato) passam a ser setadas por `ChatRepository.close_threads_for_order`, chamado nos dois pontos reais de "pedido concluído" (`delivery_service.py` na entrega, `order_service.py::confirm_internal_pickup` na retirada — não existe status "retirado" próprio, é `DISPATCHED` + `completed_at_label='Retirado'`). Aplicado nos dois sentidos (cliente e farmacêutico) — uma thread fechada não aceita mensagem de nenhum lado.
- **Dois caminhos de desbloqueio coexistindo**: override direto do farmacêutico (`POST /chat/threads/{id}/unblock`, zera tudo na hora) e fila de contestação do cliente (`chat_unblock_requests`, nova tabela — pedido único pendente por vez, farmacêutico aceita/nega vendo as últimas mensagens do cliente e o total histórico de contestações dele, pra flagrar quem abusa da própria fila).
- **RLS real em `chat_unblock_requests`** desde o início — reaproveita a mesma função `can_access_chat_thread_row(customer_id, pharmacist_user_id)` já usada por `chat_threads`, passando `NULL` no segundo parâmetro (não há "farmacêutico designado" pra uma contestação, mas qualquer staff do tenant já passa pela cláusula de role).
- **Botão flutuante = só sessão, página nova = tudo**: `sessionChatThreadIds` (estado React, resetado a cada carregamento de página) registra toda thread tocada nesta visita, e o widget filtra por ele; quando há mais de uma, vira um seletor no cabeçalho do painel. A página nova (`/chats`, link em "Falar com farmacêutico" no dropdown de usuário) sempre mostra `chatThreads` inteiro (bootstrap do login), com o mesmo picker de "vincular a pedido" da aba antiga de conversas — que continua existindo, sem redirecionamento forçado para a página nova.

## Consequências

- Migration nova (`20260830_01`) ainda **não aplicada em produção** — ver [[../06_Pendencias/migration-chat-spam-guard-pendente-em-producao|pendência registrada]].
- O achado de RLS pós-commit já documentado em [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|rls-pos-commit-quatro-servicos-nao-corrigidos]] foi corrigido para os 3 métodos de `ChatService` como parte deste trabalho — nota atualizada.
- `[[../02_Documentacao/Modulo_Chat|Modulo_Chat]]` reescrito para refletir o estado novo — várias afirmações antigas (ex.: "`thread_status` nunca transiciona") ficaram falsas e foram corrigidas.
- Números de limite/backoff (5/min, 2/min, 1-5-15-60min, 5ª violação = definitivo) são constantes de código sem correspondência com nenhum requisito formal do negócio — ajustáveis, mas qualquer mudança deve vir acompanhada de atualização desta nota e do módulo.
- A modal de nudge "complete seu cadastro" (pré-existente, não relacionada a este trabalho) reabre em vários pontos de navegação e atrapalhou a verificação em browser real várias vezes — não é bug deste trabalho, não foi tratada.

## Ver também

- [[../02_Documentacao/Modulo_Chat|Módulo Chat]]
- [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|RLS pós-commit — 4 serviços]]
- [[../06_Pendencias/migration-chat-spam-guard-pendente-em-producao|Migration pendente em produção]]