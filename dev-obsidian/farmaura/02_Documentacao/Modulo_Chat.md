# Módulo Chat

## O que é

Canal de mensagens texto entre cliente e farmacêutico (nunca cliente↔cliente, nem IA↔cliente — o módulo de IA do sistema é só para análise de estoque, [[../05_Integracoes_Infra/IA_Gemini_OpenAI|IA_Gemini_OpenAI]], sem relação com chat). REST puro, **sem WebSocket/SSE** em todo o backend. Também funciona como canal de notificação de outros domínios (ex.: solicitação de validação de receita a partir do PDV) e, desde 2026-08-30, é o único caminho de "receita digital" do marketplace — a antiga tela isolada de upload foi removida, upload de receita agora é um anexo de mensagem.

Para quem não está logado, o botão "Falar com farmacêutico" nunca abre o chat — vai direto para um link do WhatsApp (`https://wa.me/5561996032094`) com mensagem pré-preenchida. O chat de verdade só existe para cliente autenticado.

## Tabelas / Models

- **`chat_threads`** — `order_id` opcional (vínculo com um pedido específico, exposto pela rota desde 2026-08-30), `customer_id`, `pharmacist_user_id` (resolvido automaticamente, ver regras), `thread_status` (`open`/`closed` — **transiciona de verdade agora**, ver "Congelamento automático"), `closed_reason` (coluna nova, hoje só usa o valor `order_completed`), snapshots de nome/pedido, `last_message_preview`/`last_message_at_label`, `customer_unread_count`/`pharmacist_unread_count` (contadores, não derivados das mensagens), `is_active` (soft-delete).
- **`chat_messages`** — `sender_user_id` **xor** `sender_customer_id`, `message_type` (`text` ou `prescription_request`), `sent_at_label` (sempre a string `"agora"` — não é timestamp real, embora `created_at` exista e seja usado para ordenação), `customer_read`/`pharmacist_read` (setados na criação mas **nunca lidos/consultados** depois — dado morto), `is_internal_note` (sempre `False` — RLS já suporta ocultar notas internas do cliente, mas nenhum service cria uma).
- **`chat_message_attachments`** — em uso desde 2026-08-30: todo upload de receita digital pelo chat cria um `FileAsset` + `PrescriptionFile` (entra na fila de revisão normal do farmacêutico) + esta linha de anexo, ligando a mensagem ao arquivo. Download sempre via `/uploads/{file_id}` (auth obrigatória, checada de novo no servidor — nunca link direto).
- **`customers`** (colunas de guarda anti-spam, adicionadas 2026-08-30) — `chat_flagged_spam` (bool, setado pelo farmacêutico), `chat_violation_count` (int, 0 a 4 = temporário, 5+ = definitivo), `chat_blocked_until` (timestamp, null = não bloqueado agora), `chat_permanently_blocked` (bool). Ver "Guarda anti-spam" abaixo.
- **`chat_unblock_requests`** (tabela nova, 2026-08-30) — contestação do cliente contra um bloqueio ativo: `customer_id`, `thread_id` (de onde partiu, nullable), `status` (`pending`/`approved`/`denied`), `customer_message`, `violation_count_snapshot`/`permanently_blocked_snapshot` (estado do bloqueio no momento do pedido, não recalculado depois), `decided_by_user_id`/`decided_at`/`pharmacist_notes`.
- RLS: `can_access_chat_thread_row(customer_id, pharmacist_user_id)` — dono (customer), farmacêutico atribuído, ou qualquer role admin/manager/pharmacist vê tudo do tenant. `chat_messages`/`chat_message_attachments` reaplicam a mesma regra por `EXISTS`, mais a cláusula que esconde `is_internal_note=true` de quem não é staff. `chat_unblock_requests` reaproveita a mesma função passando `NULL` no segundo parâmetro (não há "farmacêutico designado" numa contestação — qualquer staff já entra pela cláusula de role).

## Guarda anti-spam (`app/core/chat_guard.py`)

Duas camadas, mesma filosofia de `app/core/login_guard.py`/`rate_limit.py`:

