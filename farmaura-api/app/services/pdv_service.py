"""
farmaura-api/app/services/pdv_service.py

PDV service for Farmaura.

Responsibilities:
- orchestrate pharmacist handoff and cashier completion workflows;
- recompute PDV financial totals from authoritative inventory data;
- shape queue and sales payloads for the internal console;

Observations:
- inventory prices are snapshotted into PDV lines to preserve history;
- stock is decremented when a pharmacist queues an order (not at cashier
  completion) so two pharmacists can never both queue the last unit;
  cancelling a queued or claimed order reverses that reservation.
"""

from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_scope
from app.domain.enums import UserRole
from app.repositories.cashback_repository import CashbackRepository
from app.repositories.customer_payment_method_repository import CustomerPaymentMethodRepository
from app.repositories.inventory_lot_repository import InventoryLotRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.pdv_draft_session_repository import PdvDraftSessionRepository
from app.repositories.pdv_repository import PdvRepository
from app.repositories.prescription_repository import PrescriptionRepository
from app.repositories.store_repository import StoreRepository
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenSubject
from app.schemas.fiscal import FiscalDocumentResponse
from app.schemas.pdv import (
    PdvCustomerLiteResponse,
    PdvDeliveryRequest,
    PdvDiscountLimitRequest,
    PdvDiscountLimitResponse,
    PdvDraftCartLineResponse,
    PdvDraftSessionListResponse,
    PdvDraftSessionResponse,
    PdvDraftSessionUpsertRequest,
    PdvItemLocationListResponse,
    PdvItemLocationResponse,
    PdvLineResponse,
    PdvOrderItemRequest,
    PdvOrderResponse,
    PdvProductComponentResponse,
    PdvProductSearchResponse,
    PdvProductSearchResultResponse,
    PdvQueueCreateRequest,
    PdvQueueResponse,
    PdvRecurrenceConfirmRequest,
    PdvRecurrenceConfirmResponse,
    PdvReservationCreateRequest,
    PdvReservationResponse,
    PdvSaleCreateRequest,
    PdvSaleListResponse,
    PdvSaleResponse,
)
from app.models.cashback_transaction import CashbackTransaction
from app.models.cashback_transaction_line import CashbackTransactionLine
from app.models.customer_cashback_wallet import CustomerCashbackWallet
from app.models.inventory_movement import InventoryMovement
from app.models.pdv_draft_session import PdvDraftSession
from app.models.pdv_order import PdvOrder
from app.models.pdv_order_item import PdvOrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.models.prescription import Prescription
from app.models.subscription import Subscription
from app.schemas.orders import DeliveryCoverageResponse
from app.services.catalog_service import CATALOG_CACHE_NAMESPACE
from app.services.delivery_pricing_service import DeliveryPricingService
from app.services.fiscal_service import FiscalService
from app.services.inventory_stock_sync import decrement_lot_fefo
from app.services.marketplace_projection import build_marketplace_catalog_groups
from app.services.payment_service import PaymentService
from app.services.portal_service import PortalService
from app.services.purchase_history_service import DEFAULT_RECURRENCE_DISCOUNT_PERCENT


# ============================================================================
# PDV SERVICE
# ============================================================================


RESERVATION_HOLD_HOURS = 48


