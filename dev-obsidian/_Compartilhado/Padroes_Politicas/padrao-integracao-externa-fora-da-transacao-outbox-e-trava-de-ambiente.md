---
cssclasses: ia-nota
---

# Padrão: integração externa fora da transação (outbox + snapshot) e trava de ambiente

**Tipo:** Padrão técnico genérico

## Aplica-se a

Qualquer chamada a serviço externo que gere efeito real ou fiscal (pagamento, nota fiscal, e-mail transacional, WhatsApp) a partir de uma operação de negócio já transacional (venda, pedido, cadastro).

## Descrição

1. **Nunca chamar o provedor dentro da transação de negócio.** Dentro da transação, gravar só uma linha de fila (outbox) com um **snapshot imutável** de tudo que a chamada precisa (itens, valores, dados fiscais). Depois do `COMMIT`, um worker processa a fila.
2. **A fila é o banco.** Estado explícito (`DRAFT → … → AUTHORIZED/ERROR`), lease atômico por linha (`UPDATE ... WHERE locked_until IS NULL OR < now RETURNING`), backoff exponencial, teto de tentativas. Reiniciar o processo não perde nada e várias réplicas não duplicam.
3. **Snapshot em vez de reler linhas vivas.** Evita depender de RLS por papel dentro do worker e impede que uma edição posterior (preço, cadastro) mude uma operação já numerada.
4. **Timeout não é rejeição.** Falha de rede vira "pendente de recuperação": consultar o estado no provedor antes de qualquer reenvio; reenviar o **mesmo** payload se ele confirmar que nunca recebeu. Rejeição de negócio não é repetida sozinha.
5. **Idempotência por índice único** na chave de negócio (uma nota por venda) e sequências de numeração por `UPDATE ... RETURNING`, nunca `MAX()+1`.
6. **Trava de ambiente fail-closed.** O cliente do provedor recusa a URL/credencial de produção quando o ambiente da aplicação não é produção (staging com chave real cobra cartão de verdade). Ligar em produção exige **duas chaves** explícitas, e uma chave-mestra desligada por padrão faz o deploy do código não ter efeito.
7. **Falha visível.** Chamadas "best-effort" registram o motivo no log (sem segredo/PII); engolir erro em silêncio esconde bugs até o primeiro teste real.

## Motivo

Provedor lento ou fora do ar não pode reverter, duplicar nem travar a venda; e um erro de configuração não pode gerar cobrança ou documento fiscal reais. Foi o desenho adotado na NFC-e do Farmaura e na correção do Asaas.

## Exceções conhecidas

Chamadas puramente de leitura, sem efeito colateral, podem rodar inline. Onde o resultado é requisito da própria resposta (ex.: autorizar cartão no checkout), a chamada síncrona é inevitável: nesse caso, nenhum commit antes dela, para a transação inteira ser descartada em caso de falha.

## Ver também

- [[../../farmaura/00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR NFC-e]] e [[../../farmaura/00_Decisoes/2026-09-20-asaas-sandbox-guarda-remoteip-e-nota-no-formato-real|ADR Asaas]] — aplicações concretas.
- [[padrao-autenticacao-webhook-segredo-e-ip-allowlist]] — o outro lado (webhooks de entrada).

## Atualizações

- 2026-09-20: nota criada a partir do módulo NFC-e e do preparo do sandbox Asaas.
