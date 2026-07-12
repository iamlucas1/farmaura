"""
farmaura-api/app/services/fiscal_service.py

Fiscal issuance service for Farmaura.

Responsibilities:
- issue tenant-scoped fiscal documents for marketplace and PDV sales;
- reuse the Asaas fiscal integration on a best-effort basis after payment confirmation;
- expose lookup, printing, and e-mail delivery helpers for issued documents.

Observations:
- fiscal issuance is idempotent per order or PDV sale;
- provider failures must not roll back the paid transaction already accepted by Farmaura.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha1
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.customer import Customer
from app.models.fiscal_document import FiscalDocument
from app.models.order import Order
from app.models.pdv_sale import PdvSale
from app.schemas.fiscal import FiscalDocumentEmailResponse, FiscalDocumentResponse
from app.services.asaas_client import AsaasClient, AsaasError
from app.services.notification_service import NotificationService


# ============================================================================
# FISCAL SERVICE
# ============================================================================


class FiscalService:
    """Provide fiscal issuance and notification flows."""

    def __init__(self, session: AsyncSession) -> None:
        """Store shared dependencies."""

        self.session = session
        self.settings = get_settings()
        self.asaas_client = AsaasClient()
        self.notification_service = NotificationService()

    async def issue_for_order(self, *, order: Order, customer: Customer | None) -> FiscalDocument:
        """Issue or return the fiscal document associated with one marketplace order."""

        existing = await self._get_by_order_id(order.id)
        if existing is not None:
            return existing
        document = FiscalDocument(
            id=str(uuid4()),
            tenant_id=order.tenant_id,
            store_id=order.store_id,
            document_type="nfce",
            source_channel="marketplace",
            pdv_sale_id=None,
            order_id=order.id,
            issued_by_user_id=None,
            customer_id=order.customer_id,
            document_number=self._build_document_number(seed=order.order_code),
            access_key=self._build_access_key(seed=order.id),
            series_code="001",
            issue_datetime_label=self._format_issue_label(),
            payment_method_snapshot=order.payment_method_label,
            recipient_name_snapshot=order.customer_display_name,
            recipient_document_snapshot=order.customer_document_snapshot,
            gross_total_amount=Decimal(order.total_amount or 0),
            approximate_tax_amount=self._estimate_tax(order.total_amount),
            authorized=True,
        )
        self.session.add(document)
        await self.session.flush()
        await self._schedule_asaas_invoice(
            external_reference=order.order_code,
            payment_method_label=order.payment_method_label,
            gross_total_amount=Decimal(order.total_amount or 0),
            recipient_name=order.customer_display_name,
            recipient_email=(customer.email if customer else order.customer_email_snapshot),
            description=f"Pedido marketplace {order.order_code}",
        )
        return document

    async def issue_for_pdv_sale(self, *, sale: PdvSale) -> FiscalDocument:
        """Issue or return the fiscal document associated with one PDV sale."""

        existing = await self._get_by_pdv_sale_id(sale.id)
        if existing is not None:
            return existing
        document = FiscalDocument(
            id=str(uuid4()),
            tenant_id=sale.tenant_id,
            store_id=sale.store_id,
            document_type="nfce",
            source_channel="pdv",
            pdv_sale_id=sale.id,
            order_id=None,
            issued_by_user_id=sale.cashier_user_id,
            customer_id=sale.customer_id,
            document_number=self._build_document_number(seed=sale.sale_code),
            access_key=self._build_access_key(seed=sale.id),
            series_code="001",
            issue_datetime_label=self._format_issue_label(),
            payment_method_snapshot=sale.payment_method,
            recipient_name_snapshot=sale.customer_display_name,
            recipient_document_snapshot=sale.customer_document_snapshot if sale.include_cpf_on_invoice else "",
            gross_total_amount=Decimal(sale.total_amount or 0),
            approximate_tax_amount=self._estimate_tax(sale.total_amount),
            authorized=True,
        )
        self.session.add(document)
        await self.session.flush()
        await self._schedule_asaas_invoice(
            external_reference=sale.sale_code,
            payment_method_label=sale.payment_method,
            gross_total_amount=Decimal(sale.total_amount or 0),
            recipient_name=sale.customer_display_name,
            recipient_email="",
            description=f"Venda PDV {sale.sale_code}",
        )
        return document

    async def map_by_order_ids(self, *, order_ids: list[str]) -> dict[str, FiscalDocumentResponse]:
        """Return issued fiscal documents keyed by order identifier."""

        if not order_ids:
            return {}
        rows = (
            await self.session.execute(select(FiscalDocument).where(FiscalDocument.order_id.in_(order_ids)))
        ).scalars().all()
        return {row.order_id: self.serialize_document(row) for row in rows if row.order_id}

    async def map_by_pdv_sale_ids(self, *, pdv_sale_ids: list[str]) -> dict[str, FiscalDocumentResponse]:
        """Return issued fiscal documents keyed by PDV sale identifier."""

        if not pdv_sale_ids:
            return {}
        rows = (
            await self.session.execute(select(FiscalDocument).where(FiscalDocument.pdv_sale_id.in_(pdv_sale_ids)))
        ).scalars().all()
        return {row.pdv_sale_id: self.serialize_document(row) for row in rows if row.pdv_sale_id}

    async def get_document(self, *, document_id: str) -> FiscalDocument:
        """Return one fiscal document by identifier or fail closed."""

        document = await self.session.get(FiscalDocument, document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fiscal document not found.")
        return document

    async def send_document_email(self, *, document_id: str, email: str, also_whatsapp: bool) -> FiscalDocumentEmailResponse:
        """Send one fiscal document by e-mail."""

        document = await self.get_document(document_id=document_id)
        printable_html_url = f"/api/v1/fiscal-documents/{document.id}/printable"
        sent, message = self.notification_service.send_fiscal_document_email(
            document=document,
            email=email.strip(),
            printable_html_url=printable_html_url,
        )
        if sent and also_whatsapp:
            message += " O reenvio por WhatsApp permanece pendente de integração dedicada."
        return FiscalDocumentEmailResponse(id=document.id, email=email.strip(), sent=sent, message=message)

    def serialize_document(self, document: FiscalDocument) -> FiscalDocumentResponse:
        """Convert one fiscal document ORM row into the API payload."""

        return FiscalDocumentResponse(
            id=document.id,
            document_type=document.document_type,
            source_channel=document.source_channel,
            document_number=document.document_number,
            access_key=document.access_key,
            series_code=document.series_code,
            issue_datetime_label=document.issue_datetime_label,
            payment_method_snapshot=document.payment_method_snapshot,
            recipient_name_snapshot=document.recipient_name_snapshot,
            recipient_document_snapshot=document.recipient_document_snapshot,
            gross_total_amount=float(document.gross_total_amount or 0),
            approximate_tax_amount=float(document.approximate_tax_amount or 0),
            authorized=bool(document.authorized),
            printable_html_url=f"/api/v1/fiscal-documents/{document.id}/printable",
        )

    async def _get_by_order_id(self, order_id: str) -> FiscalDocument | None:
        """Return the fiscal document linked to one online order when present."""

        return (
            await self.session.execute(
                select(FiscalDocument).where(FiscalDocument.order_id == order_id).limit(1)
            )
        ).scalar_one_or_none()

    async def _get_by_pdv_sale_id(self, pdv_sale_id: str) -> FiscalDocument | None:
        """Return the fiscal document linked to one PDV sale when present."""

        return (
            await self.session.execute(
                select(FiscalDocument).where(FiscalDocument.pdv_sale_id == pdv_sale_id).limit(1)
            )
        ).scalar_one_or_none()

    async def _schedule_asaas_invoice(
        self,
        *,
        external_reference: str,
        payment_method_label: str,
        gross_total_amount: Decimal,
        recipient_name: str,
        recipient_email: str,
        description: str,
    ) -> None:
        """Best-effort invoice scheduling in Asaas after payment confirmation."""

        if not self.settings.asaas_enabled or not self.settings.asaas_invoice_enabled:
            return
        service_code = str(self.settings.asaas_invoice_municipal_service_code or "").strip()
        service_id = str(self.settings.asaas_invoice_municipal_service_id or "").strip()
        if service_code == "" and service_id == "":
            return
        payload = {
            "payment": external_reference,
            "value": float(Decimal(gross_total_amount or 0)),
            "description": description,
            "serviceDescription": description,
            "externalReference": external_reference,
            "effectiveDate": datetime.now(tz=UTC).date().isoformat(),
        }
        if service_id:
            payload["municipalServiceId"] = service_id
        if service_code:
            payload["municipalServiceCode"] = service_code
        if recipient_name:
            payload["customer"] = {"name": recipient_name, "email": recipient_email}
        try:
            self.asaas_client.schedule_invoice(payload)
        except AsaasError:
            return

    def _build_document_number(self, *, seed: str) -> str:
        """Return a deterministic human-readable fiscal number."""

        digest = sha1(str(seed).encode("utf-8")).hexdigest()
        return str(int(digest[:10], 16) % 900000 + 100000)

    def _build_access_key(self, *, seed: str) -> str:
        """Return a deterministic 44-digit access key."""

        digits = str(int(sha1(str(seed).encode("utf-8")).hexdigest(), 16))
        return digits[:44].zfill(44)

    def _estimate_tax(self, total_amount: Decimal | None) -> Decimal:
        """Return a conservative approximate tax amount for the fiscal document."""

        normalized_total = Decimal(total_amount or 0)
        return (normalized_total * Decimal("0.12")).quantize(Decimal("0.01"))

    def _format_issue_label(self) -> str:
        """Return the local issue timestamp label used by the UI."""

        return datetime.now(tz=UTC).astimezone().strftime("%d/%m/%Y %H:%M")
