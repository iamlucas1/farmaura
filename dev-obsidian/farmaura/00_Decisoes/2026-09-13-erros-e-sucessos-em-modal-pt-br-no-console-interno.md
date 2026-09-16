# 2026-09-13 — Erros e sucessos do console interno sempre em modal, em português, sem vazar detalhe sensível

## Contexto

Pedido explícito: todo resultado de ação no console interno (`farmaura/react/internal/`) — sucesso, erro de usuário, falha de banco, falha de servidor — deve aparecer sempre numa modal com botão "Fechar" explícito (nunca um toast que some sozinho), em português, deixando claro o tipo de falha, sem nunca expor ao front detalhe sensível (stack trace, SQL, caminho de arquivo, segredo) — isso fica só em log estruturado no servidor.

## Decisão

### Frontend — `showToast`/`ToastHost` viram uma modal de resultado

`farmaura/react/internal/core/internal-ui.jsx`: `showToast` aceita as duas formas já usadas em ~200 pontos de chamada — `showToast(mensagem, "success"|"warn")` (legado) e `showToast({ message, tone, title, actionLabel, onAction })` — e sempre entrega para `ToastHost`, que agora renderiza um `Modal` (não mais um toast auto-dismissable) com título/ícone/cor por tom:

- `success` → título "Sucesso", ícone de check, cor `--good`.
- `warn` → título "Erro", ícone de alerta, cor `--critical`. Cobre **toda** falha reportada ao usuário (banco de dados, validação, servidor, permissão etc.) — o texto específico do que falhou vem da própria mensagem, não de uma cor/categoria diferente por tipo.
- `info` → título "Aviso" (tom neutro, usado quando nenhum tom é passado).

Fila (`queue`) em vez de estado único, para não perder uma segunda notificação disparada antes da primeira ser fechada. Removido o CSS morto de toast (`.toast-stack`, `.toast`, `@keyframes toast-in` etc. em `internal.css`).

### Backend — toda resposta de erro ganha `{ detail, category }` em português

`farmaura-api/app/core/exceptions.py`: reescrito para garantir que **qualquer** exceção não tratada — `DomainError`, `HTTPException` solto, erro de validação do Pydantic, `IntegrityError`, qualquer outro `SQLAlchemyError`, ou uma exceção genuinamente inesperada — sempre vira `{"detail": "<mensagem segura em português>", "category": "<categoria>"}`:

- `RequestValidationError` → 422, mensagem genérica fixa (nunca ecoa o erro bruto do Pydantic, que pode conter nomes de campo/estrutura interna).
- `IntegrityError` → 409 "Não foi possível salvar: conflito de dados." (`category: "banco_de_dados"`).
- `SQLAlchemyError` (qualquer outro) → 503, mensagem genérica; o erro real vai só para `logger.error("database_error", exc_info=exc, ...)`.
- `Exception` (catch-all) → 500, mensagem genérica; idem, só logado.
- `HTTPException` solto (a maioria dos ~150+ pontos em `app/services/*.py` que ainda não usa `DomainError`) ganha uma `category` inferida do status HTTP (`_category_for_status`), mesmo sem migrar o `detail` em si.

`app/domain/errors.py`: `DomainError` ganhou `category`; mensagens padrão de `AuthenticationError`/`AuthorizationError`/`NotFoundError` traduzidas para português.

`app/core/logging.py`: `structlog.processors.format_exc_info` adicionado à cadeia de processadores — sem isso, `exc_info=` não virava traceback real no log (só o log estruturado, nunca a resposta HTTP, carrega esse detalhe).

`app/services/auth_service.py`: as ~20 mensagens de `AuthenticationError`/`HTTPException` deste arquivo traduzidas para português (ex.: "Invalid two-factor code." → "Código de verificação inválido.").

## Bug real encontrado ao testar: `showToast` local em `internal-app.jsx` descartava o tom

