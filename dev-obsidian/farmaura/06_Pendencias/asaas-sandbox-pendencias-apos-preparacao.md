---
cssclasses: ia-nota
---

# Asaas sandbox: o que ainda depende de credenciais, decisão fiscal e deploy

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-20

## Descrição

1. **Teste real pendente**: falta a chave de API do sandbox e um webhook alcançável (staging ou túnel). Nenhuma cobrança real foi criada. Roteiro em [[../07_POPs_Processos/testar-asaas-sandbox|POP]].
2. **NFS-e ≠ mercadoria**: o Asaas emite nota de **serviço**. Uma drogaria vende mercadoria (ICMS → NFC-e/NF-e). Validar com o contador se a nota via Asaas faz sentido para o marketplace; a alternativa é o [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|módulo NFC-e]]. Hoje o pedido online cria também o documento simulado ([[nfce-marketplace-documentos-simulados|pendência]]).
3. **`remoteIp` atrás do gateway**: o app usa `request.client.host`; no `lumos-gateway` isso é o IP do gateway, não o do cliente (uvicorn sem `--forwarded-allow-ips`). Mesma causa raiz do achado já registrado em [[../04_Seguranca_Riscos/webhook-asaas-ip-allowlist-valida-ip-interno-errado|allowlist do webhook valida o IP do proxy]]. Definir a política de proxies confiáveis resolve os dois: antifraude do Asaas recebe o IP real e a allowlist do webhook passa a ser confiável.
4. **E-mail da nota**: o link `…/fiscal/nfce/{id}/printable` exige login de funcionário; o cliente do marketplace não consegue abri-lo (já era assim com a rota antiga). Falta um link/rota do cliente por pedido.
5. **Valor da nota × cashback**: a nota usa `order.total_amount`; a cobrança pode ter sido menor (cashback resgatado). Definir qual valor vale para a nota de serviço.
6. **Webhook em produção**: `APP_ASAAS_WEBHOOK_ALLOWED_IPS` está vazio (só o token protege). Só faz sentido depois do item 3 (ver a nota de segurança citada lá). Avaliar restringir aos IPs do Asaas e o `lumos-gateway` (GeoIP/rate-limit) liberar a origem.
7. **CPFs do seed inválidos**: o Asaas valida o CPF; clientes do seed não conseguem tokenizar cartão. Ver [[cpfs-do-seed-invalidos-impedem-salvar-perfil]].

## Contexto

Registrada ao preparar o sandbox. Ver o [[../00_Decisoes/2026-09-20-asaas-sandbox-guarda-remoteip-e-nota-no-formato-real|ADR]].
