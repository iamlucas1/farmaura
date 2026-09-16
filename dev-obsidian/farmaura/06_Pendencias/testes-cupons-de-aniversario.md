# Sem suíte de teste para o resgate de cupons de aniversário

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-05

## Descrição

`CustomerService.get_anniversary_offers`/`claim_anniversary_offer` e
`CouponService.get_customer_anniversary_coupon`/`claim_anniversary_coupon` (ver
[[../00_Decisoes/2026-09-05-cupons-de-aniversario-nascimento-e-cliente|ADR]]) não têm testes
automatizados cobrindo: elegibilidade por mês (nascimento vs. fora do mês), resgate idempotente
(claim duas vezes no mesmo ano devolve o mesmo cupom), a trava `target_customer_id` em
`CouponService.resolve_coupon` (outro cliente tentando usar o código de alguém recebe "cupom
inválido"), e o caso de cliente sem `birth_date` cadastrada (oferta de nascimento não deve
aparecer).

## Contexto

Não escrito na mesma leva por tempo — o recurso foi verificado só via `pytest` da suíte existente
(sem regressão) + smoke test manual dos endpoints (`GET`/`POST` retornando 401 sem token, ou seja,
roteados corretamente) e checagem de schema pós-migration. Seguir o padrão de
`app/tests/unit/test_cashback_service.py` (fixture `monkeypatch: pytest.MonkeyPatch`, não
`unittest.mock.patch`) ao escrever esses testes.
