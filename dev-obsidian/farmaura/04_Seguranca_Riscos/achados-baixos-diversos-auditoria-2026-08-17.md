# Achados diversos de baixa severidade — auditoria completa de segurança 2026-08-17

**Tipo:** Vulnerabilidade/robustez (múltiplos achados de severidade BAIXA/INFORMATIVA, agrupados por afinidade)
**Status:** CONFIRMADO (todos os itens abaixo, salvo indicação contrária)
**Severidade:** BAIXO / INFORMATIVO
**Sistema afetado:** `farmaura-api` / `farmaura`
**Categoria:** Diversos (header injection limitado, código morto, timing, robustez, autorização frontend/backend, supply chain)
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

Nota consolidada — cada item é de severidade baixa/informativa isoladamente; agrupados aqui para não gerar uma nota trivial por item, conforme a diretriz do cofre de preferir poucas notas de alto valor.

## 1. `Content-Disposition` monta `filename` sem sanitizar aspas/controle (achado por dois agentes independentes)

**Localização:** `app/api/v1/purchase_quotes.py:181-182`, `app/api/v1/inventory.py:228-229,402-403`.
**Descrição:** `file_name`/`filename` do upload original do usuário é interpolado direto em `headers={"Content-Disposition": f'attachment; filename="{quote.file_name}"'}`, sem escapar aspas.
**Cenário de risco:** um `filename` contendo `"` pode quebrar o parâmetro `filename="..."`, potencialmente confundindo o parser do navegador sobre o nome/extensão salvo no download (MIME parameter injection). CRLF literal é bloqueado pelo próprio h11/uvicorn (grafia de field-value validada), então response-splitting completo é improvável.
**Impacto:** baixo — endpoints são só-internos (mesmo tenant), o atacante só controla o nome do próprio arquivo que ele mesmo baixa depois.
**Correção sugerida:** usar `FileResponse`/`Response` com `filename=` (Starlette já faz o RFC 6266 encoding correto) em vez de interpolar a string manualmente.

## 2. Endpoint `POST /uploads` (genérico) nunca persiste os bytes do arquivo

**Localização:** `app/services/upload_service.py:44-59` (`register_upload`), `app/api/v1/uploads.py:35-49`.
**Descrição:** `register_upload` valida (lê e descarta os bytes só para checar tamanho) e persiste apenas o `FileAsset` de metadados — nunca chama `write_private_file`. Não há nenhum endpoint de download correspondente, nem uso desse endpoint no frontend (`grep` em `farmaura/` não retorna nada).
**Impacto:** baixo hoje (não expõe dado, só perde o arquivo silenciosamente) — risco latente: se este scaffold for "descoberto" e ligado a uma feature real sem que alguém perceba que os bytes nunca foram gravados, o produto vai reportar sucesso sem realmente guardar nada; e, se corrigido, precisa nascer já com magic-byte validation (ver [[upload-sem-validacao-magic-bytes]]), não copiar o padrão atual.
**Correção sugerida:** decidir se o endpoint é necessário; se for, adicionar `write_private_file` e um endpoint de download com autorização; senão, remover.

## 3. Código morto confirmado: `AsaasClient.list_invoices`/`get_payment` nunca chamados

**Localização:** `app/services/asaas_client.py:86` (`list_invoices`), `:132` (`get_payment`).
**Descrição:** análise automatizada de todas as 317 funções públicas de `app/services/*.py` contra uso real no código encontrou apenas estes dois métodos genuinamente não referenciados por nenhuma rota/serviço. Ambos passam por `assert_configured()` antes de qualquer chamada de rede, não expõem lógica insegura por si.
**Correção sugerida:** remover ou justificar a manutenção (ex.: reserva para uso futuro).

## 4. Comparação de código de retirada de pedido não é constant-time

**Localização:** `app/services/order_service.py:549` (`informed_code != expected_code`).
**Descrição:** mesmo padrão de anti-pattern do achado do webhook Asaas (ver [[webhook-asaas-comparacao-token-nao-constant-time]]), aqui num endpoint interno autenticado, com código mínimo de 3 caracteres, sem rate-limit visível.
**Cenário de risco:** risco teórico de brute-force por staff mal-intencionado que já conhece o `order_id` — barreira de acesso já alta (precisa ser staff autenticado).
**Correção sugerida:** trocar por `secrets.compare_digest`.

## 5. Webhook Asaas: corrida rara gera 500 não tratado em vez de 204 idempotente

