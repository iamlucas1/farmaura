"""
farmaura-api/app/api/v1/orders.py

Order routes for Farmaura.

Responsibilities:
- expose marketplace checkout, history, and internal order endpoints;
- enforce authenticated order scope boundaries;
- delegate order behavior to the service layer;

Observations:
- marketplace checkout persists the submitted payment selection and order snapshot;
- internal transitions stay server-authoritative and tenant-scoped.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject, require_marketplace_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.orders import (
    CheckoutOrderRequest,
    DeliveryCoverageResponse,
    InternalOrderBoardChangeResponse,
    InternalOrderBoardResponse,
    InternalOrderResponse,
    MarketplaceOrderChangeResponse,
    MarketplaceOrderListResponse,
    MarketplaceOrderResponse,
    OrderAdvanceRequest,
    OrderCreateRequest,
    OrderItemLocationUpdateRequest,
    OrderItemPickRequest,
    OrderResponse,
    PickupCodeConfirmRequest,
)
from app.services.order_service import OrderService


# ============================================================================
# ORDER ROUTES
# ============================================================================


router = APIRouter()


@router.get('', response_model=MarketplaceOrderListResponse)
async def list_orders(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> MarketplaceOrderListResponse:
    """Return marketplace orders for the authenticated customer."""

    service = OrderService(session=session, subject=subject)
    return await service.list_orders()


@router.post('', response_model=MarketplaceOrderResponse)
async def create_marketplace_order(
    payload: CheckoutOrderRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> MarketplaceOrderResponse:
    """Persist a marketplace checkout with the submitted payment selection."""

    service = OrderService(session=session, subject=subject)
    return await service.create_marketplace_order(payload)


@router.get('/delivery-coverage', response_model=DeliveryCoverageResponse)
async def check_delivery_coverage(
    district: str = Query(default="", max_length=120),
    city: str = Query(default="", max_length=120),
    state_code: str = Query(default="", max_length=2),
    postal_code: str = Query(default="", max_length=9),
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> DeliveryCoverageResponse:
    """Return a best-effort delivery-coverage preview for one typed CEP/address."""

    service = OrderService(session=session, subject=subject)
    return await service.check_delivery_coverage(district=district, city=city, state_code=state_code, postal_code=postal_code)


@router.post('/draft', response_model=OrderResponse)
async def create_order_draft(
    payload: OrderCreateRequest,
    _: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> OrderResponse:
    """Prepare a draft marketplace order response from validated input."""

    service = OrderService(session=session)
    return await service.prepare_order(payload)


@router.get('/changes', response_model=MarketplaceOrderChangeResponse)
async def get_marketplace_order_changes(
    since: str = Query(default="", max_length=64),
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> MarketplaceOrderChangeResponse:
    """Return a lightweight sync payload when customer order status changed."""

    service = OrderService(session=session, subject=subject)
    return await service.get_marketplace_order_changes(since=since)


@router.get('/internal-board', response_model=InternalOrderBoardResponse)
async def list_internal_order_board(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InternalOrderBoardResponse:
    """Return the pharmacist operational order board."""

    service = OrderService(session=session, subject=subject)
    return await service.list_internal_board(requested_store_id=store_id)


@router.get('/internal-board/changes', response_model=InternalOrderBoardChangeResponse)
async def get_internal_order_board_changes(
    since: str = Query(default="", max_length=64),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InternalOrderBoardChangeResponse:
    """Return a lightweight board sync payload when operational orders changed."""

    service = OrderService(session=session, subject=subject)
    return await service.get_internal_board_changes(since=since)


@router.post('/{order_id}/items/{item_id}/location', response_model=InternalOrderResponse)
async def update_internal_order_item_location(
    order_id: str,
    item_id: str,
    payload: OrderItemLocationUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InternalOrderResponse:
    """Persist the selected stock location used to pick one order item."""

    service = OrderService(session=session, subject=subject)
    return await service.update_internal_order_item_location(order_id=order_id, item_id=item_id, payload=payload)


@router.post('/{order_id}/items/{item_id}/pick', response_model=InternalOrderResponse)
async def update_internal_order_item_pick(
    order_id: str,
    item_id: str,
    payload: OrderItemPickRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InternalOrderResponse:
    """Persist the separation-checklist state for one picked order item."""

    service = OrderService(session=session, subject=subject)
    return await service.update_internal_order_item_pick(order_id=order_id, item_id=item_id, payload=payload)


@router.post('/{order_id}/pickup/confirm', response_model=InternalOrderResponse)
async def confirm_internal_pickup(
    order_id: str,
    payload: PickupCodeConfirmRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InternalOrderResponse:
    """Validate a pickup code without exposing it to the pharmacist UI."""

    service = OrderService(session=session, subject=subject)
    return await service.confirm_internal_pickup(order_id=order_id, payload=payload)


@router.post('/{order_id}/shipping/dispatch', response_model=InternalOrderResponse)
async def dispatch_shipping_order(
    order_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InternalOrderResponse:
    """Buy the real carrier shipment, generate its label, and mark the order dispatched."""

    service = OrderService(session=session, subject=subject)
    return await service.dispatch_shipping_order(order_id=order_id)


@router.post('/{order_id}/advance', response_model=InternalOrderResponse)
async def advance_internal_order(
    order_id: str,
    payload: OrderAdvanceRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InternalOrderResponse:
    """Advance one internal order through its allowed operational transition."""

    service = OrderService(session=session, subject=subject)
    return await service.advance_internal_order(order_id, payload)
