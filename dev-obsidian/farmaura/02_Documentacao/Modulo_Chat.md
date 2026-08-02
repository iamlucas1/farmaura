# Módulo Chat

## O que é

Canal de mensagens texto entre cliente e farmacêutico (nunca cliente↔cliente, nem IA↔cliente — o módulo de IA do sistema é só para análise de estoque, [[../05_Integracoes_Infra/IA_Gemini_OpenAI|IA_Gemini_OpenAI]], sem relação com chat). REST puro, **sem WebSocket/SSE** em todo o backend. Também funciona como canal de notificação de outros domínios (ex.: solicitação de validação de receita a partir do PDV).

## Tabelas / Models

- **`chat_threads`** — `order_id` opcional, `customer_id`, `pharmacist_user_id` (resolvido automaticamente, ver regras), `thread_status` (default `open`, nunca transiciona), snapshots de nome/pedido, `last_message_preview`/`last_message_at_label`, `customer_unread_count`/`pharmacist_unread_count` (contadores, não derivados das mensagens), `is_active` (soft-delete).
- **`chat_messages`** — `sender_user_id` **xor** `sender_customer_id`, `message_type` (`text` ou `prescription_request`), `sent_at_label` (sempre a string `"agora"` — não é timestamp real, embora `created_at` exista e seja usado para ordenação), `customer_read`/`pharmacist_read` (setados na criação mas **nunca lidos/consultados** depois — dado morto), `is_internal_note` (sempre `False` — RLS já suporta ocultar notas internas do cliente, mas nenhum service cria uma).
- **`chat_message_attachments`** — existe no schema/RLS mas **nenhum código de aplicação usa** (escopo explicitamente adiado).
- RLS: `can_access_chat_thread_row` — dono (customer), farmacêutico atribuído, ou qualquer role admin/manager/pharmacist vê tudo do tenant. `chat_messages`/`attachments` reaplicam a mesma regra por `EXISTS`, mais a cláusula que esconde `is_internal_note=true` de quem não é staff.

## Endpoints (REST puro, sem WebSocket)

- Interno: `GET /chat/threads`, `POST /chat/threads/{id}/messages` — `ADMIN, MANAGER, PHARMACIST`.
- Marketplace: `GET /chat/customer/threads`, `POST /chat/customer/threads` (get-or-create), `POST /chat/customer/threads/{id}/messages` (cria a thread silenciosamente se não existir/não pertencer ao cliente) — role `CUSTOMER`.
- Cada `send` re-busca a lista inteira de threads do ator e extrai a alvo — padrão N+1 simples, mas custoso.

## Fluxo — quem conversa com quem

1:1 cliente↔thread (múltiplas threads por cliente, geralmente uma por pedido), sempre com um farmacêutico do tenant. **Resolução automática de farmacêutico**: pega simplesmente o **primeiro** usuário ativo com role `pharmacist` do tenant — sem rodízio, sem balanceamento, sem considerar loja. Entrega é 100% síncrona via REST — não há push em tempo real; o outro lado só vê mensagem nova no próximo `GET`. O board de pedidos tem polling real (4s), mas **chat não tem polling equivalente** em nenhum dos dois lados — só busca sob ação explícita do usuário.

## Regras de negócio não óbvias

- **Rótulos de tempo são strings estáticas** (`"agora"`), não timestamps reais exibidos na UI — ordenação real usa `created_at`, mas a UI nunca mostra esse valor.
- **Fallback silencioso no console interno**: se o envio falhar, a mensagem aparece só no state local (catch vazio) — farmacêutico vê "enviada" sem ter sido persistida.
- **PDV escreve no chat do cliente sem exigir login**: ao enviar receita digital no balcão, `PrescriptionService` cria/reaproveita thread e posta mensagem de sistema `prescription_request` com o `prescription_id` anexado.
- **Get-or-create duplo e não deduplicado**: `POST /chat/customer/threads` e o create implícito dentro de `send_customer_message` são dois caminhos diferentes de criação, sem dedupe entre eles.
- **"Não lidas" só zera quando o próprio lado envia mensagem** — abrir/selecionar uma thread no frontend zera o contador só localmente no state React; um reload faz o badge voltar.
- **RLS já suporta notas internas ocultas do cliente**, mas a aplicação nunca cria uma — esqueleto pronto, sem UI/serviço.

## Frontend

- **Interno** (`chat-screen.jsx`): inbox lado farmacêutico — lista de threads + painel de conversa; mensagens `prescription_request` renderizam card com botões Validar/Recusar inline. Indicador "digitando" e "online" são props mortas (nunca populadas pelo backend).
- **Marketplace**: sem tela dedicada — componentes reutilizáveis em `marketplace-care-actions.jsx` (`PharmacistChatPanel`, `PharmacistChatInbox`, `ChatLoginPrompt`, `PharmacistChatModal`), pontos de entrada em `care-screen.jsx`/`extra-screen.jsx` ("Atendimento farmacêutico") e aba "Minhas conversas" em `account-screen.jsx`. Threads cacheadas em `localStorage` só como otimização (não é fonte de verdade).

## Decisões de arquitetura dignas de nota

- **REST stateless + polling manual (não automático)** em vez de WebSocket/SSE — simplicidade deliberada, ao custo de não haver atualização em tempo real.
- **RLS como segunda linha de defesa** por trás da checagem de aplicação — defesa em profundidade explícita.
- **Snapshots desnormalizados agressivos** — mesma filosofia de histórico imutável vista em outros domínios.
- **Chat usado como canal de notificação de outros domínios** (Prescrição/PDV), não só chat ponto-a-ponto — mistura `message_type="text"` humano com eventos de sistema no mesmo model.
- **Mensagens são append-only por design** — sem edição/exclusão/versionamento, comentado explicitamente no código.

## Ver também

- [[Modulo_Prescricoes|Módulo Prescrições]] — origem da mensagem `prescription_request` a partir do PDV.
- [[Modulo_PDV|Módulo PDV]] — abre thread de chat sem exigir login do cliente.
- [[../05_Integracoes_Infra/IA_Gemini_OpenAI|IA_Gemini_OpenAI]] — módulo de IA do sistema, sem relação com este.

## Atualizações

- 2026-07-25: nota criada — documentação do estado atual do módulo.
