"""
farmaura-api/app/services/asaas_client.py

Asaas client for Farmaura fiscal and payment operations.

Responsibilities:
- send authenticated requests to the Asaas REST API;
- expose the invoice, customer, card tokenization, and payment endpoints used by Farmaura;
- normalize transport failures into deterministic service errors.

Observations:
- invoice emission remains best-effort and must not block the core sale flow;
- card tokenization payloads carry raw PAN/CVV in-memory only for the duration of the
  request to Asaas; callers must never persist or log the raw fields, only the token
  Asaas returns.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any
from urllib import error, parse, request

from app.core.config import Settings, get_settings

PRODUCTION_HOST = "api.asaas.com"
SANDBOX_HOST = "api-sandbox.asaas.com"


# ============================================================================
# INVOICE PAYLOAD
# ============================================================================


def build_invoice_payload(
    settings: Settings, *, payment_id: str, value: Decimal, description: str, effective_date: date,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Build the `POST /v3/invoices` body per the Asaas docs, or return what is missing.

    The invoice is bound to the Asaas CHARGE (`payment` = `pay_...`); Asaas takes the customer from it.
    Docs: `municipalServiceId` whenever the city has a service list, otherwise `municipalServiceCode`;
    `municipalServiceName`, `value`, `deductions` and `effectiveDate` are always sent.
    """

    service_id = str(settings.asaas_invoice_municipal_service_id or "").strip()
    service_code = str(settings.asaas_invoice_municipal_service_code or "").strip()
    service_name = str(settings.asaas_invoice_municipal_service_name or "").strip()
    problems: list[str] = []
    if not payment_id.startswith("pay_"):
        problems.append("o pedido não tem cobrança Asaas (gateway_payment_id)")
    if not service_id and not service_code:
        problems.append("APP_ASAAS_INVOICE_MUNICIPAL_SERVICE_ID ou APP_ASAAS_INVOICE_MUNICIPAL_SERVICE_CODE")
    if not service_name:
        problems.append("APP_ASAAS_INVOICE_MUNICIPAL_SERVICE_NAME")
    if problems:
        return None, problems
    payload: dict[str, Any] = {
        "payment": payment_id,
        "serviceDescription": description,
        "observations": settings.asaas_invoice_observations or description,
        "value": float(Decimal(value or 0)),
        "deductions": 0,
        "effectiveDate": effective_date.isoformat(),
        "municipalServiceName": service_name,
        "taxes": {
            "retainIss": bool(settings.asaas_invoice_retain_iss),
            "iss": settings.asaas_invoice_iss,
            "cofins": settings.asaas_invoice_cofins,
            "csll": settings.asaas_invoice_csll,
            "inss": settings.asaas_invoice_inss,
            "ir": settings.asaas_invoice_ir,
            "pis": settings.asaas_invoice_pis,
        },
    }
    if service_id:
        payload["municipalServiceId"] = service_id
    else:
        payload["municipalServiceCode"] = service_code
    return payload, []


# ============================================================================
# ASAAS TYPES
# ============================================================================


