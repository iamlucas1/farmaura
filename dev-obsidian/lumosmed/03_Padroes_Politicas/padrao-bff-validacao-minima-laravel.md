# Padrão confirmado: Laravel valida pouco de propósito, Python é a fonte de verdade

**Tipo:** Padrão técnico (documentação de convenção real)

## Descrição

Só `Auth/*` e `PortalCheckoutRequest.php` têm Form Request no lado Laravel. As demais controllers de API do portal (pacientes, agenda, usuários, WhatsApp, faturamento) fazem **passthrough puro**: pegam `$request->json()->all()` e mandam direto pro `LumosApiClient`, sem validar nada no PHP — a validação real acontece inteiramente na API Python.

## Motivo

Deliberado: o BFF existe para autenticação/sessão/roteamento, não para duplicar regra de negócio. `PortalCheckoutRequest.php` é a exceção porque checkout é comercialmente sensível o bastante para justificar uma camada de pré-validação de UX antes de gastar uma chamada de rede.

## Exceções conhecidas

O próprio `PortalCheckoutRequest.php` reimplementa CPF/CNPJ/Luhn/expiração de cartão em PHP, que já existem de forma independente em `lumos-api/domains/identity/services/input_validation.py` — duas implementações a manter sincronizadas. É um trade-off aceito (UX imediata vs. superfície duplicada), documentado no próprio cabeçalho do arquivo PHP. Ver achados de bug/duplicação em [[codigo-morto-e-bug-portal-checkout-request]].

## Ver também

- [[2026-03-22-adotar-padrao-bff-laravel]] — decisão arquitetural da qual este padrão de validação mínima decorre.
- [[Asaas_LumosMed]] — o próprio checkout de faturamento que este Form Request valida.

## Atualizações

- 2026-07-19: nota criada.
