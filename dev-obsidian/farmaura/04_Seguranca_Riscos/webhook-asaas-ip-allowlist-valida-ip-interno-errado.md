# Allowlist de IP do webhook Asaas valida o IP interno do proxy, não o IP real do Asaas

**Tipo:** Vulnerabilidade (controle de segurança quebrado / trust boundary de proxy)
**Status:** CONFIRMADO (achado de forma independente por dois agentes — infraestrutura e injeção/SSRF — a partir de ângulos diferentes)
**Severidade:** ALTO (efeito hoje é dormant/sem impacto ativo, mas o controle está estruturalmente quebrado)
**Sistema afetado:** `farmaura-api`
**Categoria:** Broken access control / trust boundary de proxy reverso
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

O padrão do ecossistema para autenticar o webhook do Asaas é **segredo compartilhado + allowlist de IP de origem** (ver [[../../_Compartilhado/Padroes_Politicas/padrao-autenticacao-webhook-segredo-e-ip-allowlist|padrao-autenticacao-webhook-segredo-e-ip-allowlist]]) — duas camadas, não uma só. A camada de segredo (`asaas_webhook_auth_token`) funciona corretamente. A camada de IP não funciona como desenhada.

`PaymentService._verify_webhook_source_ip` recebe o IP a partir de `request.client.host` (peer TCP direto da conexão):

```python
# app/api/v1/payments.py:44
source_ip=request.client.host if request.client else ""
```

Só que `farmaura-api` nunca é alcançado diretamente pela internet — a topologia real é `lumos-gateway` (termina TLS) → nginx do container `farmaura` → `farmaura-api`. `request.client.host`, nesse arranjo, é sempre o IP **interno Docker** do container nginx `farmaura`, nunca o IP público do Asaas. O uvicorn roda sem `--proxy-headers`/`--forwarded-allow-ips` (`docker/entrypoint.sh: exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8080`), e não há `ProxyHeadersMiddleware` nem leitura manual de `X-Forwarded-For` nesse ponto específico — apesar de o próprio `app/core/rate_limit.py::_client_ip()` já resolver esse mesmo problema corretamente para outro propósito (rate limiting), usando `X-Forwarded-For`.

## Evidência

- `app/api/v1/payments.py:44` — `source_ip=request.client.host if request.client else ""`.
- `app/services/payment_service.py:192-208` (`_verify_webhook_source_ip`) — compara `source_ip` contra `allowed_ranges` sem qualquer resolução de proxy.
- `docker/entrypoint.sh:8` — uvicorn iniciado sem `--proxy-headers`.
- `.env.production` (`APP_ASAAS_WEBHOOK_ALLOWED_IPS`) — **vazio hoje**; `_verify_webhook_source_ip` retorna cedo quando a lista está vazia (linha 196), por isso o bug está dormant/sem efeito ativo neste momento.
- Contraste: `app/core/rate_limit.py::_client_ip()` já resolve `X-Forwarded-For` corretamente — o padrão certo existe no codebase, só não foi usado aqui.

## Cenário de risco

No dia em que alguém popular `APP_ASAAS_WEBHOOK_ALLOWED_IPS` com os IPs reais documentados pelo Asaas (seguindo exatamente a orientação do padrão do ecossistema), duas consequências possíveis, ambas ruins:

1. **Falso negativo total**: todo webhook legítimo do Asaas passa a ser rejeitado com 403, porque o IP comparado nunca é o do Asaas — quebra confirmação de pagamento em produção.
2. Se alguém "corrigir" isso na prática colocando o CIDR interno do Docker/gateway na allowlist para fazer passar, a allowlist deixa de discriminar por origem real — qualquer requisição que chegue pelo caminho normal do proxy passa igualmente, reduzindo a defesa de duas camadas a uma só (o segredo compartilhado).

## Impacto

Hoje: nenhum (feature efetivamente desligada, allowlist vazia). Latente: perda de uma das duas camadas de defesa documentadas como padrão do ecossistema para autenticação de webhook, no exato momento em que alguém tentar ativá-la corretamente — o que é o comportamento esperado ao seguir a própria documentação do padrão.

## Pré-condições

Nenhuma para o estado atual (já está assim). Ativa-se assim que `APP_ASAAS_WEBHOOK_ALLOWED_IPS` for preenchida com IPs reais em produção.

## Escopo afetado

`app/api/v1/payments.py` (rota do webhook), `app/services/payment_service.py` (`_verify_webhook_source_ip`), `docker/entrypoint.sh` (inicialização do uvicorn).

## Causa raiz

Ausência de tratamento de cabeçalhos de proxy confiável (`X-Forwarded-For`/`X-Real-IP`) especificamente neste ponto do código — apesar do mesmo problema já estar resolvido em `rate_limit.py::_client_ip()` para outro propósito.

## Correção sugerida para análise futura

Reaproveitar a mesma lógica de `app.core.rate_limit._client_ip()` (já testada e correta para esta topologia) em `payments.py`, em vez de `request.client.host`. Alternativa mais estrutural: iniciar uvicorn com `--proxy-headers --forwarded-allow-ips=<IP do nginx interno>` para que `request.client.host` já venha corrigido automaticamente em toda a aplicação, não só neste ponto.

## Dependências da correção

Nenhuma migration. Mudança de código pura (backend) + possível ajuste de `docker/entrypoint.sh`/comando do uvicorn.

## Riscos de regressão

Baixo — a mudança só afeta como o IP de origem é extraído, não a lógica de decisão em si. Testar com atenção o caso `allowed_ranges` vazio (deve continuar sendo no-op) e o caso de requisição direta (sem passar pelo proxy, ex. em teste local) para não quebrar ambientes de desenvolvimento que não têm o nginx intermediário.

## Como validar futuramente que a correção funcionou

1. Popular `APP_ASAAS_WEBHOOK_ALLOWED_IPS` com um IP de teste em ambiente de staging (`lumos-dev`) e confirmar, via log/teste manual, que o IP resolvido por `_verify_webhook_source_ip` é o IP de origem real da requisição, não o IP interno do container nginx.
2. Simular um webhook real do Asaas (ambiente sandbox) e confirmar que passa pela validação de IP quando a allowlist contém o IP real documentado pelo provedor.

## Referências

- [[../../_Compartilhado/Padroes_Politicas/padrao-autenticacao-webhook-segredo-e-ip-allowlist|padrao-autenticacao-webhook-segredo-e-ip-allowlist]] — padrão que este achado viola.
- [[webhook-asaas-comparacao-token-nao-constant-time]] — outro achado no mesmo endpoint.
- [[../05_Integracoes_Infra/Asaas|Asaas]] — contrato completo da integração.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.
