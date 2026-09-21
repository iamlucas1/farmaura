"""
farmaura-api/scripts/asaas_sandbox_check.py

Step-by-step check of the Asaas SANDBOX integration (payments, webhook and service invoice).

Responsibilities:
- report the Asaas configuration (never printing a secret) and refuse anything that is not the sandbox;
- prove the API key works, register the webhook and list/verify the invoice prerequisites;
- create a real sandbox Pix charge and card charge through the application's own `PaymentService` code;

Observations:
- sandbox only: the script exits if `APP_ASAAS_BASE_URL` is not `https://api-sandbox.asaas.com`;
- the sandbox has NO API to confirm a payment: after the Pix charge, click "CONFIRMAR PAGAMENTO" in the sandbox
  panel (Cobranças). Card charges confirm by themselves;
- nothing is written to the Farmaura database, except with `--run-fiscal-tick`;

Usage (inside the API container, or locally with the same environment variables):
    python scripts/asaas_sandbox_check.py                              # config + token + webhooks + fiscal info
    python scripts/asaas_sandbox_check.py --services "consult"         # list municipal services (id for the .env)
    python scripts/asaas_sandbox_check.py --register-webhook https://dev.example.com/api/v1/payments/asaas/webhook
    python scripts/asaas_sandbox_check.py --charge pix                 # or: card | both | card-decline
    python scripts/asaas_sandbox_check.py --invoice pay_XXXXXXXX       # schedule a service invoice on a paid charge
    python scripts/asaas_sandbox_check.py --run-fiscal-tick            # issue documents of already-confirmed orders
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import urlparse

from structlog.contextvars import bind_contextvars

from app.core.config import get_settings
from app.services.asaas_client import AsaasClient, AsaasError, build_invoice_payload
from app.services.payment_service import PaymentService

OK, FAIL, WARN = "[ OK ]", "[FALHA]", "[ AVISO ]"
WEBHOOK_EVENTS = [
    "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED",
    "PAYMENT_RECEIVED_IN_CASH", "INVOICE_CREATED", "INVOICE_SYNCHRONIZED", "INVOICE_AUTHORIZED", "INVOICE_ERROR",
]
# Documented by Asaas as the declined test cards (docs.asaas.com "Testando pagamento com cartão de crédito").
DECLINE_CARD = "5184019740373151"
# Any Luhn-valid fictitious number is approved in the sandbox (same page).
APPROVE_CARD = "4111111111111111"


def step(title: str) -> None:
    print(f"\n== {title}")


def generate_cpf() -> str:
    """Return a fictitious CPF with valid check digits (the sandbox validates them)."""

    digits = [random.randint(0, 9) for _ in range(9)]
    for size in (9, 10):
        total = sum(d * w for d, w in zip(digits, range(size + 1, 1, -1), strict=False))
        digits.append((total * 10 % 11) % 10)
    return "".join(str(d) for d in digits)


def describe_error(error: AsaasError) -> str:
    return f"HTTP {error.status_code}: {error.message}"


async def main() -> int:
    parser = argparse.ArgumentParser(description="Asaas sandbox check (never production).")
    parser.add_argument("--register-webhook", metavar="URL", help="public https URL of /api/v1/payments/asaas/webhook")
    parser.add_argument("--webhook-email", default="", help="e-mail Asaas notifies when the webhook is interrupted")
    parser.add_argument("--services", nargs="?", const="", metavar="TEXT", help="list municipal services (optional filter)")
    parser.add_argument("--charge", choices=["pix", "card", "both", "card-decline"], help="create sandbox charges")
    parser.add_argument("--amount", default="12.34", help="charge value in BRL (default 12.34)")
    parser.add_argument("--remote-ip", default="203.0.113.10", help="payer IP sent as remoteIp on card calls")
    parser.add_argument("--invoice", metavar="PAYMENT_ID", help="schedule a service invoice on this paid charge")
    parser.add_argument("--run-fiscal-tick", action="store_true", help="issue fiscal documents of confirmed orders now")
    args = parser.parse_args()

    settings = get_settings()
    client = AsaasClient()

    step("1. Configuração")
    print(f"     ambiente da API: {settings.environment} | base URL: {client.base_url}")
    if not client.is_sandbox:
        print(f"{FAIL} Este script só roda no SANDBOX (https://api-sandbox.asaas.com). Nada foi feito.")
        return 2
    problems = []
    if not settings.asaas_enabled:
        problems.append("APP_ASAAS_ENABLED=true")
    if not client.access_token:
        problems.append("APP_ASAAS_ACCESS_TOKEN (chave da conta SANDBOX)")
    elif not client.access_token.startswith("$aact_hmlg_"):
        print(f"{WARN} a chave não começa com $aact_hmlg_ (padrão da chave de sandbox); confira se é a do sandbox.")
    token_length = len(str(settings.asaas_webhook_auth_token or ""))
    if not 32 <= token_length <= 255:
        problems.append("APP_ASAAS_WEBHOOK_AUTH_TOKEN (32 a 255 caracteres)")
    if problems:
        for problem in problems:
            print(f"{FAIL} falta/ajustar {problem}")
        return 1
    print(f"{OK} integração habilitada, chave presente, segredo do webhook com {token_length} caracteres")

    step("2. Chave de API (leitura autenticada)")
    try:
        await asyncio.to_thread(client.ping)
    except AsaasError as error:
        print(f"{FAIL} {describe_error(error)}")
        return 1
    print(f"{OK} o Asaas aceitou a chave")

    step("3. Webhooks cadastrados")
    try:
        hooks = await asyncio.to_thread(client.list_webhooks)
    except AsaasError as error:
        print(f"{FAIL} {describe_error(error)}")
        return 1
    for hook in hooks:
        print(f"     - {hook.get('url')} enabled={hook.get('enabled')} interrupted={hook.get('interrupted')}")
    if not hooks:
        print(f"{WARN} nenhum webhook cadastrado: Pix só será confirmado no Farmaura por webhook (ou pelo simulador).")
    if args.register_webhook:
        url = args.register_webhook.strip()
        host = urlparse(url).hostname or ""
        if urlparse(url).scheme != "https" or host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local"):
            print(f"{FAIL} o webhook precisa de uma URL https PÚBLICA (o Asaas não alcança localhost). Use staging ou um túnel.")
            return 1
        if any(str(hook.get("url")) == url for hook in hooks):
            print(f"{OK} esse webhook já está cadastrado")
        else:
            body = {
                "name": "Farmaura sandbox", "url": url, "email": args.webhook_email or settings.smtp_from_email or "",
                "enabled": True, "interrupted": False, "authToken": settings.asaas_webhook_auth_token,
                "sendType": "SEQUENTIALLY", "events": WEBHOOK_EVENTS,
            }
            try:
                created = await asyncio.to_thread(client.create_webhook, body)
            except AsaasError as error:
                print(f"{FAIL} {describe_error(error)}")
                return 1
            print(f"{OK} webhook cadastrado (id {created.get('id')}), eventos: {len(WEBHOOK_EVENTS)}")

    step("4. Nota fiscal de serviço: pré-requisitos")
    try:
        info = await asyncio.to_thread(client.get_fiscal_info)
        print(f"{OK} conta com configuração fiscal: município {info.get('city') or info.get('municipalInscription') or 'informado'}")
    except AsaasError as error:
        print(f"{WARN} configuração fiscal da conta não encontrada ({describe_error(error)}). "
              "Configure em Asaas sandbox > Notas fiscais > Configurações antes de agendar notas.")
    if args.services is not None:
        try:
            services = await asyncio.to_thread(client.list_municipal_services, description=args.services)
        except AsaasError as error:
            print(f"{FAIL} {describe_error(error)}")
            services = []
        for service in services[:30]:
            print(f"     id={service.get('id')}  {service.get('description') or service.get('name')}")
        print("     -> copie o id para APP_ASAAS_INVOICE_MUNICIPAL_SERVICE_ID e o nome para ..._SERVICE_NAME")
    payload, missing = build_invoice_payload(
        settings, payment_id="pay_exemplo", value=Decimal("10"), description="Teste", effective_date=datetime.now(UTC).date(),
    )
    if payload is None:
        print(f"{WARN} para emitir a nota falta configurar: " + "; ".join(m for m in missing if "cobrança" not in m))
    else:
        print(f"{OK} variáveis da nota completas (municipalService{'Id' if 'municipalServiceId' in payload else 'Code'})")

    if args.charge:
        bind_contextvars(client_ip=args.remote_ip)
        step("5. Cobranças no sandbox (código real do PaymentService)")
        amount = Decimal(args.amount)
        try:
            remote = await asyncio.to_thread(client.upsert_customer, {
                "name": "Cliente Teste Sandbox", "email": "cliente.sandbox@example.com", "cpfCnpj": generate_cpf(),
                "phone": "6133334444", "externalReference": "farmaura-sandbox-check",
            })
        except AsaasError as error:
            print(f"{FAIL} cliente: {describe_error(error)}")
            return 1
        customer_id = str(remote.get("id"))
        print(f"{OK} cliente sandbox {customer_id}")
        customer = SimpleNamespace(payment_provider_customer_id=customer_id)
        service = PaymentService(None)  # type: ignore[arg-type]  # no database is used by these two calls
        if args.charge in ("pix", "both"):
            try:
                charge = await service.charge_pix(
                    customer=customer, amount=amount, external_reference="sandbox-pix", description="Teste Pix sandbox",
                )
            except Exception as error:  # noqa: BLE001 - HTTPException carries the provider message
                print(f"{FAIL} Pix: {getattr(error, 'detail', error)}")
                return 1
            print(f"{OK} Pix criado: {charge['payment_id']} (status {charge['status']})")
            print(f"     copia-e-cola: {charge['pix_copy_paste'][:60]}...")
            print("     >> No painel sandbox (Cobranças) clique em CONFIRMAR PAGAMENTO para simular o Pix.")
        if args.charge in ("card", "both", "card-decline"):
            number = DECLINE_CARD if args.charge == "card-decline" else APPROVE_CARD
            expiry = (datetime.now(UTC) + timedelta(days=800)).year
            try:
                token = await asyncio.to_thread(client.tokenize_credit_card, {
                    "customer": customer_id, "remoteIp": args.remote_ip,
                    "creditCard": {"holderName": "CLIENTE TESTE", "number": number, "expiryMonth": "12", "expiryYear": str(expiry), "ccv": "123"},
                    "creditCardHolderInfo": {
                        "name": "Cliente Teste Sandbox", "email": "cliente.sandbox@example.com", "cpfCnpj": generate_cpf(),
                        "postalCode": "70306915", "addressNumber": "100", "phone": "6133334444",
                    },
                })
            except AsaasError as error:
                print(f"{FAIL} tokenização: {describe_error(error)}")
                return 1
            print(f"{OK} cartão tokenizado (final {token.get('creditCardNumber')}, {token.get('creditCardBrand')})")
            try:
                card = await service.charge_card(
                    customer=customer, provider_token=str(token.get("creditCardToken")), billing_type="CREDIT_CARD",
                    amount=amount, external_reference="sandbox-card", description="Teste cartão sandbox",
                )
            except Exception as error:  # noqa: BLE001
                print(f"{'[ OK ]' if args.charge == 'card-decline' else FAIL} cartão: {getattr(error, 'detail', error)}")
                return 0 if args.charge == "card-decline" else 1
            print(f"{OK} cobrança no cartão: {card['payment_id']} (status {card['status']})")
            if card["status"] in ("CONFIRMED", "RECEIVED"):
                print("     cartão aprovado; guarde este id para testar a nota: --invoice " + card["payment_id"])

    if args.invoice:
        step("6. Agendar nota fiscal de serviço")
        payment_id = args.invoice.strip()
        try:
            remote_payment = await asyncio.to_thread(client.get_payment, payment_id)
        except AsaasError as error:
            print(f"{FAIL} cobrança: {describe_error(error)}")
            return 1
        payload, missing = build_invoice_payload(
            settings, payment_id=payment_id, value=Decimal(str(remote_payment.get("value") or 0)),
            description=f"Teste sandbox {payment_id}", effective_date=datetime.now(UTC).date(),
        )
        if payload is None:
            print(f"{FAIL} falta configurar: " + "; ".join(missing))
            return 1
        try:
            invoice = await asyncio.to_thread(client.schedule_invoice, payload)
        except AsaasError as error:
            print(f"{FAIL} {describe_error(error)}")
            return 1
        print(f"{OK} nota agendada: {invoice.get('id')} status {invoice.get('status')} "
              "(a emissão ocorre em até ~15 min; acompanhe INVOICE_AUTHORIZED no webhook)")

    if args.run_fiscal_tick:
        step("7. Emissão do documento fiscal dos pedidos com pagamento confirmado")
        if settings.fiscal_issuance_delay_days != 0:
            print(f"{WARN} APP_FISCAL_ISSUANCE_DELAY_DAYS={settings.fiscal_issuance_delay_days}: só entram pedidos pagos há "
                  "mais de N dias. Use 0 no sandbox para testar já.")
        from app.services.fiscal_scheduler import run_fiscal_scheduler_tick

        issued = await run_fiscal_scheduler_tick()
        print(f"{OK} documentos emitidos: {issued}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