Ao testar a modal de sucesso de verdade (alternar "Ativar/Desativar produto" em Produtos), a modal aparecia — mas sempre com o tom "Aviso" (info/azul), nunca "Sucesso" (verde), mesmo chamando `notify(msg, "success")`.

Causa: `internal-app.jsx` importa a função do kit renomeada (`showToast as kitShowToast`), mas define localmente `const showToast = (msg) => { kitShowToast({ message: msg }); };` — esse wrapper **descarta silenciosamente o segundo argumento** (o tom). Como todo `ctx.notify` do app vem de `notify: showToast` apontando para esse wrapper local, **todas as ~150 chamadas `showToast(mensagem, "success"|"warn")` deste arquivo perdiam o tom**, sempre caindo no padrão "info" — um bug antigo (não introduzido nesta sessão), só ficou visível agora que o resultado é uma modal claramente rotulada em vez de um toast genérico.

Corrigido para repassar os dois argumentos: `const showToast = (msg, tone) => { kitShowToast(msg, tone); };`.

### Como foi diagnosticado (documentando o caminho, não só o resultado)

O bundle de produção mostrava o mesmo hash de arquivo mesmo após rebuild — rastreado até `docker compose build` sem `up -d` depois (o container antigo continuava servindo o bundle antigo). Depois de confirmar rebuild real (hash mudou), o bundle minificado ainda ignorava o segundo parâmetro da função `showToast` do kit — o que levou a desconfiar de um wrapper duplicado em vez de um bug na própria função, encontrado por grep (`function showToast|const showToast` em `internal-app.jsx`).

## Achado adicional (mesmo tema): mensagem de erro em inglês vazando pro usuário

Testando a modal de erro de verdade (cadastrar produto com SKU duplicado), a modal "Erro" apareceu corretamente, mas com o texto **em inglês**: "Product SKU already registered." — um `HTTPException(detail=...)` nunca traduzido. Confirmado por grep que o mesmo padrão ("já cadastrado") se repete em inglês em 5 arquivos de serviço:

- `product_service.py` (EAN e SKU duplicados, 4 ocorrências)
- `supplier_service.py` (CNPJ duplicado, 2 ocorrências)
- `therapeutic_class_service.py`, `brand_service.py`, `category_service.py` (nome duplicado, 2 ocorrências cada)

Essas 12 mensagens foram traduzidas nesta sessão (ex.: "Product SKU already registered." → "Este SKU já está cadastrado em outro produto."). O restante do backlog de ~150 mensagens em outros ~12 arquivos de serviço **não foi tocado** — ver [[../06_Pendencias/traduzir-mensagens-httpexception-restantes|pendência atualizada]].

## Consequências

- Testado ponta a ponta via CDP headless (Chrome real, não só leitura de código): modal de sucesso (verde, "Produto ativado.") e modal de erro (vermelho, "Este SKU já está cadastrado em outro produto.") — ambas com botão "Fechar" funcional.
- Nenhuma mudança de contrato de API além de `category` ser adicionado a toda resposta de erro (campo novo, aditivo — não quebra consumidores que só liam `detail`).
- O texto de cada mensagem continua sendo a única forma de diferenciar "por que" falhou (banco, validação, permissão) — a modal usa uma única cor de erro ("warn"/vermelho) para toda falha, por decisão consciente (ver seção Decisão), não por limitação.

## Ver também

- [[../06_Pendencias/traduzir-mensagens-httpexception-restantes|traduzir-mensagens-httpexception-restantes]] — backlog do que ainda falta traduzir.
- [[../06_Pendencias/padronizar-tratamento-erros-domainerror-vs-httpexception|padronizar-tratamento-erros-domainerror-vs-httpexception]] — pendência mais antiga sobre os dois idiomas de erro (`DomainError` vs `HTTPException` solto), tema relacionado mas distinto (estrutura do erro, não seu idioma).
