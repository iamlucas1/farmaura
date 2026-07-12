"""
farmaura-api/app/api/v1/pdv.py

PDV routes for Farmaura.

Responsibilities:
- expose operational point-of-sale endpoints for the internal console;
- keep PDV handlers thin, typed, and role-scoped;
- delegate queue and sale flows to the dedicated service layer;

Observations:
- payment capture remains server-authoritative even in this initial slice;
- pharmacist and cashier roles share this router with explicit backend checks;
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.core.responses import StatusResponse
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.pdv import PdvOrderResponse, PdvQueueCreateRequest, PdvQueueResponse, PdvSaleCreateRequest, PdvSaleListResponse, PdvSaleResponse
from app.services.operations_service import OperationsService
from app.services.pdv_service import PdvService


# ============================================================================
# PDV ROUTES
# ============================================================================


router = APIRouter()


@router.get("/status", response_model=StatusResponse)
async def get_pdv_status(
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
) -> StatusResponse:
    """Return the PDV module readiness state."""

    service = OperationsService()
    return await service.get_status("PDV workflows scaffolded.")


@router.get("/queue", response_model=PdvQueueResponse)
async def list_pdv_queue(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvQueueResponse:
    """Return queued and claimed PDV orders for the cashier flow."""

    service = PdvService(session=session, subject=subject)
    return await service.list_queue()


@router.post("/orders", response_model=PdvOrderResponse, status_code=201)
async def create_pdv_queue_order(
    payload: PdvQueueCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvOrderResponse:
    """Persist a pharmacist handoff order into the cashier queue."""

    service = PdvService(session=session, subject=subject)
    return await service.create_queue_order(payload)


@router.post("/orders/{order_id}/claim", response_model=PdvOrderResponse)
async def claim_pdv_order(
    order_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvOrderResponse:
    """Claim a queued PDV order for cashier completion."""

    service = PdvService(session=session, subject=subject)
    return await service.claim_order(order_id)


@router.post("/orders/{order_id}/complete", response_model=PdvSaleResponse)
async def complete_pdv_order(
    order_id: str,
    payload: PdvSaleCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvSaleResponse:
    """Finalize one PDV order into a completed sale."""

    service = PdvService(session=session, subject=subject)
    return await service.complete_sale(order_id, payload)


@router.get("/sales", response_model=PdvSaleListResponse)
async def list_pdv_sales(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvSaleListResponse:
    """Return finalized PDV sales for the console."""

    service = PdvService(session=session, subject=subject)
    return await service.list_sales()

