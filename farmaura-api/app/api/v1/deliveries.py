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

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.core.responses import StatusResponse
from app.schemas.auth import TokenSubject
from app.schemas.deliveries import (
    DeliveryLocationPingRequest,
    DeliveryRouteLiveResponse,
    DriverAssignRequest,
    DriverAssignResponse,
    MyDeliveryRouteListResponse,
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


@router.get("/routes/live", response_model=DeliveryRouteLiveResponse)
async def get_delivery_route_live(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> DeliveryRouteLiveResponse:
    """Return a lightweight live-tracking snapshot for the active delivery route."""

    service = DeliveryService(session=session, subject=subject)
    return await service.get_live_route()


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