- **Janela de mensagens (Valkey, efêmera)** — `INCR`+`EXPIRE 60s` por `customer_id`. Limite: **5 msgs/min** normal, **2 msgs/min** com `chat_flagged_spam=true`.
- **Violação e bloqueio (Postgres, persistente)** — na primeira mensagem que estoura o limite desde o último desbloqueio, incrementa `chat_violation_count` e aplica bloqueio escalonado: 1min → 5min → 15min → 60min → **definitivo** na 5ª violação. Reenviar durante um bloqueio já ativo não escala mais (só reabrir a janela e estourar de novo depois de desbloqueado é que avança pro próximo nível).
- **Commit síncrono antes de lançar o 429** — se a violação for registrada mas a exceção propagar sem commit explícito, o estado seria perdido (sessão só é fechada, não commitada, no fim de uma request que falhou). Por isso `check_and_register_customer_message` faz seu próprio `session.commit()` do estado de bloqueio antes de levantar `HTTPException(429)`.
- **Dois caminhos de desbloqueio**: override direto do farmacêutico (`POST /chat/threads/{id}/unblock`, zera tudo na hora, sem precisar de pedido do cliente) e fila de contestação (`chat_unblock_requests` — cliente só pode ter um pedido pendente por vez; farmacêutico vê as últimas mensagens do cliente e o total histórico de contestações dele antes de decidir).
- Aplicado em `send_customer_message` e `submit_customer_prescription` — mensagens do farmacêutico não são limitadas.

## Vínculo a pedido e congelamento automático

`ensure_customer_thread(order_id=...)` já existia mas não estava exposto pela rota — desde 2026-08-30, `POST /chat/customer/threads` aceita `{order_id}` (schema `ChatEnsureThreadRequest`) e reaproveita/cria a thread vinculada àquele pedido. Se o pedido já estiver concluído no momento da criação, a thread já nasce `closed`.

**Regra de congelamento**: sempre que um pedido é marcado como transação concluída — `delivery_service.py` (entrega confirmada) ou `order_service.py::confirm_internal_pickup` (retirada confirmada; não existe status "retirado" próprio, é `DISPATCHED` + `completed_at_label='Retirado'`) — `ChatRepository.close_threads_for_order` fecha toda thread `open` ligada àquele `order_id` (`thread_status='closed', closed_reason='order_completed'`). Aplicado nos dois sentidos: nem cliente nem farmacêutico conseguem mandar mensagem numa thread fechada (`ChatService._require_thread_open`, 409).

## Endpoints (REST puro, sem WebSocket)

- Interno: `GET /chat/threads`, `POST /chat/threads/{id}/messages` — `ADMIN, MANAGER, PHARMACIST`.
- Interno (spam/bloqueio): `POST /chat/threads/{id}/flag-spam` (toggle), `POST /chat/threads/{id}/unblock` (override direto), `GET /chat/unblock-requests` (fila de contestação, pendentes primeiro), `POST /chat/unblock-requests/{id}/decision` (`approved`/`denied`).
- Marketplace: `GET /chat/customer/threads`, `POST /chat/customer/threads` (get-or-create, aceita `order_id` opcional), `POST /chat/customer/threads/{id}/messages`, `POST /chat/customer/threads/{id}/prescriptions` (multipart — upload de receita como anexo).
- Marketplace (bloqueio): `POST /chat/customer/unblock-requests` (`{message}` — só se o cliente estiver bloqueado no momento; 409 se já existe pedido pendente).
- Cada `send` re-busca a lista inteira de threads do ator e extrai a alvo — padrão N+1 simples, mas custoso.

## Fluxo — quem conversa com quem

1:1 cliente↔thread (múltiplas threads por cliente — uma por pedido vinculado, mais quantas threads gerais o cliente abrir), sempre com um farmacêutico do tenant. **Resolução automática de farmacêutico**: pega simplesmente o **primeiro** usuário ativo com role `pharmacist` do tenant — sem rodízio, sem balanceamento, sem considerar loja. Entrega continua 100% via REST (sem WebSocket/SSE), mas **os dois lados agora têm polling real** — `GET /chat/customer/threads`/`GET /chat/threads` a cada 4s enquanto logado, adicionado porque a resposta do outro lado só aparecia depois de alguma ação forçar um refetch (trocar de thread, recarregar a página): marketplace em 2026-08-30, console interno em 2026-08-31 (mesmo padrão, `internal-app.jsx`). Correção de uma afirmação anterior desta nota: **o board de pedidos internos não tem polling algum** (o único `setInterval` de todo `react/internal/` é o relógio do PDV) — não existia um "padrão de 4s do board de pedidos" pra reaproveitar; o polling do chat foi construído do zero nos dois lados.

