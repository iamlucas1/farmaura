"""
farmaura-api/app/services/payment_service.py

Payment processing service for Farmaura.

Responsibilities:
- ensure a Farmaura customer has a matching Asaas customer record;
- create real Pix and tokenized-card charges through Asaas;
- normalize Asaas payment status into the two states Farmaura tracks (pending/approved);
- process inbound Asaas payment webhooks idempotently.

Observations:
- charge calls run through asyncio.to_thread since AsaasClient is a synchronous urllib client;
- webhook authentication mirrors the lumos-api pattern: a static shared-secret header
  compared against configuration, plus an optional source-IP allowlist — not HMAC.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from ipaddress import ip_address, ip_network
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.tenant_context import apply_webhook_context
from app.domain.validators import normalize_cpf
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment_webhook_event import PaymentWebhookEvent
from app.services.asaas_client import AsaasClient, AsaasError


# ============================================================================
# CONSTANTS
# ============================================================================


CONFIRMED_PAYMENT_EVENT_STATUSES = {"CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"}
APPROVED_ORDER_PAYMENT_STATUS = "approved"
PENDING_ORDER_PAYMENT_STATUS = "pending"
OVERDUE_ORDER_PAYMENT_STATUS = "overdue"
REFUNDED_ORDER_PAYMENT_STATUS = "refunded"


# ============================================================================
# PAYMENT SERVICE
# ============================================================================


class PaymentService:
    """Provide real payment charge and webhook processing use-cases."""

    def __init__(self, session: AsyncSession) -> None:
        """Store shared dependencies."""

        self.session = session
        self.settings = get_settings()
        self.asaas_client = AsaasClient()

    async def ensure_provider_customer(self, customer: Customer) -> str:
        """Return the Asaas customer id for one Farmaura customer, provisioning it when absent."""

        if customer.payment_provider_customer_id:
            return customer.payment_provider_customer_id
        try:
            remote_customer = await asyncio.to_thread(
                self.asaas_client.upsert_customer,
                {
                    "name": customer.full_name,
                    "email": customer.email,
                    "cpfCnpj": normalize_cpf(customer.cpf or ""),
                    "phone": customer.phone,
                    "externalReference": customer.id,
                },
            )
        except AsaasError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error
        provider_customer_id = str(remote_customer.get("id") or "")
        if not provider_customer_id:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="O Asaas não retornou um cliente válido.")
        customer.payment_provider_customer_id = provider_customer_id
        self.session.add(customer)
        await self.session.flush()
        return provider_customer_id

    async def charge_pix(
        self, *, customer: Customer, amount: Decimal, external_reference: str, description: str,
    ) -> dict[str, Any]:
        """Create one Pix payment and return its state plus QR code data."""

        provider_customer_id = await self.ensure_provider_customer(customer)
        try:
            payment = await asyncio.to_thread(
                self.asaas_client.create_payment,
                {
                    "customer": provider_customer_id,
                    "billingType": "PIX",
                    "value": float(amount),
                    "description": description,
                    "externalReference": external_reference,
                },
            )
            payment_id = str(payment.get("id") or "")
            qr_code = await asyncio.to_thread(self.asaas_client.get_pix_qrcode, payment_id) if payment_id else {}
        except AsaasError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error
        return {
            "payment_id": payment_id,
            "status": str(payment.get("status") or ""),
            "pix_qr_code": str(qr_code.get("encodedImage") or ""),
            "pix_copy_paste": str(qr_code.get("payload") or ""),
        }

    async def charge_card(
        self,
        *,
        customer: Customer,
        provider_token: str,
        billing_type: str,
        amount: Decimal,
        external_reference: str,
        description: str,
    ) -> dict[str, Any]:
        """Create one tokenized card payment and return its resulting state."""

        provider_customer_id = await self.ensure_provider_customer(customer)
        try:
            payment = await asyncio.to_thread(
                self.asaas_client.create_payment,
                {
                    "customer": provider_customer_id,
                    "billingType": billing_type,
                    "value": float(amount),
                    "description": description,
                    "externalReference": external_reference,
                    "creditCardToken": provider_token,
                },
            )
        except AsaasError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error
        return {
            "payment_id": str(payment.get("id") or ""),
            "status": str(payment.get("status") or ""),
        }

    def resolve_order_payment_status(self, provider_status: str) -> str:
        """Map one Asaas payment status onto the Farmaura order payment status."""

        if provider_status in CONFIRMED_PAYMENT_EVENT_STATUSES:
            return APPROVED_ORDER_PAYMENT_STATUS
        return PENDING_ORDER_PAYMENT_STATUS

    async def process_webhook_event(
        self, *, headers: dict[str, str], source_ip: str, event_payload: dict[str, Any],
    ) -> None:
        """Validate, deduplicate, and apply one inbound Asaas webhook event."""

        self._verify_webhook_auth(headers)
        self._verify_webhook_source_ip(source_ip)
        event_name = str(event_payload.get("event") or "")
        payment_payload = event_payload.get("payment")
        if not event_name or not isinstance(payment_payload, dict):
            return
        external_id = str(payment_payload.get("id") or "")
        if not external_id:
            return
        already_processed = await self._is_duplicate_event(source="asaas", event_name=event_name, external_id=external_id)
        if already_processed:
            return
        await self._record_event(source="asaas", event_name=event_name, external_id=external_id)
        await self._apply_payment_event(event_name=event_name, payment_payload=payment_payload)
        await self.session.commit()

    def _verify_webhook_auth(self, headers: dict[str, str]) -> None:
        """Fail closed unless the configured shared-secret webhook token is present."""

        expected_token = str(self.settings.asaas_webhook_auth_token or "").strip()
        if not expected_token:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook de pagamento não configurado.")
        normalized_headers = {key.lower(): value for key, value in headers.items()}
        received_token = normalized_headers.get("asaas-access-token", "").strip()
        if received_token != expected_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de webhook inválido.")

    def _verify_webhook_source_ip(self, source_ip: str) -> None:
        """Fail closed when an IP allowlist is configured and the source falls outside it."""

        allowed_ranges = [entry.strip() for entry in str(self.settings.asaas_webhook_allowed_ips or "").split(",") if entry.strip()]
        if not allowed_ranges:
            return
        try:
            candidate = ip_address(source_ip)
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origem do webhook inválida.") from error
        for entry in allowed_ranges:
            try:
                if candidate in ip_network(entry, strict=False):
                    return
            except ValueError:
                continue
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origem do webhook não autorizada.")

    async def _is_duplicate_event(self, *, source: str, event_name: str, external_id: str) -> bool:
        """Return True when this exact webhook event was already processed."""

        statement = select(PaymentWebhookEvent).where(
            PaymentWebhookEvent.source == source,
            PaymentWebhookEvent.event_name == event_name,
            PaymentWebhookEvent.external_id == external_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none() is not None

    async def _record_event(self, *, source: str, event_name: str, external_id: str) -> None:
        """Persist one processed webhook event marker for idempotency."""

        self.session.add(
            PaymentWebhookEvent(
                id=str(uuid4()),
                source=source,
                event_name=event_name,
                external_id=external_id,
                processed_at=datetime.now(UTC),
            )
        )
        await self.session.flush()

    async def _apply_payment_event(self, *, event_name: str, payment_payload: dict[str, Any]) -> None:
        """Apply one payment webhook event onto the matching Farmaura order."""

        gateway_payment_id = str(payment_payload.get("id") or "")
        if not gateway_payment_id:
            return
        await apply_webhook_context(self.session, gateway_payment_id)
        statement = select(Order).where(Order.gateway_payment_id == gateway_payment_id).limit(1)
        result = await self.session.execute(statement)
        order = result.scalar_one_or_none()
        if order is None:
            return
        if event_name in ("PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"):
            order.payment_status = APPROVED_ORDER_PAYMENT_STATUS
            order.payment_confirmed_at = datetime.now(UTC)
        elif event_name == "PAYMENT_OVERDUE":
            order.payment_status = OVERDUE_ORDER_PAYMENT_STATUS
        elif event_name in ("PAYMENT_DELETED", "PAYMENT_REFUNDED"):
            order.payment_status = REFUNDED_ORDER_PAYMENT_STATUS
            order.payment_confirmed_at = None
        self.session.add(order)
        await self.session.flush()
