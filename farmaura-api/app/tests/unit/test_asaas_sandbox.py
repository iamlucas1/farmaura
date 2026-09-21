"""
farmaura-api/app/tests/unit/test_asaas_sandbox.py

Asaas sandbox-readiness tests for Farmaura (no network, no database).

Responsibilities:
- prove the production Asaas API can never be used outside APP_ENV=production;
- prove the invoice payload matches the documented Asaas format (charge id, service name, taxes);
- prove an invoice failure is visible in the log but never breaks the order flow;
- prove card charges carry `remoteIp`/`dueDate`, Pix carries `dueDate`, and no IP is ever invented;
- prove the webhook rejects a missing/wrong token and a source IP outside the allowlist;

Observations:
- payloads are captured from fake clients; the shapes were checked against docs.asaas.com on 2026-09-20;
"""

import logging
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from structlog.contextvars import bind_contextvars, clear_contextvars

from app.core.config import Settings
from app.services.asaas_client import AsaasClient, AsaasError, build_invoice_payload
from app.services.fiscal_service import FiscalService
from app.services.payment_service import PaymentService


def invoice_settings(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "asaas_enabled": True, "asaas_invoice_enabled": True, "asaas_invoice_municipal_service_id": "21234",
        "asaas_invoice_municipal_service_code": "", "asaas_invoice_municipal_service_name": "Comércio varejista",
        "asaas_invoice_observations": "", "asaas_invoice_retain_iss": False, "asaas_invoice_iss": 3.0,
        "asaas_invoice_pis": 0.65, "asaas_invoice_cofins": 3.0, "asaas_invoice_csll": 1.0, "asaas_invoice_inss": 0.0,
        "asaas_invoice_ir": 1.5,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


# ============================================================================
# SANDBOX / PRODUCTION GUARD
# ============================================================================


def client(base_url: str, environment: str, *, token: str = "$aact_hmlg_x", enabled: bool = True) -> AsaasClient:
    instance = AsaasClient()
    instance.enabled, instance.base_url, instance.access_token, instance.environment = enabled, base_url, token, environment
    return instance


@pytest.mark.parametrize("environment", ["development", "docker", "staging", "local", ""])
def test_production_asaas_is_refused_outside_production(environment: str) -> None:
    blocked = client("https://api.asaas.com", environment)
    assert blocked.is_production_host and not blocked.is_sandbox
    with pytest.raises(AsaasError) as raised:
        blocked.assert_configured()
    assert raised.value.code == "asaas_production_blocked" and raised.value.status_code == 503


def test_production_asaas_is_allowed_only_in_production_and_sandbox_everywhere() -> None:
    client("https://api.asaas.com", "production").assert_configured()
    for environment in ("development", "docker", "staging", "production"):
        sandbox = client("https://api-sandbox.asaas.com", environment)
        sandbox.assert_configured()
        assert sandbox.is_sandbox and not sandbox.is_production_host


def test_disabled_or_unconfigured_client_fails_closed() -> None:
    with pytest.raises(AsaasError, match="não está habilitada"):
        client("https://api-sandbox.asaas.com", "docker", enabled=False).assert_configured()
    with pytest.raises(AsaasError, match="credenciais"):
        client("https://api-sandbox.asaas.com", "docker", token="").assert_configured()


def test_lookalike_hosts_are_not_treated_as_production_or_sandbox() -> None:
    fake = client("https://api.asaas.com.evil.example", "development")
    assert not fake.is_production_host and not fake.is_sandbox


def test_fiscal_issuance_delay_defaults_to_the_cdc_window_and_is_bounded() -> None:
    field = Settings.model_fields["fiscal_issuance_delay_days"]
    assert field.default == 7
    bounds = {type(item).__name__: item for item in field.metadata}
    assert bounds["Ge"].ge == 0 and bounds["Le"].le == 30


# ============================================================================
# INVOICE PAYLOAD
# ============================================================================


def test_invoice_payload_follows_the_documented_format() -> None:
    payload, missing = build_invoice_payload(
        invoice_settings(), payment_id="pay_637959110194", value=Decimal("300.00"),
        description="Pedido marketplace FA-1", effective_date=date(2026, 9, 21),
    )
    assert missing == [] and payload is not None
    assert payload["payment"] == "pay_637959110194" and "customer" not in payload
    assert payload["municipalServiceId"] == "21234" and "municipalServiceCode" not in payload
    assert payload["municipalServiceName"] == "Comércio varejista"
    assert payload["value"] == 300.0 and payload["deductions"] == 0 and payload["effectiveDate"] == "2026-09-21"
    assert payload["taxes"] == {"retainIss": False, "iss": 3.0, "cofins": 3.0, "csll": 1.0, "inss": 0.0, "ir": 1.5, "pis": 0.65}
    assert payload["observations"] == "Pedido marketplace FA-1"


def test_invoice_payload_uses_the_code_only_when_there_is_no_service_list() -> None:
    payload, _ = build_invoice_payload(
        invoice_settings(asaas_invoice_municipal_service_id="", asaas_invoice_municipal_service_code="1.01"),
        payment_id="pay_1", value=Decimal("1"), description="x", effective_date=date(2026, 9, 21),
    )
    assert payload is not None and payload["municipalServiceCode"] == "1.01" and "municipalServiceId" not in payload


def test_invoice_payload_reports_what_is_missing_and_never_uses_the_order_code_as_payment() -> None:
    payload, missing = build_invoice_payload(
        invoice_settings(asaas_invoice_municipal_service_id="", asaas_invoice_municipal_service_name=""),
        payment_id="FA-1005", value=Decimal("1"), description="x", effective_date=date(2026, 9, 21),
    )
    assert payload is None
    text = " ".join(missing)
    assert "gateway_payment_id" in text and "SERVICE_ID" in text and "SERVICE_NAME" in text


def make_fiscal_service(asaas: MagicMock, **settings: object) -> FiscalService:
    service = FiscalService(MagicMock())
    service.settings = invoice_settings(**settings)  # type: ignore[assignment]
    service.asaas_client = asaas
    return service


@pytest.mark.anyio
async def test_invoice_is_scheduled_on_the_asaas_charge() -> None:
    asaas = MagicMock()
    asaas.schedule_invoice.return_value = {"id": "inv_1", "status": "SCHEDULED"}
    await make_fiscal_service(asaas)._schedule_asaas_invoice(
        order_code="FA-1", payment_id="pay_abc", gross_total_amount=Decimal("50.00"), description="Pedido FA-1",
    )
    sent = asaas.schedule_invoice.call_args.args[0]
    assert sent["payment"] == "pay_abc" and sent["value"] == 50.0


@pytest.mark.anyio
async def test_invoice_failure_is_logged_and_never_raised(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="farmaura.fiscal")
    asaas = MagicMock()
    asaas.schedule_invoice.side_effect = AsaasError("asaas_http_error", "Configure as informações fiscais da conta.", 400)
    await make_fiscal_service(asaas)._schedule_asaas_invoice(
        order_code="FA-2", payment_id="pay_abc", gross_total_amount=Decimal("5.00"), description="x",
    )
    assert "asaas invoice failed order=FA-2 http=400" in caplog.text and "Configure as informações fiscais" in caplog.text


@pytest.mark.anyio
async def test_invoice_is_skipped_loudly_when_disabled_or_incomplete(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="farmaura.fiscal")
    asaas = MagicMock()
    await make_fiscal_service(asaas, asaas_invoice_enabled=False)._schedule_asaas_invoice(
        order_code="FA-3", payment_id="pay_abc", gross_total_amount=Decimal("5"), description="x",
    )
    await make_fiscal_service(asaas, asaas_invoice_municipal_service_name="")._schedule_asaas_invoice(
        order_code="FA-4", payment_id="pay_abc", gross_total_amount=Decimal("5"), description="x",
    )
    asaas.schedule_invoice.assert_not_called()
    assert "asaas invoice skipped order=FA-4" in caplog.text and "SERVICE_NAME" in caplog.text


# ============================================================================
# CHARGE PAYLOADS
# ============================================================================


def make_payment_service() -> tuple[PaymentService, MagicMock]:
    service = PaymentService(MagicMock())
    asaas = MagicMock()
    asaas.create_payment.return_value = {"id": "pay_1", "status": "PENDING"}
    asaas.get_pix_qrcode.return_value = {"encodedImage": "img", "payload": "000201..."}
    service.asaas_client = asaas
    return service, asaas


CUSTOMER = SimpleNamespace(payment_provider_customer_id="cus_1")


@pytest.mark.anyio
async def test_pix_charge_sends_due_date() -> None:
    service, asaas = make_payment_service()
    await service.charge_pix(customer=CUSTOMER, amount=Decimal("10.50"), external_reference="FA-1", description="x")
    sent = asaas.create_payment.call_args.args[0]
    assert sent["billingType"] == "PIX" and sent["value"] == 10.5 and len(sent["dueDate"]) == 10


@pytest.mark.anyio
async def test_card_charge_sends_remote_ip_and_due_date_when_the_ip_is_known() -> None:
    service, asaas = make_payment_service()
    bind_contextvars(client_ip="187.1.2.3")
    try:
        await service.charge_card(
            customer=CUSTOMER, provider_token="tok", billing_type="CREDIT_CARD", amount=Decimal("5"),
            external_reference="FA-2", description="x",
        )
    finally:
        clear_contextvars()
    sent = asaas.create_payment.call_args.args[0]
    assert sent["remoteIp"] == "187.1.2.3" and sent["creditCardToken"] == "tok" and len(sent["dueDate"]) == 10


@pytest.mark.anyio
async def test_card_charge_never_invents_an_ip() -> None:
    service, asaas = make_payment_service()
    clear_contextvars()
    await service.charge_card(
        customer=CUSTOMER, provider_token="tok", billing_type="CREDIT_CARD", amount=Decimal("5"),
        external_reference="FA-3", description="x",
    )
    assert "remoteIp" not in asaas.create_payment.call_args.args[0]


def test_only_confirmed_statuses_approve_an_order() -> None:
    service, _ = make_payment_service()
    assert service.resolve_order_payment_status("CONFIRMED") == "approved"
    assert service.resolve_order_payment_status("RECEIVED") == "approved"
    assert service.resolve_order_payment_status("PENDING") == "pending"


# ============================================================================
# WEBHOOK AUTHENTICATION
# ============================================================================


def webhook_service(token: str = "s" * 40, allowed_ips: str = "") -> PaymentService:
    service = PaymentService(MagicMock())
    service.settings = SimpleNamespace(asaas_webhook_auth_token=token, asaas_webhook_allowed_ips=allowed_ips)  # type: ignore[assignment]
    return service


def test_webhook_without_configured_secret_is_unavailable_not_open() -> None:
    with pytest.raises(HTTPException) as raised:
        webhook_service(token="")._verify_webhook_auth({"asaas-access-token": ""})
    assert raised.value.status_code == 503


def test_webhook_requires_the_exact_token_header() -> None:
    service = webhook_service()
    for headers in ({}, {"asaas-access-token": "errado"}, {"asaas-access-token": "s" * 39}):
        with pytest.raises(HTTPException) as raised:
            service._verify_webhook_auth(headers)
        assert raised.value.status_code == 401
    service._verify_webhook_auth({"Asaas-Access-Token": "s" * 40})


def test_webhook_ip_allowlist() -> None:
    service = webhook_service(allowed_ips="52.67.12.206, 10.0.0.0/8")
    service._verify_webhook_source_ip("52.67.12.206")
    service._verify_webhook_source_ip("10.1.2.3")
    for ip in ("8.8.8.8", "not-an-ip", ""):
        with pytest.raises(HTTPException) as raised:
            service._verify_webhook_source_ip(ip)
        assert raised.value.status_code == 403
    webhook_service()._verify_webhook_source_ip("8.8.8.8")  # empty allowlist = token is the only control