## Regras de negócio não óbvias

- **`thread_status` agora transiciona de verdade** (antes deste trabalho, era `open` sempre e a coluna não tinha efeito nenhum) — uma thread fechada rejeita mensagem com 409 dos dois lados, ver "Congelamento automático".
- **Rótulos de tempo são strings estáticas** (`"agora"`), não timestamps reais exibidos na UI — ordenação real usa `created_at`, mas a UI nunca mostra esse valor.
- **`sendChat` no console interno já não tem mais fallback silencioso** (era um bug real: catch vazio sem `return`, fazia a mensagem aparecer "enviada" no state local mesmo quando a chamada real falhava — corrigido em 2026-08-30, agora mostra toast de erro e não insere a mensagem otimista quando a API rejeita).
- **PDV escreve no chat do cliente sem exigir login**: ao enviar receita digital no balcão, `PrescriptionService` cria/reaproveita thread e posta mensagem de sistema `prescription_request` com o `prescription_id` anexado.
- **Get-or-create duplo e não deduplicado**: `POST /chat/customer/threads` e o create implícito dentro de `send_customer_message` são dois caminhos diferentes de criação, sem dedupe entre eles.
- **"Não lidas" só zera quando o próprio lado envia mensagem** — abrir/selecionar uma thread no frontend zera o contador só localmente no state React; um reload faz o badge voltar.
- **RLS já suporta notas internas ocultas do cliente**, mas a aplicação nunca cria uma — esqueleto pronto, sem UI/serviço.
- **Uma violação de spam só é contada uma vez por ciclo de bloqueio** — uma rajada de 50 mensagens em 1 segundo conta como *uma* violação (o nível 1, bloqueio de 1min), não cinco; só voltar a estourar o limite depois de desbloqueado é que avança o nível.

## Frontend