class PdvService:
    """Provide PDV queue and sale use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = PdvRepository(session)
        self.inventory_repository = InventoryRepository(session)
        self.lot_repository = InventoryLotRepository(session)
        self.subscription_repository = SubscriptionRepository(session)
        self.prescription_repository = PrescriptionRepository(session)
        self.delivery_pricing = DeliveryPricingService(session)
        self.draft_repository = PdvDraftSessionRepository(session)
        self.user_repository = UserRepository(session)
        self.store_id: str | None = None

    async def _get_store_id(self, *, requested_store_id: str = "", allow_all_stores: bool = False) -> str:
        """Resolve the acting user's assigned store, honoring an admin-supplied override.

        Admins have no store of their own: for read/list use-cases (allow_all_stores=True)
        they default to seeing every store in the tenant (empty string, unfiltered) unless
        they pick one. Writes always resolve to a concrete store.
        """

        if self.store_id is not None:
            return self.store_id
        if requested_store_id and self.subject.role == UserRole.ADMIN:
            self.store_id = requested_store_id
        elif self.subject.store_id:
            self.store_id = str(self.subject.store_id)
        elif allow_all_stores and self.subject.role == UserRole.ADMIN:
            self.store_id = ""
        else:
            self.store_id = await self.inventory_repository.get_primary_store_id(tenant_id=str(self.subject.tenant_id))
        return self.store_id

    async def search_products(self, *, query: str, limit: int = 20) -> PdvProductSearchResponse:
        """Return products matching a search term, grouped with per-store stock components."""

        cleaned_query = query.strip()
        if not cleaned_query:
            return PdvProductSearchResponse(items=[])
        items = await self.inventory_repository.list_items(
            tenant_id=str(self.subject.tenant_id),
            store_id="",
            query=cleaned_query,
            active_only=True,
        )
        groups = build_marketplace_catalog_groups(items)
        stores = await StoreRepository(self.session).list_stores(tenant_id=str(self.subject.tenant_id), active_only=False)
        store_names = {store.id: store.name for store in stores}
        own_store_id = await self._get_store_id()
        results: list[PdvProductSearchResultResponse] = []
        for group in groups[:limit]:
            components = [
                PdvProductComponentResponse(
                    inventory_item_id=str(component["inventory_item_id"]),
                    store_id=str(component["item"].store_id),
                    store_name=store_names.get(str(component["item"].store_id), "Loja"),
                    quantity=int(component["quantity"]),
                    storage_location=str(component["storage_location"]),
                    unit_price=component["sale_price"],
                    is_controlled=bool(component["is_controlled"]),
                )
                for component in group["components"]
            ]
            own_component = next((c for c in components if c.store_id == own_store_id and c.quantity > 0), None)
            results.append(
                PdvProductSearchResultResponse(
                    id=str(group["id"]),
                    name=str(group["name"]),
                    brand=str(group["brand"]),
                    ean=str(group["ean"]),
                    total_stock=int(group["stock"]),
                    is_controlled=bool(group["requires_prescription"]),
                    components=components,
                    own_store_component=own_component,
                )
            )
        return PdvProductSearchResponse(items=results)

    async def list_item_locations(self, item_id: str) -> PdvItemLocationListResponse:
        """Return the storage locations with available stock for one item, for the pick-location selector."""

        item = await self.inventory_repository.get_item_by_id(tenant_id=str(self.subject.tenant_id), item_id=item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found.")
        lot_repository = self.lot_repository
        lots = await lot_repository.list_stock_lots(
            tenant_id=str(self.subject.tenant_id),
            store_id=item.store_id,
            item_id=item.id,
            status="available",
            only_positive=True,
        )
        locations_by_id = {}
        quantity_by_location_id: dict[str, int] = {}
        for lot in lots:
            if lot.location_id not in locations_by_id:
                location = await lot_repository.get_location_by_id(tenant_id=str(self.subject.tenant_id), location_id=lot.location_id)
                if location is None:
                    continue
                locations_by_id[lot.location_id] = location
            quantity_by_location_id[lot.location_id] = quantity_by_location_id.get(lot.location_id, 0) + lot.quantity
        results = [
            PdvItemLocationResponse(
                location_id=location.id,
                location_code=location.code,
                location_name=location.name,
                location_type=location.location_type,
                quantity=quantity_by_location_id[location_id],
            )
            for location_id, location in locations_by_id.items()
        ]
        results.sort(key=lambda entry: entry.location_code)
        return PdvItemLocationListResponse(items=results)

    async def list_queue(self, *, requested_store_id: str = "") -> PdvQueueResponse:
        """Return queued and claimed PDV orders, lazily expiring stale reservations first."""

        store_id = await self._get_store_id(requested_store_id=requested_store_id, allow_all_stores=True)
        orders = await self.repository.list_queue_orders(tenant_id=str(self.subject.tenant_id), store_id=store_id)
        now = datetime.now(UTC)
        active_orders: list[PdvOrder] = []
        for order in orders:
            expired = (
                order.is_reservation
                and order.order_status == "queued"
                and order.reservation_expires_at is not None
                and order.reservation_expires_at < now
            )
            if expired:
                await self._return_stock_and_cancel(order, reason="pdv_reservation_expired")
                continue
            active_orders.append(order)
        orders = active_orders
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

    async def _resolve_delivery(
        self, delivery: PdvDeliveryRequest | None, *, store_id: str, subtotal_amount: Decimal,
    ) -> tuple[str, dict[str, object]]:
        """Resolve fulfillment fields for a PDV order, pricing delivery the same way the marketplace checkout does."""

        empty = {
            "delivery_address_line": "",
            "delivery_district": "",
            "delivery_city": "",
            "delivery_state_code": "",
            "delivery_postal_code": "",
            "delivery_fee_amount": Decimal("0.00"),
            "delivery_latitude": Decimal("0.0000000"),
            "delivery_longitude": Decimal("0.0000000"),
        }
        if delivery is None or delivery.fulfillment_type == "pickup":
            return "pickup", empty
        portal_service = PortalService(self.session)
        areas = await portal_service.get_delivery_areas(self.subject)
        pricing = await portal_service.get_delivery_pricing(self.subject)
        store_config = self.delivery_pricing.find_store_area_config(areas, store_id=store_id)
        address_text = ", ".join(
            part
            for part in [
                " ".join(part for part in [delivery.address_line, delivery.address_number] if part).strip(),
                delivery.district,
                delivery.city,
                delivery.state_code,
                delivery.postal_code,
            ]
            if part
        )
        latitude, longitude, distance_km = await self.delivery_pricing.resolve_geo_from_store(
            tenant_id=str(self.subject.tenant_id), store_id=store_id, address_text=address_text,
        )
        if self.delivery_pricing.is_area_configured(store_config):
            fee = self.delivery_pricing.resolve_fee_by_area(
                store_config,
                areas.variations,
                distance_km=distance_km,
                district_text=delivery.district,
                city_text=delivery.city,
                subtotal_amount=subtotal_amount,
            )
            if fee is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Este endereço está fora da área de entrega. Escolha retirada na loja para continuar.",
                )
        else:
            fee = self.delivery_pricing.resolve_distance_tier_fee(pricing, distance_km, subtotal_amount)
        return "delivery", {
            "delivery_address_line": " ".join(part for part in [delivery.address_line, delivery.address_number] if part).strip(),
            "delivery_district": delivery.district,
            "delivery_city": delivery.city,
            "delivery_state_code": delivery.state_code,
            "delivery_postal_code": delivery.postal_code,
            "delivery_fee_amount": fee,
            "delivery_latitude": latitude,
            "delivery_longitude": longitude,
        }

    async def check_delivery_coverage(self, *, district: str, city: str, state_code: str, postal_code: str) -> DeliveryCoverageResponse:
        """Return a best-effort delivery-coverage preview for one typed CEP/address, for the balcão fulfillment picker."""

        store_id = await self._get_store_id()
        return await self.delivery_pricing.check_coverage(
            subject=self.subject, store_id=store_id, district=district, city=city, state_code=state_code, postal_code=postal_code,
        )

    async def create_queue_order(self, payload: PdvQueueCreateRequest) -> PdvOrderResponse:
        """Persist a pharmacist handoff order for the cashier queue."""

        store_id = await self._get_store_id()
        prepared = await self._prepare_lines(payload.items)
        subtotal = sum((line["line_total"] for line in prepared), start=Decimal("0.00"))
        customer_id = payload.customer.id if payload.customer and payload.customer.id else None
        matched_prescriptions = await self._enforce_prescription_gate(prepared, customer_id)
        potential_cashback = await self._resolve_potential_cashback(customer_id)
        minimum_margin_percent = await self._resolve_discount_minimum_margin_percent()
        max_discount_percent = self._discount_ceiling(prepared, potential_cashback, minimum_margin_percent)
        if payload.discount > max_discount_percent:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Desconto negado: reduziria a margem média do carrinho abaixo do mínimo configurado "
                    "(" + str(minimum_margin_percent) + "%), considerando também o cashback disponível do cliente. "
                    "Desconto máximo permitido: " + str(max_discount_percent) + "%."
                ),
            )
        discount_amount = subtotal * (payload.discount / Decimal("100.00"))
        total_before_delivery = max(Decimal("0.00"), subtotal - discount_amount)
        fulfillment_type, delivery_fields = await self._resolve_delivery(payload.delivery, store_id=store_id, subtotal_amount=total_before_delivery)
        total = total_before_delivery + Decimal(delivery_fields["delivery_fee_amount"])
        order = PdvOrder(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
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
            fulfillment_type=fulfillment_type,
            delivery_address_line=str(delivery_fields["delivery_address_line"]),
            delivery_district=str(delivery_fields["delivery_district"]),
            delivery_city=str(delivery_fields["delivery_city"]),
            delivery_state_code=str(delivery_fields["delivery_state_code"]),
            delivery_postal_code=str(delivery_fields["delivery_postal_code"]),
            delivery_fee_amount=Decimal(delivery_fields["delivery_fee_amount"]),
            delivery_latitude=Decimal(delivery_fields["delivery_latitude"]),
            delivery_longitude=Decimal(delivery_fields["delivery_longitude"]),
        )
        await self.repository.add_order(order)
        for prescription in matched_prescriptions:
            prescription.pdv_order_id = order.id
        response_lines: list[PdvLineResponse] = []
        for line in prepared:
            item = PdvOrderItem(
                id=str(uuid4()),
                pdv_order_id=order.id,
                inventory_item_id=line["inventory_item_id"],
                marketplace_listing_id=None,
                source_store_id=line["source_store_id"],
                item_name_snapshot=line["name"],
                brand_name_snapshot=line["brand"],
                ean_code_snapshot=line["ean"],
                storage_location_snapshot=line["loc"],
                quantity=line["qty"],
                unit_price=line["unit_price"],
                line_total=line["line_total"],
            )
            await self.repository.add_order_item(item)
            await self._write_stock_movement(
                line=line,
                movement_type="exit",
                quantity_delta=-int(line["qty"]),
                quantity_before=int(line["quantity_before"]),
                resulting_quantity=int(line["resulting_quantity"]),
                reason="pdv_sale",
                reference_code=order.order_code,
            )
            response_lines.append(
                PdvLineResponse(
                    id=item.id,
                    inventory_item_id=item.inventory_item_id,
                    name=item.item_name_snapshot,
                    brand=item.brand_name_snapshot,
                    loc=item.storage_location_snapshot,
                    location_id=str(line.get("location_id", "") or ""),
                    qty=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                    controlled=line["controlled"],
                )
            )
        if payload.draft_id:
            draft = await self.draft_repository.get_for_pharmacist(
                tenant_id=str(self.subject.tenant_id), pharmacist_user_id=str(self.subject.user_id), draft_id=payload.draft_id,
            )
            if draft is not None:
                await self.draft_repository.delete(draft)
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize_order(order, response_lines, payload.customer)

    async def create_reservation(self, payload: PdvReservationCreateRequest) -> PdvReservationResponse:
        """Reserve stock held at another store for a customer to pick up there.

        Reuses the same lock-and-decrement path as a normal queue order
        (`_prepare_lines`) so the hold is real, not just a note — a second
        pharmacist can never oversell the same unit. The resulting PdvOrder
        is queued against the *destination* store (where the stock lives),
        not the requesting pharmacist's own store, so it surfaces in that
        store's own queue for their staff to fulfil when the customer shows up.
        """

        requested_by_store_id = await self._get_store_id()
        prepared = await self._prepare_lines([PdvOrderItemRequest(id=payload.inventory_item_id, qty=payload.quantity)])
        line = prepared[0]
        if str(line["source_store_id"]) != payload.store_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O produto não pertence à loja informada.")
        stores = await StoreRepository(self.session).list_stores(tenant_id=str(self.subject.tenant_id), active_only=False)
        store_name = next((store.name for store in stores if store.id == payload.store_id), "Loja")
        expires_at = datetime.now(UTC) + timedelta(hours=RESERVATION_HOLD_HOURS)
        order = PdvOrder(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            store_id=payload.store_id,
            order_code="RSV-" + uuid4().hex[:8].upper(),
            customer_id=payload.customer.id if payload.customer.id else None,
            pharmacist_user_id=str(self.subject.user_id),
            cashier_user_id=None,
            order_status="queued",
            service_role="pharmacist",
            customer_display_name=payload.customer.name or "Consumidor não identificado",
            customer_document_snapshot=payload.customer.doc,
            customer_phone_snapshot=payload.customer.phone,
            includes_controlled_items=bool(line["controlled"]),
            include_cpf_on_invoice=True,
            discount_percent=Decimal("0.00"),
            cashback_applied_amount=Decimal("0.00"),
            subtotal_amount=line["line_total"],
            discount_amount=Decimal("0.00"),
            total_amount=line["line_total"],
            queued_at_label="agora",
            claimed_at_label="",
            completed_at_label="",
            notes=payload.notes,
            fulfillment_type="pickup",
            is_reservation=True,
            reservation_expires_at=expires_at,
            requested_by_store_id=requested_by_store_id,
        )
        await self.repository.add_order(order)
        item = PdvOrderItem(
            id=str(uuid4()),
            pdv_order_id=order.id,
            inventory_item_id=line["inventory_item_id"],
            marketplace_listing_id=None,
            source_store_id=line["source_store_id"],
            item_name_snapshot=line["name"],
            brand_name_snapshot=line["brand"],
            ean_code_snapshot=line["ean"],
            storage_location_snapshot=line["loc"],
            quantity=line["qty"],
            unit_price=line["unit_price"],
            line_total=line["line_total"],
        )
        await self.repository.add_order_item(item)
        await self._write_stock_movement(
            line=line,
            movement_type="exit",
            quantity_delta=-int(line["qty"]),
            quantity_before=int(line["quantity_before"]),
            resulting_quantity=int(line["resulting_quantity"]),
            reason="pdv_reservation_hold",
            reference_code=order.order_code,
        )
        await self.session.commit()
        return PdvReservationResponse(
            order_id=order.id,
            order_code=order.order_code,
            store_id=payload.store_id,
            store_name=store_name,
            expires_at_label=expires_at.strftime("%d/%m às %H:%M"),
            customer=self._customer_from_payload(payload.customer),
        )

    async def claim_order(self, order_id: str) -> PdvOrderResponse:
        """Assign a queued order to the cashier flow."""

        store_id = await self._get_store_id()
        order = await self.repository.get_order_by_id(tenant_id=str(self.subject.tenant_id), order_id=order_id, store_id=store_id)
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

    async def cancel_order(self, order_id: str) -> PdvOrderResponse:
        """Cancel a queued or claimed PDV order, returning its reserved stock to inventory."""

        store_id = await self._get_store_id()
        order = await self.repository.get_order_by_id(tenant_id=str(self.subject.tenant_id), order_id=order_id, store_id=store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDV order not found.")
        if order.order_status == "completed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pedidos já finalizados não podem ser cancelados.")
        if order.order_status == "cancelled":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este pedido já está cancelado.")
        response_items = await self._return_stock_and_cancel(order, reason="pdv_order_cancelled")
        return self._serialize_order(order, response_items)

    async def _return_stock_and_cancel(self, order: PdvOrder, *, reason: str) -> list[PdvLineResponse]:
        """Return an order's reserved stock to inventory and mark it cancelled."""

        order_items = await self.repository.list_order_items(order_ids=[order.id])
        response_items: list[PdvLineResponse] = []
        for item in order_items:
            if item.inventory_item_id:
                inventory_item = await self.inventory_repository.get_item_by_id_for_update(
                    tenant_id=str(self.subject.tenant_id),
                    item_id=item.inventory_item_id,
                )
                if inventory_item is not None:
                    quantity_before = inventory_item.quantity
                    inventory_item.quantity = quantity_before + item.quantity
                    await self._write_stock_movement(
                        line={
                            "source_store_id": item.source_store_id or inventory_item.store_id,
                            "inventory_item_id": inventory_item.id,
                            "loc": item.storage_location_snapshot,
                            "unit_cost_snapshot": inventory_item.acquisition_cost,
                        },
                        movement_type="adjustment",
                        quantity_delta=item.quantity,
                        quantity_before=quantity_before,
                        resulting_quantity=inventory_item.quantity,
                        reason=reason,
                        reference_code=order.order_code,
                    )
            response_items.append(
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
        order.order_status = "cancelled"
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return response_items

    async def confirm_recurrence(self, payload: PdvRecurrenceConfirmRequest) -> PdvRecurrenceConfirmResponse:
        """Confirm a pharmacist-detected recurrence: charge the saved card now and record the subscription.

        This is independent of any PdvOrder — the pharmacist confirms this while
        still building the cart, before an order is ever sent to the cashier
        queue, so there is no PdvOrder id to attach to yet. It also deliberately
        does not create any recurring schedule or cron job — per the agreed
        scope, monthly auto-charging is a future phase. The Subscription row
        created here exists only as a durable record of the agreement and to
        keep this product from being suggested again by the recurrence detector.
        """

        cashback_repository = CashbackRepository(self.session)
        customer = await cashback_repository.get_customer_by_id(tenant_id=str(self.subject.tenant_id), customer_id=payload.customer_id)
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")

        payment_method = await CustomerPaymentMethodRepository(self.session).get_for_customer(
            customer_id=payload.customer_id,
            payment_method_id=payload.payment_method_id,
        )
        if payment_method is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão salvo não encontrado para este cliente.")

        inventory_item = await self.inventory_repository.get_item_by_id(
            tenant_id=str(self.subject.tenant_id),
            store_id="",
            item_id=payload.inventory_item_id,
        )
        if inventory_item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado para configurar a recorrência.")

        discount_percent = DEFAULT_RECURRENCE_DISCOUNT_PERCENT
        unit_price = Decimal(inventory_item.sale_price)
        discounted_unit_price = (unit_price * (Decimal("100.00") - discount_percent) / Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        discounted_total = discounted_unit_price * payload.quantity

        subscription_code = "SUB-" + uuid4().hex[:8].upper()
        payment_service = PaymentService(self.session)
        charge = await payment_service.charge_card(
            customer=customer,
            provider_token=payment_method.provider_token,
            billing_type="CREDIT_CARD",
            amount=discounted_total,
            external_reference=subscription_code,
            description="Recorrência PDV - " + inventory_item.name,
        )

        subscription = Subscription(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            customer_id=payload.customer_id,
            marketplace_listing_id=None,
            inventory_item_id=inventory_item.id,
            subscription_code=subscription_code,
            subscription_status="active",
            product_name_snapshot=inventory_item.name,
            quantity=payload.quantity,
            frequency_days=payload.frequency_days,
            next_cycle_in_days=payload.frequency_days,
            next_cycle_date_label="",
            started_at_label="agora",
            paused_at_label="",
            cancelled_at_label="",
            unit_price_snapshot=unit_price,
            discount_percent=discount_percent,
            is_paused=False,
        )
        await self.subscription_repository.add(subscription)
        await self.session.commit()
        return PdvRecurrenceConfirmResponse(
            subscription_id=subscription.id,
            discount_percent=discount_percent,
            charge_status=payment_service.resolve_order_payment_status(charge["status"]),
            total_charged=discounted_total,
        )

    async def complete_sale(self, order_id: str, payload: PdvSaleCreateRequest) -> PdvSaleResponse:
        """Finalize one claimed PDV order into a sale snapshot."""

        store_id = await self._get_store_id()
        order = await self.repository.get_order_by_id(tenant_id=str(self.subject.tenant_id), order_id=order_id, store_id=store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDV order not found.")
        order_items = await self.repository.list_order_items(order_ids=[order.id])
        cashback_applied, cashback_earned, earned_lines, wallet = await self._compute_cashback(
            order=order,
            order_items=order_items,
            store_id=store_id,
            requested_apply_amount=payload.cashback_applied,
        )
        sale = PdvSale(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
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
            cashback_applied_amount=cashback_applied,
            cashback_earned_amount=cashback_earned,
            total_amount=max(Decimal("0.00"), order.total_amount - cashback_applied),
            completed_at_label="agora",
            fulfillment_type=order.fulfillment_type,
            delivery_address_line=order.delivery_address_line,
            delivery_district=order.delivery_district,
            delivery_city=order.delivery_city,
            delivery_state_code=order.delivery_state_code,
            delivery_postal_code=order.delivery_postal_code,
            delivery_fee_amount=order.delivery_fee_amount,
            delivery_latitude=order.delivery_latitude,
            delivery_longitude=order.delivery_longitude,
        )
        await self.repository.add_sale(sale)
        response_items: list[PdvLineResponse] = []
        for item in order_items:
            sale_item = PdvSaleItem(
                id=str(uuid4()),
                pdv_sale_id=sale.id,
                inventory_item_id=item.inventory_item_id,
                source_store_id=item.source_store_id,
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
        if wallet is not None:
            await self._settle_cashback_ledger(
                order=order,
                sale=sale,
                wallet=wallet,
                cashback_applied=cashback_applied,
                cashback_earned=cashback_earned,
                earned_lines=earned_lines,
            )
        order.order_status = "completed"
        order.completed_at_label = "agora"
        if sale.fulfillment_type == "delivery":
            await self.delivery_pricing.attach_route_stop(
                tenant_id=str(self.subject.tenant_id),
                store_id=store_id,
                now=datetime.now(UTC),
                recipient_name=sale.customer_display_name,
                address_line=sale.delivery_address_line,
                district=sale.delivery_district,
                postal_code=sale.delivery_postal_code,
                latitude=sale.delivery_latitude,
                longitude=sale.delivery_longitude,
                route_distance_km=Decimal("0.00"),
                eta_label="",
                pdv_sale_id=sale.id,
            )
        fiscal_service = FiscalService(self.session)
        fiscal_document = await fiscal_service.issue_for_pdv_sale(sale=sale)
        await self.session.commit()
        return PdvSaleResponse(
            id=sale.id,
            sale_code=sale.sale_code,
            payment_method=sale.payment_method,
            total=sale.total_amount,
            cashback_applied=sale.cashback_applied_amount,
            cashback_earned=sale.cashback_earned_amount,
            completed_at=sale.completed_at_label,
            fulfillment_type=sale.fulfillment_type,
            delivery_fee=sale.delivery_fee_amount,
            customer=self._serialize_customer(order),
            items=response_items,
            fiscal_document=fiscal_service.serialize_document(fiscal_document),
        )

    async def list_sales(self, *, requested_store_id: str = "") -> PdvSaleListResponse:
        """Return finalized PDV sales for the console."""

        store_id = await self._get_store_id(requested_store_id=requested_store_id, allow_all_stores=True)
        sales = await self.repository.list_sales(tenant_id=str(self.subject.tenant_id), store_id=store_id)
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
                    cashback_applied=sale.cashback_applied_amount,
                    cashback_earned=sale.cashback_earned_amount,
                    completed_at=sale.completed_at_label,
                    fulfillment_type=sale.fulfillment_type,
                    delivery_fee=sale.delivery_fee_amount,
                    customer=self._serialize_customer(sale),
                    items=item_map.get(sale.id, []),
                    fiscal_document=fiscal_map.get(sale.id),
                )
                for sale in sales
            ]
        )

    async def list_draft_sessions(self) -> PdvDraftSessionListResponse:
        """Return every in-progress PDV atendimento owned by the current pharmacist, for recovery after a reload."""

        drafts = await self.draft_repository.list_for_pharmacist(
            tenant_id=str(self.subject.tenant_id), pharmacist_user_id=str(self.subject.user_id),
        )
        return PdvDraftSessionListResponse(items=[self._serialize_draft(draft) for draft in drafts])

    async def autosave_draft_session(self, payload: PdvDraftSessionUpsertRequest) -> PdvDraftSessionResponse:
        """Create or update one in-progress PDV atendimento snapshot, scoped to the current pharmacist."""

        draft = None
        if payload.id:
            draft = await self.draft_repository.get_for_pharmacist(
                tenant_id=str(self.subject.tenant_id), pharmacist_user_id=str(self.subject.user_id), draft_id=payload.id,
            )
        if draft is None:
            draft = PdvDraftSession(
                id=str(uuid4()),
                tenant_id=str(self.subject.tenant_id),
                store_id=await self._get_store_id(),
                pharmacist_user_id=str(self.subject.user_id),
            )
            await self.draft_repository.add(draft)
        draft.customer_id = payload.customer.id if payload.customer and payload.customer.id else None
        draft.customer_snapshot = payload.customer.model_dump(mode="json") if payload.customer else {}
        draft.items_snapshot = [item.model_dump(mode="json") for item in payload.items]
        draft.discount_percent = payload.discount
        draft.cash_wanted_amount = payload.cash_wanted
        draft.payment_method = payload.payment_method
        draft.include_cpf_on_invoice = payload.include_cpf_on_invoice
        draft.delivery_snapshot = payload.delivery.model_dump(mode="json") if payload.delivery else {}
        draft.started_at_ms = payload.started_at_ms or 0
        draft.operator = payload.operator
        await self.session.commit()
        await self.session.refresh(draft)
        return self._serialize_draft(draft)

    async def delete_draft_session(self, draft_id: str) -> None:
        """Discard one in-progress PDV atendimento owned by the current pharmacist."""

        draft = await self.draft_repository.get_for_pharmacist(
            tenant_id=str(self.subject.tenant_id), pharmacist_user_id=str(self.subject.user_id), draft_id=draft_id,
        )
        if draft is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atendimento não encontrado.")
        await self.draft_repository.delete(draft)
        await self.session.commit()

    def _serialize_draft(self, draft: PdvDraftSession) -> PdvDraftSessionResponse:
        """Shape one PdvDraftSession row for the internal console."""

        return PdvDraftSessionResponse(
            id=draft.id,
            customer=PdvCustomerLiteResponse(**draft.customer_snapshot) if draft.customer_snapshot else None,
            items=[PdvDraftCartLineResponse(**item) for item in draft.items_snapshot],
            discount=draft.discount_percent,
            cash_wanted=draft.cash_wanted_amount,
            payment_method=draft.payment_method,
            include_cpf_on_invoice=draft.include_cpf_on_invoice,
            delivery=PdvDeliveryRequest(**draft.delivery_snapshot) if draft.delivery_snapshot else None,
            started_at_ms=draft.started_at_ms or None,
            operator=draft.operator,
            updated_at_label=draft.updated_at.strftime("%d/%m %H:%M") if draft.updated_at else "",
        )

    async def _compute_cashback(
        self,
        *,
        order: PdvOrder,
        order_items: list[PdvOrderItem],
        store_id: str,
        requested_apply_amount: Decimal,
    ) -> tuple[Decimal, Decimal, list[dict[str, object]], CustomerCashbackWallet | None]:
        """Resolve the wallet-capped redeemed amount and rule-driven earned amount for a sale."""

        if not order.customer_id:
            return Decimal("0.00"), Decimal("0.00"), [], None
        cashback_repository = CashbackRepository(self.session)
        wallet = await cashback_repository.get_or_create_wallet(customer_id=order.customer_id)
        cashback_applied = max(Decimal("0.00"), min(requested_apply_amount, wallet.available_balance, order.total_amount))
        item_ids = [item.inventory_item_id for item in order_items if item.inventory_item_id]
        rules = await cashback_repository.resolve_rules_for_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            inventory_item_ids=item_ids,
        )
        cashback_earned = Decimal("0.00")
        earned_lines: list[dict[str, object]] = []
        for item in order_items:
            rule = rules.get(item.inventory_item_id) if item.inventory_item_id else None
            if rule is None or order.subtotal_amount < rule.minimum_order_amount:
                continue
            line_earn = (item.line_total * rule.cashback_percent / Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if rule.maximum_cashback_amount > Decimal("0.00"):
                line_earn = min(line_earn, rule.maximum_cashback_amount)
            if line_earn <= Decimal("0.00"):
                continue
            cashback_earned += line_earn
            earned_lines.append(
                {
                    "rule_id": rule.id,
                    "inventory_item_id": item.inventory_item_id,
                    "product_reference": item.item_name_snapshot,
                    "quantity": item.quantity,
                    "base_amount": item.line_total,
                    "cashback_percent": rule.cashback_percent,
                    "cashback_amount": line_earn,
                }
            )
        return cashback_applied, cashback_earned, earned_lines, wallet

    async def _settle_cashback_ledger(
        self,
        *,
        order: PdvOrder,
        sale: PdvSale,
        wallet: CustomerCashbackWallet,
        cashback_applied: Decimal,
        cashback_earned: Decimal,
        earned_lines: list[dict[str, object]],
    ) -> None:
        """Persist wallet-balance changes and ledger entries for a completed sale's cashback movement."""

        cashback_repository = CashbackRepository(self.session)
        if cashback_applied > Decimal("0.00"):
            wallet.available_balance = max(Decimal("0.00"), wallet.available_balance - cashback_applied)
            wallet.redeemed_total = wallet.redeemed_total + cashback_applied
            await cashback_repository.add_transaction(
                CashbackTransaction(
                    id=str(uuid4()),
                    tenant_id=str(self.subject.tenant_id),
                    customer_id=str(order.customer_id),
                    wallet_id=wallet.id,
                    transaction_type="redeem",
                    transaction_status="redeemed",
                    source_channel="pdv",
                    source_reference=order.order_code,
                    sale_reference=sale.sale_code,
                    gross_amount=cashback_applied,
                    net_amount=cashback_applied,
                    wallet_balance_after=wallet.available_balance,
                    granted_at_label="agora",
                    available_at_label="agora",
                )
            )
        if cashback_earned > Decimal("0.00"):
            wallet.available_balance = wallet.available_balance + cashback_earned
            wallet.lifetime_earned_total = wallet.lifetime_earned_total + cashback_earned
            transaction = await cashback_repository.add_transaction(
                CashbackTransaction(
                    id=str(uuid4()),
                    tenant_id=str(self.subject.tenant_id),
                    customer_id=str(order.customer_id),
                    wallet_id=wallet.id,
                    transaction_type="earn",
                    transaction_status="available",
                    source_channel="pdv",
                    source_reference=order.order_code,
                    sale_reference=sale.sale_code,
                    gross_amount=cashback_earned,
                    net_amount=cashback_earned,
                    wallet_balance_after=wallet.available_balance,
                    granted_at_label="agora",
                    available_at_label="agora",
                )
            )
            for line in earned_lines:
                await cashback_repository.add_transaction_line(
                    CashbackTransactionLine(
                        id=str(uuid4()),
                        transaction_id=transaction.id,
                        cashback_rule_id=line["rule_id"],
                        customer_id=str(order.customer_id),
                        inventory_item_id=line["inventory_item_id"],
                        product_reference=line["product_reference"],
                        quantity=line["quantity"],
                        base_amount=line["base_amount"],
                        cashback_percent=line["cashback_percent"],
                        cashback_amount=line["cashback_amount"],
                    )
                )
        customer = await cashback_repository.get_customer_by_id(tenant_id=str(self.subject.tenant_id), customer_id=str(order.customer_id))
        if customer is not None:
            customer.cashback_balance = wallet.available_balance

    async def _resolve_potential_cashback(self, customer_id: str | None) -> Decimal:
        """Return the customer's current cashback balance, i.e. the most that could still be redeemed on top of a discount."""

        if not customer_id:
            return Decimal("0.00")
        cashback_repository = CashbackRepository(self.session)
        wallet = await cashback_repository.get_or_create_wallet(customer_id=customer_id)
        return wallet.available_balance

    async def _resolve_discount_minimum_margin_percent(self) -> Decimal:
        """Return the tenant-configured minimum average margin a PDV discount must preserve across the whole cart."""

        portal_service = PortalService(self.session)
        settings = await portal_service.get_pdv_discount_settings(self.subject)
        return min(settings.minimum_margin_percent, Decimal("95.00"))

    def _discount_ceiling(self, lines: list[dict[str, object]], potential_cashback: Decimal, minimum_margin_percent: Decimal) -> Decimal:
        """Return the highest cart-wide discount percent that still keeps the cart's AVERAGE margin at/above the configured minimum.

        A flat discount percent lowers every line's revenue by the same
        proportion, so unlike a per-line floor, this looks at the cart as a
        whole: total cost vs. total revenue. A product with extra margin can
        offset another with tighter margin, as long as the blended margin
        across every line stays at or above the tenant's configured minimum.
        The customer's cashback balance is reserved against that same
        headroom up front, since it can be redeemed at checkout on top of
        whatever discount is granted here and would erode margin the same way.
        """

        subtotal = sum((Decimal(line["line_total"]) for line in lines), start=Decimal("0.00"))
        if subtotal <= Decimal("0.00"):
            return Decimal("0.00")
        cost_total = sum((Decimal(line["unit_cost_snapshot"]) * int(line["qty"]) for line in lines), start=Decimal("0.00"))
        floor_total = cost_total / (Decimal("1.00") - minimum_margin_percent / Decimal("100.00"))
        headroom_fraction = Decimal("1.00") - (floor_total / subtotal)
        max_discount_fraction = max(Decimal("0.00"), headroom_fraction - (potential_cashback / subtotal))
        return (max_discount_fraction * Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    async def _resolve_preview_lines(self, items: list[object]) -> list[dict[str, object]]:
        """Resolve inventory snapshots for a discount-limit preview, without locking rows or reserving stock."""

        lines: list[dict[str, object]] = []
        for item in items:
            inventory_item = await self.inventory_repository.get_item_by_id(tenant_id=str(self.subject.tenant_id), item_id=item.id)
            if inventory_item is None or not inventory_item.is_active:
                continue
            lines.append(
                {
                    "line_total": Decimal(inventory_item.sale_price) * item.qty,
                    "unit_cost_snapshot": inventory_item.acquisition_cost,
                    "qty": item.qty,
                }
            )
        return lines

    async def get_discount_limit(self, payload: PdvDiscountLimitRequest) -> PdvDiscountLimitResponse:
        """Return the maximum discount percent the current cart can absorb, given its average margin and the customer's cashback."""

        lines = await self._resolve_preview_lines(payload.items)
        potential_cashback = await self._resolve_potential_cashback(payload.customer_id)
        minimum_margin_percent = await self._resolve_discount_minimum_margin_percent()
        max_discount_percent = self._discount_ceiling(lines, potential_cashback, minimum_margin_percent) if lines else Decimal("0.00")
        return PdvDiscountLimitResponse(max_discount_percent=max_discount_percent)

    async def _enforce_prescription_gate(self, prepared: list[dict[str, object]], customer_id: str | None) -> list[Prescription]:
        """Block queue-order creation when any controlled line lacks an approved PDV prescription.

        Every item whose `controlled_category` isn't "none" must have a validated prescription
        on file for this customer before the order can be queued and its stock decremented —
        this is the same enforcement point that already blocks insufficient-stock sales.
        """

        controlled_lines = [line for line in prepared if line["controlled_category"] != "none"]
        if not controlled_lines:
            return []
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Identifique o cliente antes de vender um item que exige receita.",
            )
        latest = await self.prescription_repository.get_latest_for_items(
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer_id,
            inventory_item_ids=[str(line["inventory_item_id"]) for line in controlled_lines],
            source_channel="pdv",
        )
        matched: list[Prescription] = []
        for line in controlled_lines:
            prescription = latest.get(str(line["inventory_item_id"]))
            if prescription is None or prescription.status != "approved":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Receita pendente de validação para " + str(line["name"]) + ".",
                )
            matched.append(prescription)
        return matched

    async def _prepare_lines(self, items: list[object]) -> list[dict[str, object]]:
        """Resolve, validate, and reserve authoritative inventory snapshots for a PDV order.

        Items are looked up by id across every store in the tenant (not just the
        till's own operating store) since the balcão can now source a line from
        whichever branch actually has stock; the resolved item's own store_id
        becomes that line's source_store_id for the audit trail. Each row is
        locked with SELECT ... FOR UPDATE before its quantity is checked and
        decremented, so two concurrent orders can never both claim the same
        last unit — the second request blocks until the first commits, then
        sees the reduced quantity and fails cleanly if it's no longer enough.
        """

        prepared: list[dict[str, object]] = []
        for item in items:
            inventory_item = await self.inventory_repository.get_item_by_id_for_update(
                tenant_id=str(self.subject.tenant_id),
                item_id=item.id,
            )
            if inventory_item is None or not inventory_item.is_active:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found for PDV order.")
            if item.qty > inventory_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Estoque insuficiente para " + inventory_item.name + ": disponível " + str(inventory_item.quantity) + ", solicitado " + str(item.qty) + ".",
                )
            location_id = str(getattr(item, "location_id", "") or "")
            location_code = ""
            if location_id:
                location = await self.lot_repository.get_location_by_id(
                    tenant_id=str(self.subject.tenant_id), location_id=location_id,
                )
                if location is None or location.store_id != inventory_item.store_id:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Local de retirada inválido para " + inventory_item.name + ".",
                    )
                location_code = location.code
            quantity_before = inventory_item.quantity
            inventory_item.quantity = quantity_before - item.qty
            prepared.append(
                {
                    "inventory_item_id": inventory_item.id,
                    "source_store_id": inventory_item.store_id,
                    "name": inventory_item.name,
                    "brand": inventory_item.brand_name,
                    "ean": inventory_item.ean_code,
                    "loc": location_code or inventory_item.storage_location,
                    "location_id": location_id,
                    "qty": item.qty,
                    "unit_price": Decimal(inventory_item.sale_price),
                    "line_total": Decimal(inventory_item.sale_price) * item.qty,
                    "controlled": bool(inventory_item.is_controlled),
                    "controlled_category": inventory_item.controlled_category,
                    "quantity_before": quantity_before,
                    "resulting_quantity": inventory_item.quantity,
                    "unit_cost_snapshot": inventory_item.acquisition_cost,
                }
            )
        return prepared

    async def _write_stock_movement(
        self,
        *,
        line: dict[str, object],
        movement_type: str,
        quantity_delta: int,
        quantity_before: int,
        resulting_quantity: int,
        reason: str,
        reference_code: str,
    ) -> None:
        """Persist one inventory movement audit row for a PDV stock reservation or release."""

        await self.inventory_repository.add_movement(
            InventoryMovement(
                id=str(uuid4()),
                tenant_id=str(self.subject.tenant_id),
                store_id=str(line["source_store_id"]),
                inventory_item_id=str(line["inventory_item_id"]),
                performed_by_user_id=str(self.subject.user_id),
                movement_type=movement_type,
                quantity_delta=quantity_delta,
                quantity_before=quantity_before,
                resulting_quantity=resulting_quantity,
                reason=reason,
                note="",
                reference_code=reference_code,
                from_location_code=str(line["loc"]) if quantity_delta < 0 else "",
                to_location_code=str(line["loc"]) if quantity_delta > 0 else "",
                unit_cost_snapshot=line["unit_cost_snapshot"],
            )
        )
        if quantity_delta < 0:
            await decrement_lot_fefo(
                self.session,
                tenant_id=str(self.subject.tenant_id),
                store_id=str(line["source_store_id"]),
                inventory_item_id=str(line["inventory_item_id"]),
                quantity=-quantity_delta,
                performed_by_user_id=str(self.subject.user_id),
                reason=reason,
                reference_code=reference_code,
                source_type="pdv_sale",
                source_id=reference_code,
                location_id=str(line.get("location_id", "") or ""),
            )

    def _serialize_order(self, order: object, items: list[PdvLineResponse], payload_customer: object | None = None) -> PdvOrderResponse:
        """Convert one PDV order ORM row into the queue response shape."""

        customer = self._customer_from_payload(payload_customer) if payload_customer is not None else self._serialize_customer(order)
        return PdvOrderResponse(
            id=order.id,
            sent_at=order.queued_at_label or order.claimed_at_label or "agora",
            sent_by="Farmacêutico",
            status=order.order_status,
            discount=order.discount_percent,
            subtotal=order.subtotal_amount,
            total=order.total_amount,
            has_controlled=order.includes_controlled_items,
            fulfillment_type=getattr(order, "fulfillment_type", "pickup"),
            delivery_fee=getattr(order, "delivery_fee_amount", Decimal("0.00")),
            customer=customer,
            items=items,
            is_reservation=bool(getattr(order, "is_reservation", False)),
        )

    def _customer_from_payload(self, payload_customer: object) -> PdvCustomerLiteResponse:
        """Convert a pharmacist-supplied customer snapshot request into the response shape."""

        return PdvCustomerLiteResponse(
            id=getattr(payload_customer, "id", None),
            name=getattr(payload_customer, "name", ""),
            doc=getattr(payload_customer, "doc", ""),
            phone=getattr(payload_customer, "phone", ""),
            avatar=getattr(payload_customer, "avatar", ""),
            recurring=bool(getattr(payload_customer, "recurring", False)),
            cashback=getattr(payload_customer, "cashback", Decimal("0.00")),
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

