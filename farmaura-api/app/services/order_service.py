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

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_scope
from app.domain.enums import OrderStatus, UserRole
from app.domain.validators import is_valid_cpf
from app.models.customer import Customer
from app.models.inventory_movement import InventoryMovement
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.order_item import OrderItem
from app.models.prescription import Prescription
from app.models.prescription_check import PrescriptionCheck
from app.models.prescription_item import PrescriptionItem
from app.repositories.customer_payment_method_repository import CustomerPaymentMethodRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.store_repository import StoreRepository
from app.repositories.user_repository import UserRepository
from app.services.catalog_service import CATALOG_CACHE_NAMESPACE
from app.schemas.auth import TokenSubject
from app.schemas.fiscal import FiscalDocumentResponse
from app.schemas.orders import (
    CheckoutOrderRequest,
    DeliveryCoverageResponse,
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
    OrderItemPickRequest,
    OrderResponse,
    PickupCodeConfirmRequest,
)
from app.services.delivery_pricing_service import DeliveryPricingService
from app.services.fiscal_service import FiscalService
from app.services.inventory_stock_sync import decrement_lot_fefo
from app.services.marketplace_projection import (
    build_marketplace_catalog_groups,
    build_marketplace_product_id,
    quantize_money,
)
from app.services.melhor_envio_client import MelhorEnvioError
from app.services.payment_service import PaymentService
from app.services.portal_service import PortalService
from app.services.shipping_service import ShippingService
from app.schemas.portal import (
    PortalDeliveryPricingResponse,
    PortalDeliveryAreasResponse,
    PortalDeliveryFuelConfig,
    PortalDeliveryNeighborhood,
    PortalDeliveryPriceRule,
    PortalDeliveryRadiusTier,
    PortalDeliveryStoreAreaConfig,
    PortalDeliveryVariation,
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
        self.store_repository = StoreRepository(session)
        self.delivery_pricing = DeliveryPricingService(session)
        self.store_id: str | None = None

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
        requested_items = [(line.product_id, line.quantity) for line in payload.items]
        store_resolution = None
        if payload.delivery.method == 'pickup':
            store_id = payload.delivery.store_id or await self._get_store_id(subject)
        else:
            address_text = self._build_full_delivery_address(payload)
            if not address_text.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail='Cadastre um endereço de entrega para continuar.',
                )
            store_resolution = await self.delivery_pricing.resolve_order_store(
                tenant_id=str(subject.tenant_id), address_text=address_text, requested_items=requested_items,
            )
            if store_resolution is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail='Não foi possível localizar seu endereço. Confira o CEP e tente novamente.',
                )
            if store_resolution.requires_shipping and payload.delivery.method != 'shipping':
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail='Este endereço está fora do raio de entrega por motoboy. Escolha envio por transportadora para continuar.',
                )
            store_id = store_resolution.store.id
        inventory_items = await self.inventory_repository.list_items(
            tenant_id=str(subject.tenant_id),
            store_id=store_id,
            active_only=True,
        )
        grouped = build_marketplace_catalog_groups([
            item for item in inventory_items
            if getattr(item, 'sale_price', None) is not None
            and item.sale_price > 0
        ])
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
        delivery_geo: tuple[Decimal, Decimal, Decimal] | None = None
        delivery_fee_amount = Decimal('0.00')
        if payload.delivery.method != 'pickup':
            assert store_resolution is not None  # guaranteed above: non-pickup methods always resolve or raise first
            # Distance is always measured against the store that will actually fulfill this
            # order — there is no fixed hub address in this system.
            delivery_geo = await self.delivery_pricing.resolve_geo_from_store(
                tenant_id=str(subject.tenant_id), store_id=store_id, address_text=self._build_full_delivery_address(payload),
            )
        if payload.delivery.method == 'shipping':
            assert store_resolution is not None  # guaranteed above: non-pickup methods always resolve or raise first
            shipping_quote = ShippingService().quote(
                origin_postal_code=store_resolution.store.postal_code, destination_postal_code=payload.delivery.postal_code,
            )
            if shipping_quote is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail='Não foi possível cotar o frete para este endereço.',
                )
            delivery_fee_amount = quantize_money(shipping_quote.price)
        elif payload.delivery.method != 'pickup':
            assert delivery_geo is not None  # guaranteed above: non-pickup methods always resolve delivery_geo first
            portal_service = PortalService(self.session)
            areas = await portal_service.get_delivery_areas(subject)
            pricing = await portal_service.get_delivery_pricing(subject)
            store_config = self._find_store_area_config(areas, store_id=store_id)
            if self._is_area_configured(store_config):
                resolved_fee = self._resolve_delivery_fee_by_area(
                    store_config,
                    areas.variations,
                    distance_km=delivery_geo[2],
                    district_text=payload.delivery.district,
                    city_text=payload.delivery.city,
                    subtotal_amount=subtotal_amount,
                )
                if resolved_fee is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail='Este endereço está fora da área de entrega. Escolha retirar na loja para continuar.',
                    )
                delivery_fee_amount = resolved_fee
            elif pricing.tiers:
                resolved_distance_km = delivery_geo[2]
                delivery_fee_amount = (
                    self._resolve_delivery_fee_by_distance(pricing, resolved_distance_km)
                    if resolved_distance_km > Decimal('0.00')
                    else quantize_money(Decimal(pricing.fee_beyond_last_tier))
                )
            elif subtotal_amount < pricing.free_above_subtotal:
                delivery_fee_amount = pricing.fee_beyond_last_tier
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
        payment_method = None
        if payload.payment.method in ('credit_card', 'debit_card'):
            payment_method = await CustomerPaymentMethodRepository(self.session).get_for_customer(
                customer_id=customer.id, payment_method_id=payload.payment.payment_method_id,
            )
            if payment_method is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Cartão selecionado não encontrado.')
        order = Order(
            id=str(uuid4()),
            tenant_id=str(subject.tenant_id),
            store_id=store_id,
            customer_id=customer.id,
            selected_address_id=None,
            selected_payment_method_id=payment_method.id if payment_method else None,
            order_code=self._build_order_code(now),
            channel=payload.channel or 'app',
            status=OrderStatus.NEW.value,
            fulfillment_type=(
                'pickup' if payload.delivery.method == 'pickup'
                else 'shipping' if payload.delivery.method == 'shipping'
                else 'delivery'
            ),
            priority='express' if payload.delivery.method == 'express' else 'normal',
            payment_method_label=self._build_payment_label(payload.payment.method),
            payment_status='pending',
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
                locked_item = await self.inventory_repository.get_item_by_id_for_update(
                    tenant_id=str(subject.tenant_id), item_id=str(component['inventory_item_id']),
                )
                if locked_item is None or locked_item.quantity < allocated_quantity:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Insufficient stock for {group['name']}.",
                    )
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
                quantity_before = locked_item.quantity
                locked_item.quantity = quantity_before - allocated_quantity
                await self.inventory_repository.add_movement(
                    InventoryMovement(
                        id=str(uuid4()),
                        tenant_id=str(subject.tenant_id),
                        store_id=locked_item.store_id,
                        inventory_item_id=locked_item.id,
                        performed_by_user_id=None,
                        movement_type='exit',
                        quantity_delta=-allocated_quantity,
                        quantity_before=quantity_before,
                        resulting_quantity=locked_item.quantity,
                        reason='Venda marketplace',
                        note='',
                        reference_code=order.order_code,
                        from_location_code=locked_item.storage_location,
                        to_location_code='',
                        unit_cost_snapshot=locked_item.acquisition_cost,
                    )
                )
                await decrement_lot_fefo(
                    self.session,
                    tenant_id=str(subject.tenant_id),
                    store_id=str(locked_item.store_id),
                    inventory_item_id=str(locked_item.id),
                    quantity=allocated_quantity,
                    performed_by_user_id='',
                    reason='Venda marketplace',
                    reference_code=order.order_code,
                    source_type='marketplace_order',
                    source_id=order.order_code,
                )
                created_items.append(order_item)
                remaining_quantity -= allocated_quantity
            if remaining_quantity > 0:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Unable to allocate stock across grouped inventory items.')
        fulfillment = await self._build_fulfillment(
            order=order, customer=customer, payload=payload, now=now, precomputed_geo=delivery_geo,
            shipping_delivery_days=shipping_quote.delivery_days if order.fulfillment_type == 'shipping' else 0,
            shipping_service_id=shipping_quote.service_id if order.fulfillment_type == 'shipping' else '',
        )
        await self.repository.add_fulfillment(fulfillment)
        if order.fulfillment_type == 'delivery':
            await self._attach_delivery_route_stop(order=order, fulfillment=fulfillment, subject=subject, store_id=store_id, now=now)
        if order.requires_prescription_review:
            await self._create_prescription_snapshot(order=order, customer=customer, payload=payload, order_items=created_items)
        payment_service = PaymentService(self.session)
        pix_qr_code = ''
        pix_copy_paste = ''
        if payload.payment.method == 'pix':
            charge = await payment_service.charge_pix(
                customer=customer, amount=total_amount, external_reference=order.order_code,
                description=f'Pedido marketplace {order.order_code}',
            )
            pix_qr_code = charge['pix_qr_code']
            pix_copy_paste = charge['pix_copy_paste']
        else:
            assert payment_method is not None  # guaranteed above: card methods 404 early when unresolved
            billing_type = 'CREDIT_CARD' if payload.payment.method == 'credit_card' else 'DEBIT_CARD'
            charge = await payment_service.charge_card(
                customer=customer, provider_token=payment_method.provider_token, billing_type=billing_type,
                amount=total_amount, external_reference=order.order_code,
                description=f'Pedido marketplace {order.order_code}',
            )
        order.gateway_payment_id = charge['payment_id']
        order.payment_status = payment_service.resolve_order_payment_status(charge['status'])
        if order.payment_status == 'approved':
            order.payment_confirmed_at = now
        await self.session.flush()
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(subject.tenant_id))
        # Fiscal issuance is deferred: a background job (app.services.fiscal_scheduler) issues
        # the document once payment_confirmed_at is at least 7 days old, so a product return or
        # order cancellation inside that window never forces a fiscal document to be cancelled.
        return self._serialize_marketplace_order(
            order, created_items, fulfillment, fiscal_document=None, pix_qr_code=pix_qr_code, pix_copy_paste=pix_copy_paste,
        )

    async def list_internal_board(self, *, requested_store_id: str = "") -> InternalOrderBoardResponse:
        """Return the pharmacist operational order board."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject, requested_store_id=requested_store_id, allow_all_stores=True)
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

    async def update_internal_order_item_pick(
        self,
        *,
        order_id: str,
        item_id: str,
        payload: OrderItemPickRequest,
    ) -> InternalOrderResponse:
        """Persist the separation-checklist state for one picked order item."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject)
        order = await self.repository.get_by_id(tenant_id=str(subject.tenant_id), order_id=order_id, store_id=store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Order not found.')
        item = await self.repository.get_item_by_id(tenant_id=str(subject.tenant_id), order_id=order_id, item_id=item_id, store_id=store_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Order item not found.')
        now = datetime.now(UTC)
        item.picked_for_fulfillment = payload.picked
        item.picked_at_label = now.strftime('%H:%M') if payload.picked else ''
        order.updated_at = now
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

    async def dispatch_shipping_order(self, *, order_id: str) -> InternalOrderResponse:
        """Buy the real carrier shipment, generate its label, and mark the order dispatched."""

        subject = self._require_subject()
        store_id = await self._get_store_id(subject)
        order = await self.repository.get_by_id(tenant_id=str(subject.tenant_id), order_id=order_id, store_id=store_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Order not found.')
        if order.fulfillment_type != 'shipping':
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Shipping dispatch is only available for envio orders.')
        if order.status != OrderStatus.READY.value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Order is not ready for shipping dispatch.')
        fulfillment = await self.repository.get_fulfillment_by_order_id(order_id=order.id)
        if fulfillment is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Shipping fulfillment payload unavailable.')
        store = await self.store_repository.get_by_id(tenant_id=str(subject.tenant_id), store_id=order.store_id)
        if store is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Order store unavailable.')
        try:
            result = ShippingService().purchase_and_label(
                service_id=fulfillment.shipping_service_id, store=store, fulfillment=fulfillment, order=order,
            )
        except MelhorEnvioError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error
        now = datetime.now(UTC)
        fulfillment.carrier_name = result.carrier_name
        fulfillment.tracking_code = result.tracking_code
        fulfillment.shipping_provider_order_id = result.provider_order_id
        fulfillment.shipping_label_url = result.label_url
        fulfillment.dispatched_at_label = now.strftime('%H:%M')
        order.status = OrderStatus.DISPATCHED.value
        order.completed_at_label = 'Postado'
        order.updated_at = now
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
        if order.fulfillment_type == 'shipping' and payload.next_status == OrderStatus.DISPATCHED.value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Use o despacho de transportadora para concluir pedidos de envio.')
        if (
            order.status in {OrderStatus.NEW.value, OrderStatus.SEPARATING.value}
            and order.requires_prescription_review
            and order.prescription_status == 'pending'
        ):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Pedido aguardando validação de receita.')
        if payload.next_status == OrderStatus.READY.value:
            items = await self.repository.list_items(order_ids=[order.id])
            if not all(item.picked_for_fulfillment for item in items):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Confira todos os itens antes de marcar como pronto.')
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
        pix_qr_code: str = '',
        pix_copy_paste: str = '',
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
        address = fulfillment.address_line if fulfillment and order.fulfillment_type in ('delivery', 'shipping') else ''
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
            tracking_code=fulfillment.tracking_code if fulfillment and order.fulfillment_type == 'shipping' else '',
            carrier_name=fulfillment.carrier_name if fulfillment and order.fulfillment_type == 'shipping' else '',
            rx_status=order.prescription_status,
            items=list(grouped_items.values()),
            fiscal_document=fiscal_document,
            pix_qr_code=pix_qr_code,
            pix_copy_paste=pix_copy_paste,
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
            fulfillment_label={'pickup': 'Retirada na loja', 'shipping': 'Envio por transportadora'}.get(order.fulfillment_type, 'Entrega em domicilio'),
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
            tracking_code=fulfillment.tracking_code if fulfillment and order.fulfillment_type == 'shipping' else '',
            carrier_name=fulfillment.carrier_name if fulfillment and order.fulfillment_type == 'shipping' else '',
            shipping_dispatch_required=bool(fulfillment and order.fulfillment_type == 'shipping' and order.status == OrderStatus.READY.value),
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
                    picked=item.picked_for_fulfillment,
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
                    picked=item.picked_for_fulfillment,
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

    async def _get_store_id(self, subject: TokenSubject, *, requested_store_id: str = "", allow_all_stores: bool = False) -> str:
        """Resolve the active store identifier, honoring an admin-supplied override.

        Admins have no store of their own: for read/list use-cases (allow_all_stores=True)
        they default to seeing every store in the tenant (empty string, unfiltered) unless
        they pick one. Writes always resolve to a concrete store.
        """

        if self.store_id is not None:
            return self.store_id
        if requested_store_id and subject.role == UserRole.ADMIN:
            self.store_id = requested_store_id
        elif subject.store_id:
            self.store_id = str(subject.store_id)
        elif allow_all_stores and subject.role == UserRole.ADMIN:
            self.store_id = ""
        else:
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

    def _resolve_delivery_fee_by_distance(self, pricing: PortalDeliveryPricingResponse, distance_km: Decimal) -> Decimal:
        """Return the configured delivery fee for one resolved distance."""

        return self.delivery_pricing.resolve_fee_by_distance(pricing, distance_km)

    def _resolve_distance_tier_fee(self, pricing: PortalDeliveryPricingResponse, distance_km: Decimal, subtotal_amount: Decimal) -> Decimal:
        """Return the base fee for the 'distance_tier' zone calculation mode."""

        return self.delivery_pricing.resolve_distance_tier_fee(pricing, distance_km, subtotal_amount)

    def _resolve_fuel_fee(self, fuel: PortalDeliveryFuelConfig, distance_km: Decimal) -> Decimal:
        """Return the fuel-cost-based fee: (km / km per liter) * price per liter * (1 + margin%)."""

        return self.delivery_pricing.resolve_fuel_fee(fuel, distance_km)

    def _compute_price_rule_fee(self, rule: PortalDeliveryPriceRule, *, distance_km: Decimal) -> Decimal:
        """Return the base delivery fee for one matched neighborhood or radius tier."""

        return self.delivery_pricing.compute_price_rule_fee(rule, distance_km=distance_km)

    def _resolve_variation_extra_fee(self, variations: list[PortalDeliveryVariation], variation_key: str) -> Decimal:
        """Return the configured extra fee for one delivery variation, defaulting to zero if unmatched."""

        return self.delivery_pricing.resolve_variation_extra_fee(variations, variation_key)

    def _find_store_area_config(self, areas: PortalDeliveryAreasResponse, *, store_id: str) -> PortalDeliveryStoreAreaConfig | None:
        """Return the delivery-area configuration for one store, if any has been saved."""

        return self.delivery_pricing.find_store_area_config(areas, store_id=store_id)

    def _is_area_configured(self, store_config: PortalDeliveryStoreAreaConfig | None) -> bool:
        """Return whether a store has touched the delivery-area screen at all (turns on exclusion)."""

        return self.delivery_pricing.is_area_configured(store_config)

    def _match_delivery_area(
        self, store_config: PortalDeliveryStoreAreaConfig, *, distance_km: Decimal, district_text: str, city_text: str = '',
    ) -> tuple[str, PortalDeliveryNeighborhood | PortalDeliveryRadiusTier] | None:
        """Return ('neighborhood'|'radius', matched entry); a neighborhood match takes precedence over radius tiers.

        A neighborhood entry with no district set covers the whole city instead (matched by city name).
        """

        return self.delivery_pricing.match_delivery_area(store_config, distance_km=distance_km, district_text=district_text, city_text=city_text)

    def _resolve_delivery_fee_by_area(
        self,
        store_config: PortalDeliveryStoreAreaConfig,
        variations: list[PortalDeliveryVariation],
        *,
        distance_km: Decimal,
        district_text: str,
        city_text: str = '',
        subtotal_amount: Decimal = Decimal('0.00'),
        variation: str = 'normal',
    ) -> Decimal | None:
        """Return the resolved delivery fee, or None when the address matches no configured area (excluded)."""

        return self.delivery_pricing.resolve_fee_by_area(
            store_config, variations,
            distance_km=distance_km, district_text=district_text, city_text=city_text,
            subtotal_amount=subtotal_amount, variation=variation,
        )

    async def check_delivery_coverage(self, *, district: str, city: str, state_code: str, postal_code: str) -> DeliveryCoverageResponse:
        """Return a best-effort delivery-coverage preview for one typed CEP/address."""

        subject = self._require_subject()
        return await self.delivery_pricing.check_coverage(
            subject=subject, district=district, city=city, state_code=state_code, postal_code=postal_code,
        )

    def _build_full_delivery_address(self, payload: CheckoutOrderRequest) -> str:
        """Return one free-form address string for geocoding from the checkout delivery fields."""

        return ', '.join(part for part in [
            ' '.join(part for part in [payload.delivery.address_line, payload.delivery.address_number] if part).strip(),
            payload.delivery.district,
            payload.delivery.city,
            payload.delivery.state_code,
            payload.delivery.postal_code,
        ] if part)

    def _haversine_km(self, lat1: Decimal, lng1: Decimal, lat2: Decimal, lng2: Decimal) -> Decimal:
        """Return the real great-circle distance in kilometers between two coordinates."""

        return self.delivery_pricing.haversine_km(lat1, lng1, lat2, lng2)

    async def _build_fulfillment(
        self,
        *,
        order: Order,
        customer: object,
        payload: CheckoutOrderRequest,
        now: datetime,
        precomputed_geo: tuple[Decimal, Decimal, Decimal] | None = None,
        shipping_delivery_days: int = 0,
        shipping_service_id: str = '',
    ) -> OrderFulfillment:
        """Return the persisted order fulfillment snapshot."""

        store_label = payload.delivery.store_name.strip() or 'Farmácia Farmaura'
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
        assert precomputed_geo is not None  # guaranteed: caller always resolves geo for non-pickup orders
        latitude, longitude, distance = precomputed_geo
        is_shipping = order.fulfillment_type == 'shipping'
        if is_shipping:
            eta_days = max(shipping_delivery_days, 1)
            eta_label = f'Chega em até {eta_days} dia(s) útil(eis) · rastreio pela transportadora'
            sla_target_minutes = eta_days * 24 * 60
        else:
            eta_minutes = 60 if payload.delivery.method == 'express' else 180
            eta_label = 'Hoje, ate ' + (now + timedelta(minutes=eta_minutes)).strftime('%H:%M')
            sla_target_minutes = eta_minutes
        return OrderFulfillment(
            id=str(uuid4()),
            order_id=order.id,
            fulfillment_type=order.fulfillment_type,
            store_label=store_label,
            pickup_code='',
            shipping_service_id=shipping_service_id,
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
            sla_target_minutes=sla_target_minutes,
            eta_label=eta_label,
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

        await self.delivery_pricing.attach_route_stop(
            tenant_id=str(subject.tenant_id),
            store_id=store_id,
            now=now,
            recipient_name=fulfillment.recipient_name,
            address_line=fulfillment.address_line,
            district=fulfillment.district,
            postal_code=fulfillment.postal_code,
            latitude=fulfillment.latitude,
            longitude=fulfillment.longitude,
            route_distance_km=fulfillment.route_distance_km,
            eta_label=fulfillment.eta_label,
            order_id=order.id,
            order_fulfillment_id=fulfillment.id,
            store_label=fulfillment.store_label,
        )

    def _build_route_code(self, now: datetime) -> str:
        """Return a readable delivery route code."""

        return self.delivery_pricing.build_route_code(now)

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
