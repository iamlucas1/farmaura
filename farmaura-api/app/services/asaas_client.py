"""
farmaura-api/app/services/asaas_client.py

Minimal Asaas client for Farmaura fiscal operations.

Responsibilities:
- send authenticated requests to the Asaas REST API;
- expose the invoice endpoints used by Farmaura fiscal issuance;
- normalize transport failures into deterministic service errors.

Observations:
- this client intentionally covers only the fiscal surface required by Farmaura;
- invoice emission remains best-effort and must not block the core sale flow.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request

from app.core.config import get_settings


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

    def assert_configured(self) -> None:
        """Fail closed when the Asaas integration is disabled or incomplete."""

        if not self.enabled:
            raise AsaasError("asaas_disabled", "A integração fiscal com o Asaas não está habilitada.", 503)
        if self.base_url == "" or self.access_token == "":
            raise AsaasError("asaas_not_configured", "As credenciais do Asaas não foram configuradas.", 503)

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