- **Interno** (`chat-screen.jsx`): inbox lado farmacêutico — lista de threads + painel de conversa; mensagens `prescription_request` renderizam card com botões Validar/Recusar inline, mais botão de anexo (`Ver <nome do arquivo>`, baixa via `authClient.download`). Cabeçalho ganhou botões "Marcar spam"/"Remover spam" e "Desbloquear" (só aparece quando o cliente está bloqueado no momento), badges de status (`Encerrado`/`Bloqueado`/`Bloqueado até HH:MM`/`Spam`) na lista de threads. Nova tela `chat-unblock-requests-screen.jsx` (rota `chat-unblock-requests`, item "Requisições" no menu lateral com badge de pendentes) — master-detail para aceitar/negar contestação, com contexto (mensagens recentes do cliente, total histórico de contestações). Indicador "digitando" e "online" continuam props mortas (nunca populadas pelo backend).
- **Marketplace**: componentes reutilizáveis em `marketplace-care-actions.jsx` (`PharmacistChatPanel`, `PharmacistChatInbox`, `PharmacistChatModal`, `ChatWidget`) — `ChatLoginPrompt` e a antiga `PrescriptionScreen` foram removidos (mortos, sem uso possível desde que logout redireciona pro WhatsApp e upload virou anexo de chat).
  - **Botão flutuante (`ChatWidget`)** — deliberadamente **escopado à sessão do navegador**: `sessionChatThreadIds` registra toda thread tocada nesta visita (via qualquer `openChat`/bubble/picker), e o widget só oferece essas. Com mais de uma, o cabeçalho do painel mini vira um seletor. Visitante deslogado: `<a>` puro pro WhatsApp, nunca renderiza o chat. Persistido em `sessionStorage` (via `FA_PORTAL_CACHE.readSession`/`writeSession`, escopado por cliente) desde 2026-08-30 — sobrevive a um reload da aba, mas some ao fechar a aba/navegador, mantendo a semântica de "sessão".
  - **Abrir a bolha não cria mais uma thread sozinho** (2026-08-31) — sem conversa ativa, mostra um prompt "Iniciar conversa com farmacêutico"; só cria/reaproveita a thread real (e libera o composer pra escrever/anexar) quando esse botão é clicado. O próprio `open` do painel (expandido/minimizado) também passou a ser persistido em `sessionStorage` — um reload com o painel aberto reabre expandido, na mesma conversa, em vez de voltar pra bolha fechada.
  - **Pegadinha de React encontrada nessa mesma leva**: o `useState(() => leSessionStorage(...))` do `open` do painel só roda o inicializador **uma vez, no primeiro mount** — como o widget já monta com `user` ainda `null` (restauração de auth é assíncrona) e nunca remonta quando `user` resolve de verdade, o valor persistido nunca era lido. Precisou de um `useEffect` separado, disparado quando `user.id` fica disponível, pra de fato restaurar o valor — mesmo padrão que já era usado pra `sessionChatThreadIds`/`activeChatThreadId` no componente pai (que não tinha esse bug, só o widget).
  - **Número de referência sempre visível**: toda thread mostra "Pedido {código}" quando vinculada a um pedido, ou "Protocolo {thread_code}" quando não (`thread_code` já existia no model, gerado na criação — `'CHAT-' + uuid4().hex[:8].upper()` — só nunca tinha sido exposto pela API; `ChatThreadResponse.protocol` adicionado em 2026-08-31). Corrige de quebra um bug visual pré-existente: threads gerais mostravam literalmente "Pedido —" (o placeholder do backend pra "sem pedido" sendo tratado como se fosse um código de pedido de verdade).
  - **Página nova `/chats`** (`chat-history-screen.jsx`) — todo o histórico da conta (`chatThreads` inteiro, do bootstrap de login), com o mesmo picker "Dúvida geral"/"Sobre o pedido X" pra começar uma conversa nova vinculada a um pedido elegível (não entregue, não cancelado). Link "Falar com farmacêutico" no dropdown de usuário (`AccountMenu`, `marketplace-chrome.jsx`). A aba "Conversas" dentro de Minha Conta (`account-health-screen.jsx`, `ConversationsInbox`) **continua existindo** com o mesmo conteúdo — não foi removida, só deixou de ser o único destino.
  - Banner de thread congelada e de bloqueio ativo (com botão "Contestar bloqueio" → textarea → `POST /chat/customer/unblock-requests`) vivem em `PharmacistChatPanel`, reaproveitados por todo mundo que o renderiza.
  - Threads cacheadas em `localStorage` só como otimização (não é fonte de verdade).

## Decisões de arquitetura dignas de nota

- **REST stateless + polling manual (não automático)** em vez de WebSocket/SSE — simplicidade deliberada, ao custo de não haver atualização em tempo real.
- **RLS como segunda linha de defesa** por trás da checagem de aplicação — defesa em profundidade explícita, estendida à tabela nova (`chat_unblock_requests`) desde a criação, não como pendência posterior.
- **Guarda anti-spam em duas camadas** (Valkey efêmero pro sinal de alta frequência, Postgres persistido pra consequência que importa) — mesma filosofia de `login_guard.py`, ver [[../00_Decisoes/2026-08-30-chat-farmaceutico-anti-spam-vinculo-pedido-e-congelamento|ADR completo]].
- **Snapshots desnormalizados agressivos** — mesma filosofia de histórico imutável vista em outros domínios.
- **Chat usado como canal de notificação de outros domínios** (Prescrição/PDV), não só chat ponto-a-ponto — mistura `message_type="text"` humano com eventos de sistema no mesmo model.
- **Mensagens são append-only por design** — sem edição/exclusão/versionamento, comentado explicitamente no código.
- **Botão flutuante ≠ página de histórico, por escolha deliberada** — não é limitação técnica, é a separação pedida explicitamente entre "o que estou fazendo agora" (sessão) e "tudo que já conversei" (conta).

## Ver também

