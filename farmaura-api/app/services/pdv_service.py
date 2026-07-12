"""
farmaura-api/app/services/pdv_service.py

PDV service for Farmaura.

Responsibilities:
- orchestrate pharmacist handoff and cashier completion workflows;
- recompute PDV financial totals from authoritative inventory data;
- shape queue and sales payloads for the internal console;

Observations:
- inventory prices are snapshotted into PDV lines to preserve history;
- stock decrementation is intentionally deferred from this first slice;
"""

from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.inventory_repository import InventoryRepository
from app.repositories.pdv_repository import PdvRepository
from app.schemas.auth import TokenSubject
from app.schemas.fiscal import FiscalDocumentResponse
from app.schemas.pdv import (
    PdvCustomerLiteResponse,
    PdvLineResponse,
    PdvOrderResponse,
    PdvQueueCreateRequest,
    PdvQueueResponse,
    PdvSaleCreateRequest,
    PdvSaleListResponse,
    PdvSaleResponse,
)
from app.models.pdv_order import PdvOrder
from app.models.pdv_order_item import PdvOrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.services.fiscal_service import FiscalService


# ============================================================================
# PDV SERVICE
# ============================================================================


class PdvService:
    """Provide PDV queue and sale use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = PdvRepository(session)
        self.inventory_repository = InventoryRepository(session)
        self.store_id = ""

    async def list_queue(self) -> PdvQueueResponse:
        """Return queued and claimed PDV orders."""

        orders = await self.repository.list_queue_orders(tenant_id=str(self.subject.tenant_id), store_id=self.store_id)
        items = await self.repository.list_order_items(order_ids=[order.id for order in orders])
        item_map: dict[str, list[PdvLineResponse]] = {}
        for item in items:
            item_map.setdefault(item.pdv_order_id, []).append(
                PdvLineResponse(
                    id=item.id,
                    inventory_item_id=item.inventory_item_id,
                    name=item.item_name_snapshot,
                    brand=item.brand_name_snapshot,
                    loc=item.storage_location_snapshot,
                    qty=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                    controlled=False,
                )
            )
        return PdvQueueResponse(items=[self._serialize_order(order, item_map.get(order.id, [])) for order in orders])

    async def create_queue_order(self, payload: PdvQueueCreateRequest) -> PdvOrderResponse:
        """Persist a pharmacist handoff order for the cashier queue."""

        prepared = await self._prepare_lines(payload.items)
        subtotal = sum((line["line_total"] for line in prepared), start=Decimal("0.00"))
        discount_amount = subtotal * (payload.discount / Decimal("100.00"))
        total = max(Decimal("0.00"), subtotal - discount_amount)
        order = PdvOrder(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            store_id=self.store_id,
            order_code="PV-" + uuid4().hex[:8].upper(),
            customer_id=payload.customer.id if payload.customer and payload.customer.id else None,
            pharmacist_user_id=str(self.subject.user_id),
            cashier_user_id=None,
            order_status="queued",
            service_role="pharmacist",
            customer_display_name=payload.customer.name if payload.customer else "Consumidor não identificado",
            customer_document_snapshot=payload.customer.doc if payload.customer else "",
            customer_phone_snapshot=payload.customer.phone if payload.customer else "",
            includes_controlled_items=any(line["controlled"] for line in prepared),
            include_cpf_on_invoice=True,
            discount_percent=payload.discount,
            cashback_applied_amount=Decimal("0.00"),
            subtotal_amount=subtotal,
            discount_amount=discount_amount,
            total_amount=total,
            queued_at_label="agora",
            claimed_at_label="",
            completed_at_label="",
            notes=payload.notes,
        )
        await self.repository.add_order(order)
        response_lines: list[PdvLineResponse] = []
        for line in prepared:
            item = PdvOrderItem(
                id=str(uuid4()),
                pdv_order_id=order.id,
                inventory_item_id=line["inventory_item_id"],
                marketplace_listing_id=None,
                item_name_snapshot=line["name"],
                brand_name_snapshot=line["brand"],
                ean_code_snapshot=line["ean"],
                storage_location_snapshot=line["loc"],
                quantity=line["qty"],
                unit_price=line["unit_price"],
                line_total=line["line_total"],
            )
            await self.repository.add_order_item(item)
            response_lines.append(
                PdvLineResponse(
                    id=item.id,
                    inventory_item_id=item.inventory_item_id,
                    name=item.item_name_snapshot,
                    brand=item.brand_name_snapshot,
                    loc=item.storage_location_snapshot,
                    qty=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                    controlled=line["controlled"],
                )
            )
        await self.session.commit()
        return self._serialize_order(order, response_lines, payload.customer)

    async def claim_order(self, order_id: str) -> PdvOrderResponse:
        """Assign a queued order to the cashier flow."""

        order = await self.repository.get_order_by_id(tenant_id=str(self.subject.tenant_id), order_id=order_id, store_id=self.store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDV order not found.")
        order.order_status = "claimed"
        order.cashier_user_id = str(self.subject.user_id)
        order.claimed_at_label = "agora"
        await self.session.commit()
        queue = await self.list_queue()
        match = next((item for item in queue.items if item.id == order_id), None)
        if match is None:
            items = await self.repository.list_order_items(order_ids=[order.id])
            return self._serialize_order(
                order,
                [
                    PdvLineResponse(
                        id=item.id,
                        inventory_item_id=item.inventory_item_id,
                        name=item.item_name_snapshot,
                        brand=item.brand_name_snapshot,
                        loc=item.storage_location_snapshot,
                        qty=item.quantity,
                        unit_price=item.unit_price,
                        line_total=item.line_total,
                        controlled=False,
                    )
                    for item in items
                ],
            )
        return match

    async def complete_sale(self, order_id: str, payload: PdvSaleCreateRequest) -> PdvSaleResponse:
        """Finalize one claimed PDV order into a sale snapshot."""

        order = await self.repository.get_order_by_id(tenant_id=str(self.subject.tenant_id), order_id=order_id, store_id=self.store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDV order not found.")
        order_items = await self.repository.list_order_items(order_ids=[order.id])
        sale = PdvSale(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            store_id=self.store_id,
            sale_code="NFCE-" + uuid4().hex[:8].upper(),
            pdv_order_id=order.id,
            customer_id=order.customer_id,
            cashier_user_id=str(self.subject.user_id),
            pharmacist_user_id=order.pharmacist_user_id,
            payment_method=payload.payment_method,
            payment_status="paid",
            sale_status="completed",
            include_cpf_on_invoice=payload.include_cpf_on_invoice,
            customer_display_name=order.customer_display_name,
            customer_document_snapshot=order.customer_document_snapshot,
            subtotal_amount=order.subtotal_amount,
            discount_amount=order.discount_amount,
            cashback_applied_amount=payload.cashback_applied,
            cashback_earned_amount=payload.cashback_earned,
            total_amount=max(Decimal("0.00"), order.total_amount - payload.cashback_applied),
            completed_at_label="agora",
        )
        await self.repository.add_sale(sale)
        response_items: list[PdvLineResponse] = []
        for item in order_items:
            sale_item = PdvSaleItem(
                id=str(uuid4()),
                pdv_sale_id=sale.id,
                inventory_item_id=item.inventory_item_id,
                item_name_snapshot=item.item_name_snapshot,
                brand_name_snapshot=item.brand_name_snapshot,
                storage_location_snapshot=item.storage_location_snapshot,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
                is_controlled=order.includes_controlled_items,
            )
            await self.repository.add_sale_item(sale_item)
            response_items.append(
                PdvLineResponse(
                    id=sale_item.id,
                    inventory_item_id=sale_item.inventory_item_id,
                    name=sale_item.item_name_snapshot,
                    brand=sale_item.brand_name_snapshot,
                    loc=sale_item.storage_location_snapshot,
                    qty=sale_item.quantity,
                    unit_price=sale_item.unit_price,
                    line_total=sale_item.line_total,
                    controlled=sale_item.is_controlled,
                )
            )
        order.order_status = "completed"
        order.completed_at_label = "agora"
        fiscal_service = FiscalService(self.session)
        fiscal_document = await fiscal_service.issue_for_pdv_sale(sale=sale)
        await self.session.commit()
        return PdvSaleResponse(
            id=sale.id,
            sale_code=sale.sale_code,
            payment_method=sale.payment_method,
            total=sale.total_amount,
            completed_at=sale.completed_at_label,
            customer=self._serialize_customer(order),
            items=response_items,
            fiscal_document=fiscal_service.serialize_document(fiscal_document),
        )

    async def list_sales(self) -> PdvSaleListResponse:
        """Return finalized PDV sales for the console."""

        sales = await self.repository.list_sales(tenant_id=str(self.subject.tenant_id), store_id=self.store_id)
        items = await self.repository.list_sale_items(sale_ids=[sale.id for sale in sales])
        fiscal_map: dict[str, FiscalDocumentResponse] = await FiscalService(self.session).map_by_pdv_sale_ids(
            pdv_sale_ids=[sale.id for sale in sales]
        )
        item_map: dict[str, list[PdvLineResponse]] = {}
        for item in items:
            item_map.setdefault(item.pdv_sale_id, []).append(
                PdvLineResponse(
                    id=item.id,
                    inventory_item_id=item.inventory_item_id,
                    name=item.item_name_snapshot,
                    brand=item.brand_name_snapshot,
                    loc=item.storage_location_snapshot,
                    qty=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                    controlled=item.is_controlled,
                )
            )
        return PdvSaleListResponse(
            items=[
                PdvSaleResponse(
                    id=sale.id,
                    sale_code=sale.sale_code,
                    payment_method=sale.payment_method,
                    total=sale.total_amount,
                    completed_at=sale.completed_at_label,
                    customer=self._serialize_customer(sale),
                    items=item_map.get(sale.id, []),
                    fiscal_document=fiscal_map.get(sale.id),
                )
                for sale in sales
            ]
        )

    async def _prepare_lines(self, items: list[object]) -> list[dict[str, object]]:
        """Resolve and validate authoritative inventory snapshots for a PDV order."""

        prepared: list[dict[str, object]] = []
        for item in items:
            inventory_item = await self.inventory_repository.get_item_by_id(
                tenant_id=str(self.subject.tenant_id),
                store_id=self.store_id,
                item_id=item.id,
            )
            if inventory_item is None or not inventory_item.is_active:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found for PDV order.")
            prepared.append(
                {
                    "inventory_item_id": inventory_item.id,
                    "name": inventory_item.name,
                    "brand": inventory_item.brand_name,
                    "ean": inventory_item.ean_code,
                    "loc": inventory_item.storage_location,
                    "qty": item.qty,
                    "unit_price": Decimal(inventory_item.sale_price),
                    "line_total": Decimal(inventory_item.sale_price) * item.qty,
                    "controlled": bool(inventory_item.is_controlled),
                }
            )
        return prepared

    def _serialize_order(self, order: object, items: list[PdvLineResponse], payload_customer: object | None = None) -> PdvOrderResponse:
        """Convert one PDV order ORM row into the queue response shape."""

        return PdvOrderResponse(
            id=order.id,
            sent_at=order.queued_at_label or order.claimed_at_label or "agora",
            sent_by="Farmacêutico",
            status=order.order_status,
            discount=order.discount_percent,
            subtotal=order.subtotal_amount,
            total=order.total_amount,
            has_controlled=order.includes_controlled_items,
            customer=payload_customer if payload_customer is not None else self._serialize_customer(order),
            items=items,
        )

    def _serialize_customer(self, source: object) -> PdvCustomerLiteResponse | None:
        """Return a lightweight PDV customer snapshot when available."""

        if not str(getattr(source, "customer_display_name", "")).strip():
            return None
        return PdvCustomerLiteResponse(
            id=getattr(source, "customer_id", None),
            name=getattr(source, "customer_display_name", "Consumidor não identificado"),
            doc=getattr(source, "customer_document_snapshot", ""),
            phone=getattr(source, "customer_phone_snapshot", ""),
            avatar="",
            recurring=False,
            cashback=Decimal("0.00"),
        )

