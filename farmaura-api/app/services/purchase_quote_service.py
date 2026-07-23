"""
farmaura-api/app/services/purchase_quote_service.py

Purchase quote service for Farmaura.

Responsibilities:
- execute purchase quote (orçamento) registration, edit, and status use-cases;
- assemble the supplier comparison view used to decide the best purchase;
- assemble internal console responses from repository models;

Observations:
- quotes never create or mutate InventoryItem/InventoryProduct — product_id on
  an item is an optional cross-reference kept purely for comparison;
- `_reapply_tenant_context` follows the same pattern documented in
  ProductService: `apply_tenant_context` sets Postgres session variables as
  transaction-local, and these tables enforce FORCE ROW LEVEL SECURITY, so any
  read issued after a mid-request commit must reapply the context first.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.file_storage import read_private_file
from app.core.pricing import best_payment_offer
from app.core.tenant_context import apply_tenant_context
from app.models.purchase_quote import PurchaseQuote
from app.models.purchase_quote_item import PurchaseQuoteItem
from app.models.purchase_quote_payment_term import PurchaseQuotePaymentTerm
from app.repositories.purchase_quote_repository import PurchaseQuoteRepository
from app.schemas.auth import TokenSubject
from app.schemas.inventory import InventoryInvoicePreviewResponse
from app.schemas.purchase_quote import (
    PurchaseQuoteCompareEntryResponse,
    PurchaseQuoteCompareResponse,
    PurchaseQuoteCreateRequest,
    PurchaseQuoteItemResponse,
    PurchaseQuoteListResponse,
    PurchaseQuotePaymentTermResponse,
    PurchaseQuoteResponse,
    PurchaseQuoteStatusUpdateRequest,
    PurchaseQuoteUpdateRequest,
)

# ============================================================================
# PURCHASE QUOTE SERVICE
# ============================================================================


class PurchaseQuoteService:
    """Provide purchase quote use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = PurchaseQuoteRepository(session)

    async def _reapply_tenant_context(self) -> None:
        """Reapply RLS session context after a commit (see module docstring)."""

        await apply_tenant_context(self.session, self.subject)

    async def list_quotes(
        self,
        *,
        supplier_id: str = "",
        product_query: str = "",
        date_from: date | None = None,
        date_to: date | None = None,
        payment_method: str = "",
        freight_type: str = "",
        status_filter: str = "",
    ) -> PurchaseQuoteListResponse:
        """Return tenant purchase quotes for the list screen."""

        quotes = await self.repository.list_quotes(
            tenant_id=str(self.subject.tenant_id),
            supplier_id=supplier_id,
            product_query=product_query,
            date_from=date_from,
            date_to=date_to,
            payment_method=payment_method,
            freight_type=freight_type,
            status=status_filter,
        )
        return PurchaseQuoteListResponse(items=[self._serialize(quote) for quote in quotes])

    async def get_quote(self, quote_id: str) -> PurchaseQuoteResponse:
        """Return one purchase quote with its terms and items."""

        quote = await self._require_quote(quote_id)
        return self._serialize(quote)

    async def create_quote(self, payload: PurchaseQuoteCreateRequest) -> PurchaseQuoteResponse:
        """Create a manually entered purchase quote."""

        quote = self.build_quote_entity(payload)
        quote = await self.repository.add_quote(quote)
        await self.session.commit()
        return self._serialize(quote)

    async def update_quote(
        self, quote_id: str, payload: PurchaseQuoteUpdateRequest
    ) -> PurchaseQuoteResponse:
        """Replace the header, payment terms, and items of an existing purchase quote."""

        quote = await self._require_quote(quote_id)
        quote.supplier_id = payload.supplier_id or None
        quote.supplier_name_snapshot = payload.supplier_name
        quote.supplier_document_snapshot = payload.supplier_document
        quote.quote_date = payload.quote_date
        quote.valid_until = payload.valid_until
        quote.freight_type = payload.freight_type
        quote.freight_cost = payload.freight_cost
        quote.delivery_time_days = payload.delivery_time_days
        quote.notes = payload.notes
        quote.payment_terms = [
            PurchaseQuotePaymentTerm(
                tenant_id=str(self.subject.tenant_id),
                method=term.method,
                discount_percent=term.discount_percent,
                surcharge_percent=term.surcharge_percent,
                installment_count=term.installment_count,
                days_to_pay=term.days_to_pay,
                notes=term.notes,
            )
            for term in payload.payment_terms
        ]
        quote.items = [
            PurchaseQuoteItem(
                tenant_id=str(self.subject.tenant_id),
                product_id=item.product_id or None,
                description=item.description,
                brand_name=item.brand_name,
                sku_snapshot=item.sku_snapshot,
                ean_code_snapshot=item.ean_code_snapshot,
                unit=item.unit,
                quantity_reference=item.quantity_reference,
                unit_price=item.unit_price,
                is_comodato=item.is_comodato,
                comodato_notes=item.comodato_notes,
                notes=item.notes,
            )
            for item in payload.items
        ]
        await self.session.commit()
        await self._reapply_tenant_context()
        quote = await self._require_quote(quote_id)
        return self._serialize(quote)

    async def update_status(
        self, quote_id: str, payload: PurchaseQuoteStatusUpdateRequest
    ) -> PurchaseQuoteResponse:
        """Transition a purchase quote's status (draft/confirmed/archived)."""

        quote = await self._require_quote(quote_id)
        quote.status = payload.status
        await self.session.commit()
        return self._serialize(quote)

    async def get_file(self, quote_id: str, *, settings: Settings) -> tuple[PurchaseQuote, bytes]:
        """Return the stored source document for a purchase quote."""

        quote = await self._require_quote(quote_id)
        if not quote.storage_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This purchase quote has no attached file.",
            )
        content = await read_private_file(settings=settings, storage_key=quote.storage_key)
        return quote, content

    async def preview_purchase(
        self, quote_id: str, *, settings: Settings
    ) -> InventoryInvoicePreviewResponse:
        """Build an inventory-receiving review payload from a confirmed purchase quote.

        Delegates the actual payload construction to `InventoryInvoiceService`, which already owns
        candidate matching and the review-response shape for the invoice-import flow — this method
        only loads the quote and composes the two services, it does not duplicate that logic.
        """

        from app.services.inventory_invoice_service import InventoryInvoiceService

        quote = await self._require_quote(quote_id)
        inventory_invoice_service = InventoryInvoiceService(
            session=self.session, subject=self.subject, settings=settings
        )
        return await inventory_invoice_service.preview_from_purchase_quote(quote)

    async def compare_by_product(
        self,
        *,
        product_id: str = "",
        brand_name: str = "",
        product_query: str = "",
    ) -> PurchaseQuoteCompareResponse:
        """Compare active quotes for a product/brand across suppliers.

        `product_id`, `brand_name`, and `product_query` are all optional filters (priority in that
        order); with none given, returns every confirmed quoted line for the tenant — the compare
        screen's default full view. Grouping by product and ranking by price is left to the caller,
        since a full unfiltered result mixes unrelated products.
        """

        pairs = await self.repository.compare_items_by_product(
            tenant_id=str(self.subject.tenant_id),
            product_id=product_id,
            brand_name=brand_name,
            query=product_query,
        )
        entries = [self._serialize_compare_entry(item, quote) for item, quote in pairs]
        echoed_query = product_id or brand_name or product_query
        return PurchaseQuoteCompareResponse(query=echoed_query, entries=entries)

    def build_quote_entity(
        self,
        payload: PurchaseQuoteCreateRequest,
        *,
        status_value: str = "confirmed",
        source_provider: str = "",
        source_model: str = "",
        file_name: str = "",
        content_type: str = "",
        size_bytes: int | None = None,
        storage_key: str = "",
    ) -> PurchaseQuote:
        """Build a (not yet persisted) purchase quote entity from a validated payload."""

        return PurchaseQuote(
            tenant_id=str(self.subject.tenant_id),
            supplier_id=payload.supplier_id or None,
            supplier_name_snapshot=payload.supplier_name,
            supplier_document_snapshot=payload.supplier_document,
            quote_date=payload.quote_date,
            valid_until=payload.valid_until,
            status=status_value,
            freight_type=payload.freight_type,
            freight_cost=payload.freight_cost,
            delivery_time_days=payload.delivery_time_days,
            source_provider=source_provider,
            source_model=source_model,
            file_name=file_name,
            content_type=content_type,
            size_bytes=size_bytes,
            storage_key=storage_key,
            notes=payload.notes,
            created_by_user_id=str(self.subject.user_id),
            payment_terms=[
                PurchaseQuotePaymentTerm(
                    tenant_id=str(self.subject.tenant_id),
                    method=term.method,
                    discount_percent=term.discount_percent,
                    surcharge_percent=term.surcharge_percent,
                    installment_count=term.installment_count,
                    days_to_pay=term.days_to_pay,
                    notes=term.notes,
                )
                for term in payload.payment_terms
            ],
            items=[
                PurchaseQuoteItem(
                    tenant_id=str(self.subject.tenant_id),
                    product_id=item.product_id or None,
                    description=item.description,
                    brand_name=item.brand_name,
                    sku_snapshot=item.sku_snapshot,
                    ean_code_snapshot=item.ean_code_snapshot,
                    unit=item.unit,
                    quantity_reference=item.quantity_reference,
                    unit_price=item.unit_price,
                    is_comodato=item.is_comodato,
                    comodato_notes=item.comodato_notes,
                    notes=item.notes,
                )
                for item in payload.items
            ],
        )

    async def persist_quote(self, quote: PurchaseQuote) -> PurchaseQuoteResponse:
        """Persist a built quote entity and return its serialized form."""

        quote = await self.repository.add_quote(quote)
        await self.session.commit()
        return self._serialize(quote)

    async def _require_quote(self, quote_id: str) -> PurchaseQuote:
        """Return an existing purchase quote or fail with not found."""

        quote = await self.repository.get_by_id(
            tenant_id=str(self.subject.tenant_id), quote_id=quote_id
        )
        if quote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Purchase quote not found."
            )
        return quote

    def _serialize(self, quote: PurchaseQuote) -> PurchaseQuoteResponse:
        """Serialize a purchase quote for API responses."""

        return PurchaseQuoteResponse(
            id=quote.id,
            supplier_id=quote.supplier_id or "",
            supplier_name_snapshot=quote.supplier_name_snapshot,
            supplier_document_snapshot=quote.supplier_document_snapshot,
            quote_date=quote.quote_date,
            valid_until=quote.valid_until,
            status=quote.status,
            freight_type=quote.freight_type,
            freight_cost=quote.freight_cost,
            delivery_time_days=quote.delivery_time_days,
            source_provider=quote.source_provider,
            source_model=quote.source_model,
            file_name=quote.file_name,
            has_file=bool(quote.storage_key),
            notes=quote.notes,
            created_at=quote.created_at,
            updated_at=quote.updated_at,
            payment_terms=[
                PurchaseQuotePaymentTermResponse(
                    id=term.id,
                    method=term.method,
                    discount_percent=term.discount_percent,
                    surcharge_percent=term.surcharge_percent,
                    installment_count=term.installment_count,
                    days_to_pay=term.days_to_pay,
                    notes=term.notes,
                )
                for term in quote.payment_terms
            ],
            items=[
                PurchaseQuoteItemResponse(
                    id=item.id,
                    product_id=item.product_id or "",
                    description=item.description,
                    brand_name=item.brand_name,
                    sku_snapshot=item.sku_snapshot,
                    ean_code_snapshot=item.ean_code_snapshot,
                    unit=item.unit,
                    quantity_reference=item.quantity_reference,
                    unit_price=item.unit_price,
                    is_comodato=item.is_comodato,
                    comodato_notes=item.comodato_notes,
                    notes=item.notes,
                )
                for item in quote.items
            ],
        )

    def _serialize_compare_entry(
        self, item: PurchaseQuoteItem, quote: PurchaseQuote
    ) -> PurchaseQuoteCompareEntryResponse:
        """Serialize one quoted line paired with its quote header for the comparison view."""

        effective_price, best_method, best_discount = best_payment_offer(
            item.unit_price, quote.payment_terms
        )
        return PurchaseQuoteCompareEntryResponse(
            quote_id=quote.id,
            quote_item_id=item.id,
            supplier_id=quote.supplier_id or "",
            supplier_name=quote.supplier_name_snapshot,
            quote_date=quote.quote_date,
            valid_until=quote.valid_until,
            product_id=item.product_id or "",
            item_description=item.description,
            brand_name=item.brand_name,
            unit=item.unit,
            quantity_reference=item.quantity_reference,
            unit_price=item.unit_price,
            best_effective_price=effective_price,
            best_payment_method=best_method,
            best_payment_discount_percent=best_discount,
            payment_methods=sorted({term.method for term in quote.payment_terms}),
            freight_type=quote.freight_type,
            freight_cost=quote.freight_cost,
            delivery_time_days=quote.delivery_time_days,
            is_comodato=item.is_comodato,
            comodato_notes=item.comodato_notes,
        )