- [[../00_Decisoes/2026-08-30-chat-farmaceutico-anti-spam-vinculo-pedido-e-congelamento|ADR — Chat: anti-spam, vínculo a pedido, congelamento]]
- [[../04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos|RLS pós-commit — 4 serviços (Chat corrigido)]]
- [[../06_Pendencias/migration-chat-spam-guard-pendente-em-producao|Migration da guarda anti-spam pendente em produção]]
- [[Modulo_Prescricoes|Módulo Prescrições]] — origem da mensagem `prescription_request` a partir do PDV, e destino da receita enviada pelo chat.
- [[Modulo_PDV|Módulo PDV]] — abre thread de chat sem exigir login do cliente.
- [[../05_Integracoes_Infra/IA_Gemini_OpenAI|IA_Gemini_OpenAI]] — módulo de IA do sistema, sem relação com este.

## Atualizações

- 2026-09-03: novo endpoint `POST /chat/customer/threads/{id}/prescriptions/link` —
  `ChatService.submit_customer_prescription_link` cria uma `Prescription` a partir de um link
  colado como mensagem (em vez de arquivo), postando um `prescription_request` na própria thread.
  Detecção no cliente é automática (`sendChatMessage` em `marketplace-app.jsx` reconhece quando a
  mensagem inteira é um link) — nenhum botão novo, nenhuma UI nova. Também: recusar uma receita
  agora fecha a thread de origem (`closed_reason='prescription_rejected'`), mesmo mecanismo que já
  fechava threads de pedido concluído. Ver
  [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR (Décima segunda
  rodada)]].
- 2026-09-02: `ChatWidget` (o popup pequeno do botão flutuante) ganhou um prop `openSignal` — um
  sinal (contador que muda de valor) que outro lugar do app pode usar pra forçar o painel a abrir,
  sem tomar posse do estado `open` (que continua interno/persistido em `sessionStorage`, só
  alternado pelo clique na própria bolha). Primeiro uso: `openWidgetChatPanel()` em
  `marketplace-app.jsx`, chamado pela etapa de Pagamento do checkout ao enviar uma receita digital
  — ver [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR (Terceira rodada)]].
- 2026-08-31 (2): console interno também ganhou polling de 4s (`GET /chat/threads`) — antes só o marketplace tinha, então uma mensagem do cliente só aparecia pro farmacêutico depois de trocar de thread ou recarregar. De quebra, corrigida uma afirmação errada desta nota: não existe (e nunca existiu) polling no board de pedidos internos — não havia um padrão pra reaproveitar, o polling do chat foi construído do zero.
- 2026-08-31: botão flutuante ganhou prompt de confirmação ("Iniciar conversa com farmacêutico") em vez de criar thread só por abrir a bolha; estado de painel aberto/fechado agora também persiste em `sessionStorage` (reload com painel aberto reabre expandido, na mesma conversa); todo thread ganhou número de referência sempre visível (pedido ou protocolo gerado, `ChatThreadResponse.protocol`), corrigindo de quebra o "Pedido —" que aparecia em threads gerais.
- 2026-08-30 (2): dois bugs reportados no mesmo dia da leva anterior — mensagem do farmacêutico só aparecia depois de alguma ação forçar refetch (sem polling no lado marketplace), e recarregar a página perdia a conversa ativa do widget (`sessionChatThreadIds`/`activeChatThreadId` eram só estado React em memória). Corrigido: polling real de 4s no marketplace enquanto logado (mesmo padrão do board de pedidos) e persistência em `sessionStorage` escopado por cliente via `FA_PORTAL_CACHE`.
- 2026-08-30: reescrita quase completa — migração de "Receita digital" para anexo de chat, guarda anti-spam (rate limit + bloqueio escalonado + definitivo), flag de spam, vínculo a pedido exposto pela rota, congelamento automático na conclusão do pedido, fila de contestação de bloqueio, RLS em `chat_unblock_requests`, correção do bug de RLS pós-commit em `ChatService`, correção do fallback silencioso em `sendChat` (console interno), página nova `/chats` + entrada no dropdown de usuário, botão flutuante escopado à sessão com seletor multi-thread.
- 2026-07-25: nota criada — documentação do estado atual do módulo.
