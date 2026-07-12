"""
farmaura-api/app/services/order_service.py

Order service for Farmaura.

Responsibilities:
- expose marketplace checkout, history, and internal order use-cases;
- enforce tenant-scoped operational status transitions;
- shape backend order aggregates for customer and pharmacist surfaces;

Observations:
- marketplace checkout totals remain server-authoritative;
- grouped marketplace products are expanded back into operational inventory lines.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from math import atan2, cos, radians, sin, sqrt
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.domain.enums import OrderStatus
from app.domain.validators import is_valid_cpf
from app.models.customer import Customer
from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.order_item import OrderItem
from app.models.prescription import Prescription
from app.models.prescription_check import PrescriptionCheck
from app.models.prescription_item import PrescriptionItem
from app.repositories.customer_repository import CustomerRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenSubject
from app.schemas.fiscal import FiscalDocumentResponse
from app.schemas.orders import (
    CheckoutOrderRequest,
    InternalOrderBoardChangeResponse,
    InternalOrderBoardResponse,
    InternalOrderItemResponse,
    InternalOrderResponse,
    MarketplaceOrderChangeResponse,
    MarketplaceOrderItemResponse,
    MarketplaceOrderListResponse,
    MarketplaceOrderResponse,
    OrderAdvanceRequest,
    OrderCreateRequest,
    OrderItemLocationUpdateRequest,
    OrderResponse,
    PickupCodeConfirmRequest,
)
from app.services.fiscal_service import FiscalService
from app.services.geocoding_client import GeocodingClient
from app.services.marketplace_projection import (
    build_marketplace_catalog_groups,
    build_marketplace_product_id,
    quantize_money,
)


# ============================================================================
# ORDER SERVICE
# ============================================================================


class OrderService:
    """Provide order use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject | None = None) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = OrderRepository(session)
        self.inventory_repository = InventoryRepository(session)
        self.customer_repository = CustomerRepository(session)
        self.user_repository = UserRepository(session)
        self.store_id = ""

    async def list_orders(self) -> MarketplaceOrderListResponse:
        """Return marketplace orders for the authenticated customer."""

        subject = self._require_subject()
        customer = await self._resolve_customer(subject)
        if customer is None:
            return MarketplaceOrderListResponse(revision="", items=[])
        return await self._build_marketplace_orders_response(tenant_id=str(subject.tenant_id), customer_id=customer.id)

    async def get_marketplace_order_changes(self, *, since: str) -> MarketplaceOrderChangeResponse:
        """Return a lightweight sync response for marketplace order tracking."""

        subject = self._require_subject()
        customer = await self._resolve_customer(subject)
        if customer is None:
            return MarketplaceOrderChangeResponse(revision="", has_changes=False, items=[])
        revision_dt = await self.repository.get_latest_customer_revision(tenant_id=str(subject.tenant_id), customer_id=customer.id)
        revision = self._format_revision(revision_dt)
        normalized_since = str(since or '').strip()
        if revision == normalized_since:
            return MarketplaceOrderChangeResponse(revision=revision, has_changes=False, items=[])
        since_dt = self._parse_revision(since)
        if revision_dt is not None and since_dt is not None and revision_dt <= since_dt:
            return MarketplaceOrderChangeResponse(revision=revision, has_changes=False, items=[])
        response = await self._build_marketplace_orders_response(tenant_id=str(subject.tenant_id), customer_id=customer.id)
        return MarketplaceOrderChangeResponse(revision=response.revision, has_changes=True, items=response.items)

    async def prepare_order(self, payload: OrderCreateRequest) -> OrderResponse:
        """Prepare a conservative draft order response."""

        total_amount = sum((item.unit_price * item.quantity for item in payload.items), start=Decimal("0.00"))
        return OrderResponse(
            id="draft",
            customer_id=payload.customer_id,
            status="draft",
            total_amount=quantize_money(total_amount),
        )

    async def create_marketplace_order(self, payload: CheckoutOrderRequest) -> MarketplaceOrderResponse:
        """Persist a marketplace order with the submitted payment data."""

        subject = self._require_subject()
        customer = await self._resolve_customer(subject)
        if customer is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Customer profile unavailable for checkout.")
        if not is_valid_cpf(customer.cpf or ""):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe um CPF válido em Minha Conta antes de finalizar a compra.",
            )
        store_id = await self._get_store_id(subject)
        inventory_items = await self.inventory_repository.list_items(
            tenant_id=str(subject.tenant_id),
            store_id=store_id,
            active_only=True,
        )
        grouped = build_marketplace_catalog_groups(inventory_items)
        grouped_map = {str(item['id']): item for item in grouped}
        requested_groups: list[dict[str, object]] = []
        for line in payload.items:
            group = grouped_map.get(line.product_id)
            if group is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Marketplace product not found: {line.product_id}")
            if int(group['stock']) < line.quantity:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Insufficient stock for {group['name']}.",
                )
            requested_groups.append({"request": line, "group": group})
        subtotal_amount = quantize_money(
            sum((Decimal(group['price']) * Decimal(entry['request'].quantity) for entry in requested_groups), start=Decimal('0.00'))
        )
        delivery_fee_amount = Decimal('0.00')
        if payload.delivery.method != 'pickup' and subtotal_amount < Decimal('120.00'):
            delivery_fee_amount = Decimal('9.90')
        coupon_discount = Decimal('0.00')
        if payload.coupon_type == 'shipping_full':
            coupon_discount = quantize_money(delivery_fee_amount)
        elif payload.coupon_type == 'shipping_fixed':
            coupon_discount = quantize_money(min(delivery_fee_amount, payload.coupon_amount))
        elif payload.coupon_type == 'shipping_percent':
            coupon_discount = quantize_money(delivery_fee_amount * (payload.coupon_percent / Decimal('100')))
        elif payload.coupon_amount > 0:
            coupon_discount = quantize_money(min(subtotal_amount, payload.coupon_amount))
        elif payload.coupon_percent > 0:
            coupon_discount = quantize_money(subtotal_amount * (payload.coupon_percent / Decimal('100')))
        total_amount = quantize_money(subtotal_amount - coupon_discount + delivery_fee_amount)
        now = datetime.now(UTC)
        order = Order(
            id=str(uuid4()),
            tenant_id=str(subject.tenant_id),
            store_id=store_id,
            customer_id=customer.id,
            selected_address_id=None,
            selected_payment_method_id=None,
            order_code=self._build_order_code(now),
            channel=payload.channel or 'app',
            status=OrderStatus.NEW.value,
            fulfillment_type='pickup' if payload.delivery.method == 'pickup' else 'delivery',
            priority='express' if payload.delivery.method == 'express' else 'normal',
            payment_method_label=self._build_payment_label(payload.payment.method),
            payment_status='approved',
            customer_display_name=customer.full_name,
            customer_document_snapshot=customer.cpf,
            customer_phone_snapshot=payload.delivery.recipient_phone or customer.phone,
            customer_email_snapshot=customer.email,
            requires_prescription_review=any(bool(group['group']['requires_prescription']) for group in requested_groups),
            prescription_status='pending' if any(bool(group['group']['requires_prescription']) for group in requested_groups) else 'none',
            subtotal_amount=subtotal_amount,
            delivery_fee_amount=delivery_fee_amount,
            discount_amount=coupon_discount,
            cashback_applied_amount=Decimal('0.00'),
            cashback_earned_amount=Decimal('0.00'),
            total_amount=total_amount,
            placed_at_label=now.astimezone(UTC).strftime('%H:%M'),
            estimated_ready_at_label=self._build_ready_label(now, payload.delivery.method),
            estimated_delivery_at_label=self._build_delivery_eta(now, payload.delivery.method),
            completed_at_label='',
            marketplace_note=self._build_marketplace_note(payload),
            internal_note='Pagamento registrado automaticamente pelo checkout digital.',
            is_active=True,
        )
        await self.repository.add_order(order)
        created_items: list[OrderItem] = []
        for requested in requested_groups:
            remaining_quantity = int(requested['request'].quantity)
            group = requested['group']
            for component in list(group['components']):
                if remaining_quantity <= 0:
                    break
                available_quantity = int(component['quantity'])
                if available_quantity <= 0:
                    continue
                allocated_quantity = min(remaining_quantity, available_quantity)
                inventory_item = component['item']
                order_item = OrderItem(
                    id=str(uuid4()),
                    order_id=order.id,
                    inventory_item_id=str(component['inventory_item_id']),
                    marketplace_listing_id=None,
                    item_sku=str(component['sku'] or getattr(inventory_item, 'sku', '')),
                    item_name_snapshot=str(group['name']),
                    brand_name_snapshot=str(group['brand']),
                    category_name_snapshot=str(getattr(inventory_item, 'category_name', '') or group['cat']),
                    ean_code_snapshot=str(component['ean']),
                    storage_location_snapshot=str(component['storage_location']),
                    quantity=allocated_quantity,
                    unit_price=Decimal(group['price']),
                    line_total=quantize_money(Decimal(group['price']) * Decimal(allocated_quantity)),
                    requires_prescription_upload=bool(group['requires_prescription']),
                    prescription_status='pending' if bool(group['requires_prescription']) else 'none',
                    picked_for_fulfillment=False,
                    picked_at_label='',
                )
                await self.repository.add_order_item(order_item)
                created_items.append(order_item)
                remaining_quantity -= allocated_quantity
            if remaining_quantity > 0:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Unable to allocate stock across grouped inventory items.')
        fulfillment = await self._build_fulfillment(order=order, customer=customer, payload=payload, now=now)
        await self.repository.add_fulfillment(fulfillment)
        if order.fulfillment_type == 'delivery':
            await self._attach_delivery_route_stop(order=order, fulfillment=fulfillment, subject=subject, store_id=store_id, now=now)
        if order.requires_prescription_review:
            await self._create_prescription_snapshot(order=order, customer=customer, payload=payload, order_items=created_items)
        fiscal_service = FiscalService(self.session)
        fiscal_document = await fiscal_service.issue_for_order(order=order, customer=customer)
        await self.session.commit()
        fiscal_response = fiscal_service.serialize_document(fiscal_document)
        if customer.email:
            try:
                fiscal_service.notification_service.send_fiscal_document_email(
                    document=fiscal_document,
                    email=customer.email,
                    printable_html_url=fiscal_response.printable_html_url,
                )
            except Exception:
                pass
        return self._serialize_marketplace_order(order, created_items, fulfillment, fiscal_document=fiscal_response)

    async def list_internal_board(self) -> InternalOrderBoardResponse:
        """Return the pharmacist operational order board."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject)
        return await self._build_internal_board_response(tenant_id=str(subject.tenant_id), store_id=store_id)

    async def get_internal_board_changes(self, *, since: str) -> InternalOrderBoardChangeResponse:
        """Return a webhook-like sync response for board refreshes."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject)
        revision_dt = await self.repository.get_latest_board_revision(tenant_id=str(subject.tenant_id), store_id=store_id)
        revision = self._format_revision(revision_dt)
        since_dt = self._parse_revision(since)
        if revision_dt is not None and since_dt is not None and revision_dt <= since_dt:
            return InternalOrderBoardChangeResponse(revision=revision, has_changes=False, items=[])
        board = await self._build_internal_board_response(tenant_id=str(subject.tenant_id), store_id=store_id)
        return InternalOrderBoardChangeResponse(revision=board.revision, has_changes=True, items=board.items)

    async def update_internal_order_item_location(
        self,
        *,
        order_id: str,
        item_id: str,
        payload: OrderItemLocationUpdateRequest,
    ) -> InternalOrderResponse:
        """Persist the selected stock address for one picked order item."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject)
        order = await self.repository.get_by_id(tenant_id=str(subject.tenant_id), order_id=order_id, store_id=store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Order not found.')
        item = await self.repository.get_item_by_id(tenant_id=str(subject.tenant_id), order_id=order_id, item_id=item_id, store_id=store_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Order item not found.')
        location = await self.inventory_repository.get_location_by_code(
            tenant_id=str(subject.tenant_id),
            store_id=store_id,
            code=payload.location_code.strip(),
        )
        if location is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Storage location not found.')
        item.storage_location_snapshot = location.code
        order.updated_at = datetime.now(UTC)
        await self.session.commit()
        return await self._load_internal_order(order)

    async def confirm_internal_pickup(self, *, order_id: str, payload: PickupCodeConfirmRequest) -> InternalOrderResponse:
        """Validate the pickup code informed by the customer and finish the order."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject)
        order = await self.repository.get_by_id(tenant_id=str(subject.tenant_id), order_id=order_id, store_id=store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Order not found.')
        if order.fulfillment_type != 'pickup':
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Pickup validation is only available for retirada orders.')
        if order.status != OrderStatus.READY.value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Order is not ready for pickup confirmation.')
        fulfillment = await self.repository.get_fulfillment_by_order_id(order_id=order.id)
        if fulfillment is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Pickup fulfillment payload unavailable.')
        informed_code = payload.code.strip().upper()
        expected_code = str(fulfillment.pickup_code or '').strip().upper()
        if not expected_code or informed_code != expected_code:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Invalid pickup code.')
        now = datetime.now(UTC)
        order.status = OrderStatus.DISPATCHED.value
        order.completed_at_label = 'Retirado'
        order.updated_at = now
        fulfillment.picked_up_at_label = now.strftime('%H:%M')
        await self.session.commit()
        return await self._load_internal_order(order)

    async def advance_internal_order(self, order_id: str, payload: OrderAdvanceRequest) -> InternalOrderResponse:
        """Advance one order through the pharmacist operational workflow."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject)
        order = await self.repository.get_by_id(tenant_id=str(subject.tenant_id), order_id=order_id, store_id=store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Order not found.')
        allowed_transitions = {
            OrderStatus.NEW.value: OrderStatus.SEPARATING.value,
            OrderStatus.SEPARATING.value: OrderStatus.READY.value,
            OrderStatus.READY.value: OrderStatus.DISPATCHED.value,
        }
        expected_next = allowed_transitions.get(order.status)
        if expected_next != payload.next_status:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Invalid order transition.')
        if order.fulfillment_type == 'pickup' and payload.next_status == OrderStatus.DISPATCHED.value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Use pickup code confirmation to conclude retirada orders.')
        fulfillment = await self.repository.get_fulfillment_by_order_id(order_id=order.id)
        now = datetime.now(UTC)
        order.status = payload.next_status
        order.updated_at = now
        if payload.next_status == OrderStatus.READY.value:
            order.completed_at_label = order.completed_at_label or 'Pronto'
            if fulfillment is not None and not fulfillment.ready_at_label:
                fulfillment.ready_at_label = now.strftime('%H:%M')
        if payload.next_status == OrderStatus.DISPATCHED.value:
            order.completed_at_label = order.completed_at_label or 'Despachado'
            if fulfillment is not None:
                fulfillment.dispatched_at_label = now.strftime('%H:%M')
        await self.session.commit()
        return await self._load_internal_order(order)

    def _serialize_marketplace_order(
        self,
        order: Order,
        items: list[OrderItem],
        fulfillment: OrderFulfillment | None,
        *,
        fiscal_document: FiscalDocumentResponse | None = None,
    ) -> MarketplaceOrderResponse:
        """Convert one persisted order into the marketplace response shape."""

        grouped_items: dict[str, MarketplaceOrderItemResponse] = {}
        for item in items:
            product_id = build_marketplace_product_id(item.item_name_snapshot, item.brand_name_snapshot, item.inventory_item_id or item.id)
            if product_id not in grouped_items:
                grouped_items[product_id] = MarketplaceOrderItemResponse(
                    product_id=product_id,
                    name=item.item_name_snapshot,
                    brand=item.brand_name_snapshot,
                    qty=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                    rx=item.requires_prescription_upload,
                )
                continue
            current = grouped_items[product_id]
            grouped_items[product_id] = MarketplaceOrderItemResponse(
                product_id=product_id,
                name=current.name,
                brand=current.brand,
                qty=current.qty + item.quantity,
                unit_price=current.unit_price,
                line_total=quantize_money(current.line_total + item.line_total),
                rx=current.rx or item.requires_prescription_upload,
            )
        eta = ''
        if fulfillment is not None:
            eta = fulfillment.eta_label or fulfillment.ready_at_label or fulfillment.dispatched_at_label or ''
        if not eta:
            eta = order.estimated_delivery_at_label or order.estimated_ready_at_label or ''
        address = fulfillment.address_line if fulfillment and order.fulfillment_type == 'delivery' else ''
        store = fulfillment.store_label if fulfillment and order.fulfillment_type == 'pickup' else ''
        return MarketplaceOrderResponse(
            id=order.id,
            code=order.order_code,
            status=order.status,
            fulfillment=order.fulfillment_type,
            payment_method=order.payment_method_label,
            payment_status=order.payment_status,
            placed_at=order.placed_at_label,
            eta=eta,
            total_amount=order.total_amount,
            subtotal_amount=order.subtotal_amount,
            delivery_fee_amount=order.delivery_fee_amount,
            discount_amount=order.discount_amount,
            address=address,
            store=store,
            pickup_code=fulfillment.pickup_code if fulfillment and order.fulfillment_type == 'pickup' else '',
            rx_status=order.prescription_status,
            items=list(grouped_items.values()),
            fiscal_document=fiscal_document,
        )

    def _serialize_internal_order(
        self,
        order: Order,
        items: list[InternalOrderItemResponse],
        fulfillment: OrderFulfillment | None,
        *,
        fiscal_document: FiscalDocumentResponse | None = None,
    ) -> InternalOrderResponse:
        """Convert one ORM order aggregate into the internal response shape."""

        distance = fulfillment.route_distance_km if fulfillment and fulfillment.route_distance_km is not None else None
        latitude = fulfillment.latitude if fulfillment and fulfillment.latitude not in {None, Decimal('0E-7'), Decimal('0.0000000')} else None
        longitude = fulfillment.longitude if fulfillment and fulfillment.longitude not in {None, Decimal('0E-7'), Decimal('0.0000000')} else None
        return InternalOrderResponse(
            record_id=order.id,
            id=order.order_code or order.id,
            customer=order.customer_display_name,
            phone=order.customer_phone_snapshot,
            doc=order.customer_document_snapshot,
            status=order.status,
            fulfillment=order.fulfillment_type,
            fulfillment_label='Retirada na loja' if order.fulfillment_type == 'pickup' else 'Entrega em domicilio',
            priority=order.priority,
            placed=order.placed_at_label,
            payment=order.payment_method_label,
            channel=order.channel,
            total=order.total_amount,
            address=fulfillment.address_line if fulfillment else '',
            district=fulfillment.district if fulfillment else '',
            cep=fulfillment.postal_code if fulfillment else '',
            store=fulfillment.store_label if fulfillment else '',
            pickup_code='',
            pickup_code_required=bool(fulfillment and fulfillment.fulfillment_type == 'pickup' and order.status == OrderStatus.READY.value),
            note=order.marketplace_note,
            rx=order.requires_prescription_review,
            rx_status=order.prescription_status,
            done_min=None,
            lat=latitude,
            lng=longitude,
            dist=distance,
            sla=fulfillment.sla_target_minutes if fulfillment else None,
            eta=(fulfillment.eta_label if fulfillment else '') or order.estimated_delivery_at_label or order.estimated_ready_at_label,
            items=items,
            fiscal_document=fiscal_document,
        )

    async def _build_marketplace_orders_response(self, *, tenant_id: str, customer_id: str) -> MarketplaceOrderListResponse:
        """Return marketplace orders with revision metadata for one customer."""

        orders = await self.repository.list_by_customer(tenant_id=tenant_id, customer_id=customer_id)
        order_ids = [order.id for order in orders]
        items = await self.repository.list_items(order_ids=order_ids)
        fulfillments = await self.repository.list_fulfillments(order_ids=order_ids)
        fiscal_map = await FiscalService(self.session).map_by_order_ids(order_ids=order_ids)
        item_map: dict[str, list[OrderItem]] = {}
        for item in items:
            item_map.setdefault(item.order_id, []).append(item)
        fulfillment_map = {item.order_id: item for item in fulfillments}
        revision = self._format_revision(await self.repository.get_latest_customer_revision(tenant_id=tenant_id, customer_id=customer_id))
        return MarketplaceOrderListResponse(
            revision=revision,
            items=[
                self._serialize_marketplace_order(
                    order, item_map.get(order.id, []), fulfillment_map.get(order.id), fiscal_document=fiscal_map.get(order.id)
                )
                for order in orders
            ],
        )

    async def _build_internal_board_response(self, *, tenant_id: str, store_id: str) -> InternalOrderBoardResponse:
        """Return the full internal board payload with revision metadata."""

        orders = await self.repository.list_for_operations(tenant_id=tenant_id, store_id=store_id)
        order_ids = [order.id for order in orders]
        items = await self.repository.list_items(order_ids=order_ids)
        fulfillments = await self.repository.list_fulfillments(order_ids=order_ids)
        fiscal_map = await FiscalService(self.session).map_by_order_ids(order_ids=order_ids)
        item_map: dict[str, list[InternalOrderItemResponse]] = {}
        for item in items:
            item_map.setdefault(item.order_id, []).append(
                InternalOrderItemResponse(
                    id=item.id,
                    name=item.item_name_snapshot,
                    qty=item.quantity,
                    loc=item.storage_location_snapshot,
                    rx=item.requires_prescription_upload,
                )
            )
        fulfillment_map = {row.order_id: row for row in fulfillments}
        revision = self._format_revision(await self.repository.get_latest_board_revision(tenant_id=tenant_id, store_id=store_id))
        return InternalOrderBoardResponse(
            revision=revision,
            items=[
                self._serialize_internal_order(
                    order, item_map.get(order.id, []), fulfillment_map.get(order.id), fiscal_document=fiscal_map.get(order.id)
                )
                for order in orders
            ],
        )

    async def _load_internal_order(self, order: Order) -> InternalOrderResponse:
        """Reload one order aggregate and serialize it for the internal UI."""

        items = await self.repository.list_items(order_ids=[order.id])
        fulfillment = await self.repository.get_fulfillment_by_order_id(order_id=order.id)
        fiscal_map = await FiscalService(self.session).map_by_order_ids(order_ids=[order.id])
        return self._serialize_internal_order(
            order,
            [
                InternalOrderItemResponse(
                    id=item.id,
                    name=item.item_name_snapshot,
                    qty=item.quantity,
                    loc=item.storage_location_snapshot,
                    rx=item.requires_prescription_upload,
                )
                for item in items
            ],
            fulfillment,
            fiscal_document=fiscal_map.get(order.id),
        )

    async def _resolve_customer(self, subject: TokenSubject) -> Customer | None:
        """Return or provision the marketplace customer linked to the authenticated user."""

        user = await self.user_repository.get_by_id(str(subject.user_id))
        if user is None:
            return None
        return await self.customer_repository.get_or_create(
            tenant_id=str(subject.tenant_id),
            user_id=str(subject.user_id),
            email=user.email,
            full_name=user.full_name,
        )

    def _require_subject(self) -> TokenSubject:
        """Return the authenticated subject or fail closed."""

        if self.subject is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Authenticated subject required.')
        return self.subject

    async def _get_store_id(self, subject: TokenSubject) -> str:
        """Resolve the active store identifier for the current tenant."""

        if not self.store_id:
            self.store_id = await self.inventory_repository.get_primary_store_id(tenant_id=str(subject.tenant_id))
        return self.store_id

    def _build_order_code(self, now: datetime) -> str:
        """Return a readable order code."""

        return 'FA-' + now.strftime('%H%M%S') + '-' + uuid4().hex[:4].upper()

    def _build_payment_label(self, method: str) -> str:
        """Return the customer-facing payment label for the selected payment method."""

        labels = {
            'pix': 'Pix',
            'credit_card': 'Cartão de crédito',
            'debit_card': 'Cartão de débito',
        }
        return labels.get(method, 'Pagamento')

    def _build_marketplace_note(self, payload: CheckoutOrderRequest) -> str:
        """Return the marketplace note snapshot from checkout data."""

        parts = []
        if payload.coupon_code.strip():
            coupon_snapshot = 'Cupom: ' + payload.coupon_code.strip()
            if payload.coupon_amount > 0:
                coupon_snapshot += ' · desconto ' + str(quantize_money(payload.coupon_amount))
            elif payload.coupon_percent > 0:
                coupon_snapshot += ' · ' + str(payload.coupon_percent) + '%'
            parts.append(coupon_snapshot)
        if payload.delivery.reference_note.strip():
            parts.append(payload.delivery.reference_note.strip())
        if payload.delivery.address_complement.strip():
            parts.append('Complemento: ' + payload.delivery.address_complement.strip())
        if payload.prescription.sent:
            parts.append('Receita enviada no checkout.')
        return ' | '.join(parts)

    def _build_ready_label(self, now: datetime, method: str) -> str:
        """Return the pickup-ready label."""

        if method == 'pickup':
            return (now + timedelta(minutes=20)).strftime('%H:%M')
        return ''

    def _build_delivery_eta(self, now: datetime, method: str) -> str:
        """Return the delivery ETA label."""

        if method == 'pickup':
            return ''
        minutes = 60 if method == 'express' else 180
        return (now + timedelta(minutes=minutes)).strftime('%H:%M')

    async def _resolve_delivery_geo(self, address_text: str) -> tuple[Decimal, Decimal, Decimal]:
        """Return (latitude, longitude, distance_km) from real geocoding, or zeros when unavailable."""

        client = GeocodingClient()
        delivery_point = await asyncio.to_thread(client.geocode, address_text)
        if delivery_point is None:
            return Decimal('0.0000000'), Decimal('0.0000000'), Decimal('0.00')
        hub_address = (get_settings().store_hub_address or '').strip()
        hub_point = await asyncio.to_thread(client.geocode, hub_address) if hub_address else None
        distance = (
            self._haversine_km(hub_point.latitude, hub_point.longitude, delivery_point.latitude, delivery_point.longitude)
            if hub_point is not None
            else Decimal('0.00')
        )
        return delivery_point.latitude, delivery_point.longitude, distance

    def _haversine_km(self, lat1: Decimal, lng1: Decimal, lat2: Decimal, lng2: Decimal) -> Decimal:
        """Return the real great-circle distance in kilometers between two coordinates."""

        earth_radius_km = 6371.0
        phi1, phi2 = radians(float(lat1)), radians(float(lat2))
        delta_phi = radians(float(lat2) - float(lat1))
        delta_lambda = radians(float(lng2) - float(lng1))
        a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
        return quantize_money(Decimal(str(earth_radius_km * 2 * atan2(sqrt(a), sqrt(1 - a)))))

    async def _build_fulfillment(self, *, order: Order, customer: object, payload: CheckoutOrderRequest, now: datetime) -> OrderFulfillment:
        """Return the persisted order fulfillment snapshot."""

        store_label = payload.delivery.store_name.strip() or (get_settings().store_hub_name or '').strip() or 'Farmácia Farmaura'
        if order.fulfillment_type == 'pickup':
            return OrderFulfillment(
                id=str(uuid4()),
                order_id=order.id,
                fulfillment_type='pickup',
                store_label=store_label,
                pickup_code='R-' + uuid4().hex[:4].upper(),
                recipient_name=payload.delivery.recipient_name or customer.full_name,
                recipient_document_snapshot=customer.cpf,
                recipient_phone=payload.delivery.recipient_phone or customer.phone,
                address_line='',
                district='',
                city='',
                state_code='',
                postal_code='',
                reference_note=payload.delivery.reference_note,
                latitude=Decimal('0.0000000'),
                longitude=Decimal('0.0000000'),
                route_distance_km=Decimal('0.00'),
                route_sequence=0,
                sla_target_minutes=20,
                eta_label='Pronto em 20 min',
                ready_at_label=(now + timedelta(minutes=20)).strftime('%H:%M'),
                dispatched_at_label='',
                delivered_at_label='',
                picked_up_at_label='',
                driver_name='',
                driver_phone='',
            )
        full_address = ', '.join(part for part in [
            ' '.join(part for part in [payload.delivery.address_line, payload.delivery.address_number] if part).strip(),
            payload.delivery.district,
            payload.delivery.city,
            payload.delivery.state_code,
            payload.delivery.postal_code,
        ] if part)
        latitude, longitude, distance = await self._resolve_delivery_geo(full_address)
        eta_minutes = 60 if payload.delivery.method == 'express' else 180
        return OrderFulfillment(
            id=str(uuid4()),
            order_id=order.id,
            fulfillment_type='delivery',
            store_label=store_label,
            pickup_code='',
            recipient_name=payload.delivery.recipient_name or customer.full_name,
            recipient_document_snapshot=customer.cpf,
            recipient_phone=payload.delivery.recipient_phone or customer.phone,
            address_line=' '.join(part for part in [payload.delivery.address_line, payload.delivery.address_number] if part).strip(),
            district=payload.delivery.district,
            city=payload.delivery.city,
            state_code=payload.delivery.state_code,
            postal_code=payload.delivery.postal_code,
            reference_note=payload.delivery.reference_note,
            latitude=latitude,
            longitude=longitude,
            route_distance_km=distance,
            route_sequence=0,
            sla_target_minutes=eta_minutes,
            eta_label='Hoje, ate ' + (now + timedelta(minutes=eta_minutes)).strftime('%H:%M'),
            ready_at_label='',
            dispatched_at_label='',
            delivered_at_label='',
            picked_up_at_label='',
            driver_name='',
            driver_phone='',
        )

    async def _attach_delivery_route_stop(
        self,
        *,
        order: Order,
        fulfillment: OrderFulfillment,
        subject: TokenSubject,
        store_id: str,
        now: datetime,
    ) -> None:
        """Append the placed delivery order as a real stop on the tenant's active route."""

        tenant_id = str(subject.tenant_id)
        route = await self.repository.get_active_delivery_route(tenant_id=tenant_id, store_id=store_id)
        if route is None:
            hub_name = (get_settings().store_hub_name or '').strip() or fulfillment.store_label
            hub_address = (get_settings().store_hub_address or '').strip()
            hub_point = await asyncio.to_thread(GeocodingClient().geocode, hub_address) if hub_address else None
            route = DeliveryRoute(
                id=str(uuid4()),
                tenant_id=tenant_id,
                store_id=store_id,
                route_code=self._build_route_code(now),
                route_status='planned',
                origin_name=hub_name,
                origin_address=hub_address,
                origin_latitude=hub_point.latitude if hub_point else Decimal('0.0000000'),
                origin_longitude=hub_point.longitude if hub_point else Decimal('0.0000000'),
                route_provider='nominatim' if hub_point else '',
                planned_at_label=now.strftime('%H:%M'),
            )
            route = await self.repository.add_delivery_route(route)
        next_sequence = await self.repository.get_next_route_stop_sequence(route_id=route.id)
        stop = DeliveryRouteStop(
            id=str(uuid4()),
            route_id=route.id,
            order_id=order.id,
            order_fulfillment_id=fulfillment.id,
            stop_sequence=next_sequence,
            stop_status='planned',
            customer_name_snapshot=fulfillment.recipient_name,
            address_line_snapshot=fulfillment.address_line,
            district_snapshot=fulfillment.district,
            postal_code_snapshot=fulfillment.postal_code,
            latitude=fulfillment.latitude,
            longitude=fulfillment.longitude,
            distance_from_origin_km=fulfillment.route_distance_km,
            estimated_arrival_label=fulfillment.eta_label,
        )
        await self.repository.add_delivery_route_stop(stop)
        route.stop_count = int(route.stop_count or 0) + 1
        route.total_distance_km = quantize_money(Decimal(route.total_distance_km or 0) + Decimal(fulfillment.route_distance_km or 0))
        await self.repository.save_delivery_route(route)

    def _build_route_code(self, now: datetime) -> str:
        """Return a readable delivery route code."""

        return 'ROTA-' + now.strftime('%Y%m%d') + '-' + uuid4().hex[:4].upper()

    def _format_revision(self, value: datetime | None) -> str:
        """Return a stable string representation for board revisions."""

        if value is None:
            return ''
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat()

    def _parse_revision(self, value: str) -> datetime | None:
        """Parse a board revision string into a UTC datetime."""

        cleaned = str(value or '').strip()
        if not cleaned:
            return None
        try:
            parsed = datetime.fromisoformat(cleaned)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)

    async def _create_prescription_snapshot(
        self,
        *,
        order: Order,
        customer: object,
        payload: CheckoutOrderRequest,
        order_items: list[OrderItem],
    ) -> None:
        """Persist a prescription snapshot for items that require pharmacist review."""

        prescription = Prescription(
            id=str(uuid4()),
            tenant_id=order.tenant_id,
            customer_id=customer.id,
            order_id=order.id,
            reviewed_by_user_id=None,
            prescription_code='RX-' + uuid4().hex[:6].upper(),
            source_channel='marketplace',
            status='pending',
            patient_name_snapshot=customer.full_name,
            patient_document_snapshot=customer.cpf,
            patient_age_years=None,
            patient_phone_snapshot=customer.phone,
            doctor_name='',
            doctor_license_number='',
            prescription_type='Receita digital enviada no checkout' if payload.prescription.sent else 'Receita pendente de envio',
            issued_on_label='',
            remaining_validity_days=None,
            submitted_at_label='agora' if payload.prescription.sent else 'pendente de envio',
            reviewed_at_label='',
            pharmacist_notes='Receita aguardando validacao.' if payload.prescription.sent else 'Pedido exige receita; cliente ainda nao anexou o arquivo.',
            rejection_reason='',
            has_controlled_medication=any(item.requires_prescription_upload for item in order_items),
            requires_retention=True,
        )
        self.session.add(prescription)
        await self.session.flush()
        for order_item in order_items:
            if not order_item.requires_prescription_upload:
                continue
            self.session.add(
                PrescriptionItem(
                    id=str(uuid4()),
                    prescription_id=prescription.id,
                    order_item_id=order_item.id,
                    inventory_item_id=order_item.inventory_item_id,
                    marketplace_listing_id=None,
                    medication_name=order_item.item_name_snapshot,
                    dosage_instructions='Conforme orientacao medica.',
                    prescribed_quantity_label=str(order_item.quantity) + ' unidade(s)',
                    matches_requested_item=True,
                    pharmacist_note='',
                )
            )
        for key, label in [
            ('legible', 'Receita legivel e sem rasuras'),
            ('validDate', 'Dentro do prazo de validade'),
            ('doseOk', 'Posologia compativel com o pedido'),
            ('crmOk', 'CRM e assinatura do prescritor'),
        ]:
            self.session.add(
                PrescriptionCheck(
                    id=str(uuid4()),
                    prescription_id=prescription.id,
                    check_key=key,
                    check_label=label,
                    is_passed=False,
                    note='',
                )
            )
