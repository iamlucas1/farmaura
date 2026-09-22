---
cssclasses: ia-nota
---

# Asaas sandbox: o que ainda depende de credenciais, decisão fiscal e deploy

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-20

## Descrição

1. ~~**Teste real pendente**~~ — **Resolvido em 2026-09-22.** Chave de API do sandbox e webhook (staging, `dev.drogariafarmaura.com.br`) configurados; cobrança real testada ponta a ponta (cartão tokenizado + cobrado, Pix criado) via `scripts/asaas_sandbox_check.py` em staging. Roteiro seguido: [[../07_POPs_Processos/testar-asaas-sandbox|POP]].
2. ~~**NFS-e ≠ mercadoria**~~ — **Resolvido para pedidos `pickup` em 2026-09-22.** O caminho fiscal deixou de depender do Asaas: pedidos de marketplace com retirada em loja agora emitem NFC-e real, direto à SEFAZ-DF, pelo mesmo motor do PDV. Ver [[../00_Decisoes/2026-09-22-nfce-real-para-pedidos-marketplace-pickup|ADR]]. O Asaas continua sendo usado só para **pagamento** (Pix/cartão), nunca mais para nota fiscal. Escopo restante (pedidos `delivery`/`shipping`, ainda sem nota real, pendente de definição do contador sobre frete/venda não presencial) segue em [[nfce-marketplace-documentos-simulados|pendência atualizada]].
3. **`remoteIp` atrás do gateway**: o app usa `request.client.host`; no `lumos-gateway` isso é o IP do gateway, não o do cliente (uvicorn sem `--forwarded-allow-ips`). Mesma causa raiz do achado já registrado em [[../04_Seguranca_Riscos/webhook-asaas-ip-allowlist-valida-ip-interno-errado|allowlist do webhook valida o IP do proxy]]. Definir a política de proxies confiáveis resolve os dois: antifraude do Asaas recebe o IP real e a allowlist do webhook passa a ser confiável.
4. **E-mail da nota**: o link `…/fiscal/nfce/{id}/printable` exige login de funcionário; o cliente do marketplace não consegue abri-lo (já era assim com a rota antiga). Falta um link/rota do cliente por pedido.
5. **Valor da nota × cashback**: a nota usa `order.total_amount`; a cobrança pode ter sido menor (cashback resgatado). Definir qual valor vale para a nota de serviço.
6. **Webhook em produção**: `APP_ASAAS_WEBHOOK_ALLOWED_IPS` está vazio (só o token protege). Só faz sentido depois do item 3 (ver a nota de segurança citada lá). Avaliar restringir aos IPs do Asaas e o `lumos-gateway` (GeoIP/rate-limit) liberar a origem.
7. **CPFs do seed inválidos**: o Asaas valida o CPF; clientes do seed não conseguem tokenizar cartão. Ver [[cpfs-do-seed-invalidos-impedem-salvar-perfil]].

## Contexto

Registrada ao preparar o sandbox. Ver o [[../00_Decisoes/2026-09-20-asaas-sandbox-guarda-remoteip-e-nota-no-formato-real|ADR]].
