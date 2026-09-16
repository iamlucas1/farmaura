# Traduzir para português as mensagens de `HTTPException` restantes em `app/services/`

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-13

## Descrição

Como parte da mudança que fez o console interno sempre mostrar erro/sucesso em modal (ver [[../00_Decisoes/2026-09-13-erros-e-sucessos-em-modal-pt-br-no-console-interno|ADR]]), `auth_service.py` foi totalmente traduzido e um cluster de 12 mensagens de conflito ("já cadastrado") em `product_service.py`, `supplier_service.py`, `therapeutic_class_service.py`, `brand_service.py` e `category_service.py` também. **O restante do backlog não foi tocado.**

Levantamento aproximado (grep por padrões em inglês tipo "already"/"invalid"/"not "/"required"/"failed" dentro de `detail="..."`) aponta pelo menos estes arquivos com mensagens ainda em inglês, por volume decrescente:

`customer_service.py`, `pdv_service.py`, `inventory_service.py`, `purchase_quote_ai_service.py`, `inventory_lot_service.py`, `ai_service.py`, `prescription_service.py`, `team_service.py`, `delivery_service.py`, `portal_service.py`, `payment_service.py`, `order_service.py`, `inventory_invoice_service.py`, `crm_service.py`, `chat_service.py`, `fiscal_service.py`, `purchase_quote_service.py`, `store_service.py`, `upload_service.py`.

Uma varredura completa e exata (não uma estimativa por grep) é necessária antes de fechar esta pendência — o número certo de ocorrências por arquivo não foi contado com precisão.

## Contexto

Ficou pendente porque é um volume grande (~15-19 arquivos, dezenas de ocorrências cada nos maiores) para traduzir de uma vez com segurança — cada mensagem precisa ser lida em contexto para não introduzir erro de sentido, diferente do cluster "já cadastrado" que era um padrão idêntico e mecânico em 5 arquivos. Fazer em lotes por arquivo/domínio, como já foi feito para `auth_service.py`.

Related: [[padronizar-tratamento-erros-domainerror-vs-httpexception]] — pendência sobre a estrutura do erro (`DomainError` vs `HTTPException` solto), tema irmão mas distinto do idioma da mensagem; os dois podem ser resolvidos juntos por arquivo quando esse trabalho for feito, já que ambos tocam as mesmas linhas.