class AsaasError(Exception):
    """Represent one normalized Asaas transport or provider error."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 502,
        *,
        response_payload: dict[str, Any] | None = None,
    ) -> None:
        """Store the provider error details."""

        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.response_payload = response_payload or {}


@dataclass(frozen=True, slots=True)
class AsaasApiResponse:
    """Represent one decoded Asaas API response."""

    payload: dict[str, Any]
    status_code: int
    headers: dict[str, str]


# ============================================================================
# ASAAS CLIENT
# ============================================================================


class AsaasClient:
    """Provide a minimal authenticated client for Asaas fiscal endpoints."""

    def __init__(self) -> None:
        """Load the current Asaas settings snapshot."""

        settings = get_settings()
        self.enabled = bool(settings.asaas_enabled)
        self.base_url = str(settings.asaas_base_url or "").rstrip("/")
        self.access_token = str(settings.asaas_access_token or "").strip()
        self.environment = str(settings.environment or "").strip().lower()

    def assert_configured(self) -> None:
        """Fail closed when the Asaas integration is disabled or incomplete."""

        if not self.enabled:
            raise AsaasError("asaas_disabled", "A integração fiscal com o Asaas não está habilitada.", 503)
        if self.base_url == "" or self.access_token == "":
            raise AsaasError("asaas_not_configured", "As credenciais do Asaas não foram configuradas.", 503)
        if self.is_production_host and self.environment != "production":
            # A real API key in dev/staging/docker would charge REAL cards and issue REAL invoices.
            raise AsaasError(
                "asaas_production_blocked",
                "O Asaas de produção só pode ser usado com APP_ENV=production. Use https://api-sandbox.asaas.com.",
                503,
            )

    @property
    def is_production_host(self) -> bool:
        """Return whether the configured base URL is Asaas' production API."""

        host = parse.urlparse(self.base_url).hostname or ""
        return host == PRODUCTION_HOST

    @property
    def is_sandbox(self) -> bool:
        """Return whether the configured base URL is Asaas' sandbox API."""

        return (parse.urlparse(self.base_url).hostname or "") == SANDBOX_HOST

    def list_invoices(self, *, payment_id: str | None = None) -> list[dict[str, Any]]:
        """Return the remote invoices optionally filtered by payment identifier."""

        self.assert_configured()
        query: dict[str, Any] = {}
        if str(payment_id or "").strip() != "":
            query["payment"] = str(payment_id).strip()
        payload = self._request("GET", "/v3/invoices", query=query).payload
        data = payload.get("data")
        return data if isinstance(data, list) else []

    def schedule_invoice(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create or schedule one invoice in Asaas."""

        self.assert_configured()
        return self._request("POST", "/v3/invoices", payload=payload).payload

    def upsert_customer(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create one Asaas customer record for payment and tokenization operations."""

        self.assert_configured()
        return self._request("POST", "/v3/customers", payload=payload).payload

    def tokenize_credit_card(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Tokenize one credit or debit card and return the reusable Asaas token.

        The payload carries raw card fields (number, CVV) that exist only for the
        duration of this call; the response contains only the token/brand/last-4
        that Farmaura is allowed to persist.
        """

        self.assert_configured()
        return self._request("POST", "/v3/creditCard/tokenizeCreditCard", payload=payload).payload

    def create_payment(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create one Pix or tokenized card payment in Asaas."""

        self.assert_configured()
        return self._request("POST", "/v3/payments", payload=payload).payload

    def create_subscription(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create one recurring subscription in Asaas.

        Asaas itself generates and charges a new payment every cycle against the
        tokenized card on file — Farmaura does not need its own scheduler/cron for the
        recurring charge itself, only to react to the resulting payment webhooks.
        """

        self.assert_configured()
        return self._request("POST", "/v3/subscriptions", payload=payload).payload

    def get_pix_qrcode(self, payment_id: str) -> dict[str, Any]:
        """Return the Pix QR code payload for one previously created payment."""

        self.assert_configured()
        return self._request("GET", f"/v3/payments/{payment_id}/pixQrCode").payload

    def ping(self) -> dict[str, Any]:
        """Cheapest authenticated read: proves the base URL and access token work."""

        self.assert_configured()
        return self._request("GET", "/v3/customers", query={"limit": 1}).payload

    def list_webhooks(self) -> list[dict[str, Any]]:
        """Return the webhooks registered on the Asaas account."""

        self.assert_configured()
        data = self._request("GET", "/v3/webhooks").payload.get("data")
        return data if isinstance(data, list) else []

    def create_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Register one webhook (`authToken` is echoed back by Asaas in the `asaas-access-token` header)."""

        self.assert_configured()
        return self._request("POST", "/v3/webhooks", payload=payload).payload

    def get_fiscal_info(self) -> dict[str, Any]:
        """Return the account's invoice (NFS-e) configuration; empty/404 when it was never configured."""

        self.assert_configured()
        return self._request("GET", "/v3/fiscalInfo").payload

    def list_municipal_services(self, *, description: str = "") -> list[dict[str, Any]]:
        """List the municipal services the account can issue invoices for (`id` = `municipalServiceId`)."""

        self.assert_configured()
        query: dict[str, Any] = {"limit": 100}
        if description.strip():
            query["description"] = description.strip()
        data = self._request("GET", "/v3/fiscalInfo/services", query=query).payload.get("data")
        return data if isinstance(data, list) else []

    def get_payment(self, payment_id: str) -> dict[str, Any]:
        """Return the current remote state of one payment."""

        self.assert_configured()
        return self._request("GET", f"/v3/payments/{payment_id}").payload

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> AsaasApiResponse:
        """Execute one Asaas HTTP request and decode the JSON response."""

        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{parse.urlencode(query)}"
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        req = request.Request(
            url,
            data=body,
            method=method.upper(),
            headers={
                "accept": "application/json",
                "content-type": "application/json",
                "access_token": self.access_token,
                "user-agent": "farmaura-fiscal/1.0",
            },
        )
        try:
            with request.urlopen(req, timeout=20) as response:
                raw_body = response.read().decode("utf-8") or "{}"
                return AsaasApiResponse(
                    payload=self._decode_json(raw_body),
                    status_code=int(response.status),
                    headers={key.lower(): value for key, value in response.headers.items()},
                )
        except error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8") if exc.fp is not None else "{}"
            decoded = self._decode_json(raw_body or "{}")
            message = self._extract_error_message(decoded) or "O Asaas recusou a operação fiscal."
            raise AsaasError(
                "asaas_http_error",
                message,
                int(exc.code),
                response_payload=decoded,
            ) from exc
        except error.URLError as exc:
            raise AsaasError("asaas_transport_error", "Falha de comunicação com o Asaas.", 502) from exc

    def _decode_json(self, raw_body: str) -> dict[str, Any]:
        """Decode one provider JSON payload conservatively."""

        try:
            decoded = json.loads(raw_body)
        except json.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}

    def _extract_error_message(self, payload: dict[str, Any]) -> str:
        """Return a readable provider error message when available."""

        for key in ("message", "error", "description"):
            value = str(payload.get(key) or "").strip()
            if value:
                return value
        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            first = errors[0]
            if isinstance(first, dict):
                for key in ("description", "message", "code"):
                    value = str(first.get(key) or "").strip()
                    if value:
                        return value
        return ""