**Localização:** `app/services/payment_service.py` (`process_webhook_event`, `_is_duplicate_event`, `_record_event`).
**Descrição:** a proteção real contra replay (constraint única `(source, event_name, external_id)` em `payment_webhook_events`, checada antes de aplicar o evento) é sólida para reenvio serial — mas o par SELECT-then-INSERT não está protegido contra uma corrida verdadeira (dois webhooks idênticos quase simultâneos, transações diferentes): ambos passam pelo `_is_duplicate_event` antes de qualquer commit; o segundo `INSERT` falha com `IntegrityError` na constraint, que não é capturado, subindo como 500.
**Impacto:** resposta 500 em vez de 204 numa corrida rara; sem duplicação real de efeito no pedido (a constraint impede a segunda aplicação). Robustez, não segurança.
**Correção sugerida:** capturar `IntegrityError` na constraint de dedup e responder 204 (idempotente) em vez de propagar 500.

## 6. Frontend/backend: botão de "recuperar descartado" gated como admin-only na UI, mas endpoint aceita MANAGER/PHARMACIST também

**Localização:** `farmaura/react/internal/screens/{categories,brands,therapeutic-classes,products}-screen.jsx` (painel "Descartadas" só visível a `isAdmin`) vs. `app/api/v1/categories.py:90-100` (`PATCH /{id}/discard`, aceita ADMIN/MANAGER/PHARMACIST para os dois sentidos — descartar e recuperar).
**Cenário de risco:** um MANAGER/PHARMACIST pode chamar diretamente o endpoint para recuperar um item descartado, contornando a intenção de restringir essa ação a ADMIN.
**Impacto:** baixo — o mesmo papel já pode descartar o item pela própria UI (ação simétrica, mesmo endpoint), e a listagem bruta já retorna os itens descartados a esses papéis — o frontend só não renderiza o painel para eles; não há elevação real de privilégio nem exposição de dado novo.
**Correção sugerida:** se a intenção é mesmo restringir recuperação a ADMIN, adicionar checagem extra no backend quando `discarded=False`; senão, alinhar a UI e remover a falsa sensação de restrição.

## 7. Endpoint órfão `/orders/draft` aceita `unit_price` do cliente sem uso real

**Localização:** `app/schemas/orders.py:145-166` (`OrderItemRequest.unit_price`) → `app/api/v1/orders.py:103-112` (`POST /orders/draft`) → `app/services/order_service.py:144-153` (`prepare_order`).
**Descrição:** o endpoint aceita `unit_price` livre do cliente e apenas soma `unit_price * quantity`, sem persistir nada nem consultar o catálogo real. Nenhuma chamada a esse endpoint foi encontrada no frontend (`grep` em `farmaura/react` vazio) — parece código morto/não conectado.
**Impacto:** nenhum hoje (nada é gravado nem usado como preço autoritativo); risco latente se o endpoint for reaproveitado no futuro sem recalcular preço server-side. O checkout real (`POST /orders`) já não tem esse problema — usa `CheckoutOrderItemRequest`, que só aceita `product_id`+`quantity`, preço vindo sempre do servidor.
**Correção sugerida:** remover o endpoint órfão, ou recalcular `unit_price` a partir do inventário como já é feito no checkout real e no PDV.

## 8. `nh3` (sanitizador HTML anti-XSS) é a única dependência Python com range aberto em vez de versão travada

**Localização:** `farmaura-api/pyproject.toml` (`"nh3>=0.3.6"`); usado em `app/services/portal_service.py` para sanitizar HTML de banner/reviews.
**Descrição:** todas as outras ~19 dependências de produção usam `==` exato; só `nh3` usa `>=`. `uv.lock` resolve hoje para `0.3.6` (mesma versão do piso, sem drift atual), mas builds futuros de `uv sync -U`/relock puxariam automaticamente qualquer versão nova sem revisão explícita — justamente na biblioteca responsável por prevenir XSS armazenado no conteúdo do portal (ver [[csp-ausente-nas-paginas-html-de-producao|achado relacionado sobre XSS/CSP]]).
**Correção sugerida:** trocar para `nh3==0.3.6` (ou a versão que `uv.lock` já resolve), alinhando com o padrão do resto do `pyproject.toml`.

## Referências

- [[upload-sem-validacao-magic-bytes]], [[webhook-asaas-comparacao-token-nao-constant-time]], [[csp-ausente-nas-paginas-html-de-producao]] — achados relacionados de maior severidade.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: nota criada, consolidando 8 achados de baixa severidade da auditoria completa de segurança.
