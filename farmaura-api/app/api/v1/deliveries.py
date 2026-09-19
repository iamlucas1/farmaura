"""
farmaura-api/app/api/v1/deliveries.py

Delivery routes for Farmaura.

Responsibilities:
- expose initial delivery operations endpoints;
- keep delivery transport contracts minimal and explicit;
- prepare the module for protected logistics workflows;

Observations:
- logistics integrations should live in dedicated services later;
- the bootstrap response confirms module readiness only;
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.core.responses import StatusResponse
from app.schemas.auth import TokenSubject
from app.schemas.deliveries import (
    DeliveryDriverListResponse,
    DeliveryLiveResponse,
    DeliveryLocationPingRequest,
    DeliveryRouteListResponse,
    DriverAssignRequest,
    DriverAssignResponse,
    MyDeliveryRouteListResponse,
    PlanDeliveryRoutesRequest,
)
from app.services.delivery_service import DeliveryService
from app.services.operations_service import OperationsService


# ============================================================================
# DELIVERY ROUTES
# ============================================================================


router = APIRouter()


@router.get("/status", response_model=StatusResponse)
async def get_delivery_status(
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
) -> StatusResponse:
    """Return the delivery module readiness state."""

    service = OperationsService()
    return await service.get_status("Delivery workflows scaffolded.")


@router.get("/drivers", response_model=DeliveryDriverListResponse)
async def list_delivery_drivers(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> DeliveryDriverListResponse:
    """Return every driver based at the caller's store, for the route-planning driver picker."""

    service = DeliveryService(session=session, subject=subject)
    return await service.list_drivers(requested_store_id=store_id)


@router.get("/routes", response_model=DeliveryRouteListResponse)
async def list_delivery_routes(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> DeliveryRouteListResponse:
    """Return every currently active delivery route for the caller's store."""

    service = DeliveryService(session=session, subject=subject)
    return await service.list_active_routes(requested_store_id=store_id)


@router.post("/routes/plan", response_model=DeliveryRouteListResponse)
async def plan_delivery_routes(
    payload: PlanDeliveryRoutesRequest,
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> DeliveryRouteListResponse:
    """(Re)plan every currently pending delivery stop into one route per driver."""

    service = DeliveryService(session=session, subject=subject)
    return await service.plan_routes(payload, requested_store_id=store_id)


@router.patch("/routes/{route_id}/driver", response_model=DriverAssignResponse)
async def assign_delivery_route_driver(
    route_id: str,
    payload: DriverAssignRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> DriverAssignResponse:
    """Assign (or clear) the driver responsible for one delivery route."""

    service = DeliveryService(session=session, subject=subject)
    return await service.assign_driver(route_id=route_id, payload=payload)


@router.get("/routes/live", response_model=DeliveryLiveResponse)
async def get_delivery_routes_live(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> DeliveryLiveResponse:
    """Return a lightweight live-tracking snapshot for every active delivery route at once."""

    service = DeliveryService(session=session, subject=subject)
    return await service.get_live_routes(requested_store_id=store_id)


@router.get("/my-route", response_model=MyDeliveryRouteListResponse)
async def get_my_delivery_routes(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.DRIVER)),
    session: AsyncSession = Depends(get_subject_session),
) -> MyDeliveryRouteListResponse:
    """Return every route currently assigned to the authenticated driver."""

    service = DeliveryService(session=session, subject=subject)
    return await service.get_my_routes()


@router.post("/my-route/location", status_code=204)
async def ping_my_location(
    payload: DeliveryLocationPingRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.DRIVER)),
    session: AsyncSession = Depends(get_subject_session),
) -> None:
    """Upsert the authenticated driver's latest GPS position."""

    service = DeliveryService(session=session, subject=subject)
    await service.ping_location(payload)


@router.post("/my-route/stops/{stop_id}/deliver", status_code=204)
async def deliver_my_route_stop(
    stop_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.DRIVER)),
    session: AsyncSession = Depends(get_subject_session),
) -> None:
    """Mark one of the driver's own route stops as delivered."""

    service = DeliveryService(session=session, subject=subject)
    await service.mark_stop_delivered(stop_id)
