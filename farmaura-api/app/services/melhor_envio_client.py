"""
farmaura-api/app/services/melhor_envio_client.py

Melhor Envio client for Farmaura shipping operations.

Responsibilities:
- send authenticated requests to the Melhor Envio REST API;
- expose the shipment quote, cart, checkout, label, and tracking endpoints used by Farmaura;
- normalize transport failures into deterministic service errors.

Observations:
- Melhor Envio requires a descriptive User-Agent identifying the application and a
  contact channel on every request, or it rejects the call outright;
- this mirrors app/services/asaas_client.py exactly (same urllib-based transport,
  same error normalization shape) since both are the same class of integration.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from app.core.config import get_settings


# ============================================================================
# MELHOR ENVIO TYPES
# ============================================================================


class MelhorEnvioError(Exception):
    """Represent one normalized Melhor Envio transport or provider error."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 502,
        *,
        response_payload: Any = None,
    ) -> None:
        """Store the provider error details."""

        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.response_payload = response_payload


@dataclass(frozen=True, slots=True)
class MelhorEnvioApiResponse:
    """Represent one decoded Melhor Envio API response."""

    payload: Any
    status_code: int


# ============================================================================
# MELHOR ENVIO CLIENT
# ============================================================================


class MelhorEnvioClient:
    """Provide a minimal authenticated client for Melhor Envio shipping endpoints."""

    def __init__(self) -> None:
        """Load the current Melhor Envio settings snapshot."""

        settings = get_settings()
        self.enabled = bool(settings.melhor_envio_enabled)
        self.base_url = str(settings.melhor_envio_base_url or "").rstrip("/")
        self.access_token = str(settings.melhor_envio_access_token or "").strip()
        self.user_agent = str(settings.melhor_envio_user_agent or "").strip()

    def assert_configured(self) -> None:
        """Fail closed when the Melhor Envio integration is disabled or incomplete."""

        if not self.enabled:
            raise MelhorEnvioError("melhor_envio_disabled", "O envio por transportadora não está habilitado.", 503)
        if self.base_url == "" or self.access_token == "" or self.user_agent == "":
            raise MelhorEnvioError("melhor_envio_not_configured", "As credenciais do Melhor Envio não foram configuradas.", 503)

    def calculate_shipment(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        """Return real shipping quotes for one origin/destination/package payload."""

        self.assert_configured()
        result = self._request("POST", "/api/v2/me/shipment/calculate", payload=payload).payload
        return result if isinstance(result, list) else []

    def add_to_cart(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Add one purchased shipment service to the Melhor Envio cart."""

        self.assert_configured()
        return self._request("POST", "/api/v2/me/cart", payload=payload).payload

    def checkout_cart(self, order_ids: list[str]) -> dict[str, Any]:
        """Pay for the queued cart items, turning quotes into real purchased shipments."""

        self.assert_configured()
        return self._request("POST", "/api/v2/me/shipment/checkout", payload={"orders": order_ids}).payload

    def generate_label(self, order_ids: list[str]) -> dict[str, Any]:
        """Generate the shipping label for one or more purchased shipments."""

        self.assert_configured()
        return self._request("POST", "/api/v2/me/shipment/generate", payload={"orders": order_ids}).payload

    def print_label(self, order_ids: list[str]) -> dict[str, Any]:
        """Return the printable label URL for one or more generated shipments."""

        self.assert_configured()
        return self._request("POST", "/api/v2/me/shipment/print", payload={"orders": order_ids, "mode": "public"}).payload

    def track_shipment(self, order_ids: list[str]) -> dict[str, Any]:
        """Return the current tracking state for one or more purchased shipments."""

        self.assert_configured()
        return self._request("POST", "/api/v2/me/shipment/tracking", payload={"orders": order_ids}).payload

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> MelhorEnvioApiResponse:
        """Execute one Melhor Envio HTTP request and decode the JSON response."""

        url = f"{self.base_url}{path}"
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        req = request.Request(
            url,
            data=body,
            method=method.upper(),
            headers={
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": f"Bearer {self.access_token}",
                "user-agent": self.user_agent,
            },
        )
        try:
            with request.urlopen(req, timeout=20) as response:
                raw_body = response.read().decode("utf-8") or "{}"
                return MelhorEnvioApiResponse(payload=self._decode_json(raw_body), status_code=int(response.status))
        except error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8") if exc.fp is not None else "{}"
            decoded = self._decode_json(raw_body or "{}")
            message = self._extract_error_message(decoded) or "O Melhor Envio recusou a operação de frete."
            raise MelhorEnvioError(
                "melhor_envio_http_error",
                message,
                int(exc.code),
                response_payload=decoded,
            ) from exc
        except error.URLError as exc:
            raise MelhorEnvioError("melhor_envio_transport_error", "Falha de comunicação com o Melhor Envio.", 502) from exc

    def _decode_json(self, raw_body: str) -> Any:
        """Decode one provider JSON payload conservatively."""

        try:
            return json.loads(raw_body)
        except json.JSONDecodeError:
            return {}

    def _extract_error_message(self, payload: Any) -> str:
        """Return a readable provider error message when available."""

        if not isinstance(payload, dict):
            return ""
        for key in ("message", "error"):
            value = str(payload.get(key) or "").strip()
            if value:
                return value
        errors = payload.get("errors")
        if isinstance(errors, dict) and errors:
            first_key = next(iter(errors))
            first_value = errors[first_key]
            if isinstance(first_value, list) and first_value:
                return str(first_value[0])
        return ""
