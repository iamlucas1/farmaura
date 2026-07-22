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

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.core.responses import StatusResponse
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.orders import DeliveryCoverageResponse
from app.schemas.pdv import (
    PdvDiscountLimitRequest,
    PdvDiscountLimitResponse,
    PdvDraftSessionListResponse,
    PdvDraftSessionResponse,
    PdvDraftSessionUpsertRequest,
    PdvItemLocationListResponse,
    PdvOrderResponse,
    PdvPrescriptionCreateRequest,
    PdvPrescriptionResponse,
    PdvPrescriptionStatusResponse,
    PdvProductSearchResponse,
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
from app.services.operations_service import OperationsService
from app.services.pdv_service import PdvService
from app.services.prescription_service import PrescriptionService


# ============================================================================
# PDV ROUTES
# ============================================================================


router = APIRouter()


@router.get("/status", response_model=StatusResponse)
async def get_pdv_status(
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
) -> StatusResponse:
    """Return the PDV module readiness state."""

    service = OperationsService()
    return await service.get_status("PDV workflows scaffolded.")


@router.get("/products/search", response_model=PdvProductSearchResponse)
async def search_pdv_products(
    query: str = Query(default="", alias="query"),
    limit: int = Query(default=20, ge=1, le=50),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvProductSearchResponse:
    """Search inventory products across stores for the balcão product picker."""

    service = PdvService(session=session, subject=subject)
    return await service.search_products(query=query, limit=limit)


@router.get("/products/{item_id}/locations", response_model=PdvItemLocationListResponse)
async def list_pdv_item_locations(
    item_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvItemLocationListResponse:
    """Return the storage locations with available stock for one item, for the pick-location selector."""

    service = PdvService(session=session, subject=subject)
    return await service.list_item_locations(item_id)


@router.get("/delivery/coverage", response_model=DeliveryCoverageResponse)
async def check_pdv_delivery_coverage(
    district: str = Query(default=""),
    city: str = Query(default=""),
    state_code: str = Query(default=""),
    postal_code: str = Query(default=""),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> DeliveryCoverageResponse:
    """Return a best-effort delivery-coverage preview for the balcão fulfillment picker."""

    service = PdvService(session=session, subject=subject)
    return await service.check_delivery_coverage(district=district, city=city, state_code=state_code, postal_code=postal_code)


@router.get("/queue", response_model=PdvQueueResponse)
async def list_pdv_queue(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvQueueResponse:
    """Return queued and claimed PDV orders for the cashier flow."""

    service = PdvService(session=session, subject=subject)
    return await service.list_queue(requested_store_id=store_id)


@router.post("/discount-limit", response_model=PdvDiscountLimitResponse)
async def get_pdv_discount_limit(
    payload: PdvDiscountLimitRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvDiscountLimitResponse:
    """Preview the maximum discount percent the current cart can absorb without breaching margin protection."""

    service = PdvService(session=session, subject=subject)
    return await service.get_discount_limit(payload)


@router.post("/orders", response_model=PdvOrderResponse, status_code=201)
async def create_pdv_queue_order(
    payload: PdvQueueCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvOrderResponse:
    """Persist a pharmacist handoff order into the cashier queue."""

    service = PdvService(session=session, subject=subject)
    return await service.create_queue_order(payload)


@router.post("/reservations", response_model=PdvReservationResponse, status_code=201)
async def create_pdv_reservation(
    payload: PdvReservationCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvReservationResponse:
    """Reserve stock held at another store for the customer to pick up there."""

    service = PdvService(session=session, subject=subject)
    return await service.create_reservation(payload)


@router.post("/prescriptions", response_model=PdvPrescriptionResponse, status_code=201)
async def create_pdv_prescription(
    payload: PdvPrescriptionCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvPrescriptionResponse:
    """Record a physical prescription decision, or request digital validation via chat."""

    service = PrescriptionService(session=session, subject=subject)
    return await service.create_from_pdv(payload)


@router.get("/prescriptions/status", response_model=PdvPrescriptionStatusResponse)
async def get_pdv_prescription_status(
    customer_id: str = Query(default=""),
    inventory_item_ids: list[str] = Query(default_factory=list),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvPrescriptionStatusResponse:
    """Return the current prescription validation state for each controlled cart line."""

    service = PrescriptionService(session=session, subject=subject)
    return await service.get_status_for_cart(customer_id or None, inventory_item_ids)


@router.post("/orders/{order_id}/claim", response_model=PdvOrderResponse)
async def claim_pdv_order(
    order_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvOrderResponse:
    """Claim a queued PDV order for cashier completion."""

    service = PdvService(session=session, subject=subject)
    return await service.claim_order(order_id)


@router.post("/orders/{order_id}/cancel", response_model=PdvOrderResponse)
async def cancel_pdv_order(
    order_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvOrderResponse:
    """Cancel a queued or claimed PDV order and return its reserved stock."""

    service = PdvService(session=session, subject=subject)
    return await service.cancel_order(order_id)


@router.get("/drafts", response_model=PdvDraftSessionListResponse)
async def list_pdv_draft_sessions(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvDraftSessionListResponse:
    """Return every in-progress PDV atendimento owned by the current pharmacist, for recovery after a reload."""

    service = PdvService(session=session, subject=subject)
    return await service.list_draft_sessions()


@router.put("/drafts", response_model=PdvDraftSessionResponse)
async def autosave_pdv_draft_session(
    payload: PdvDraftSessionUpsertRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvDraftSessionResponse:
    """Create or update one in-progress PDV atendimento snapshot (autosave)."""

    service = PdvService(session=session, subject=subject)
    return await service.autosave_draft_session(payload)


@router.delete("/drafts/{draft_id}", status_code=204)
async def delete_pdv_draft_session(
    draft_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> None:
    """Discard one in-progress PDV atendimento."""

    service = PdvService(session=session, subject=subject)
    await service.delete_draft_session(draft_id)


@router.post("/recurrence-confirmations", response_model=PdvRecurrenceConfirmResponse)
async def confirm_pdv_recurrence(
    payload: PdvRecurrenceConfirmRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvRecurrenceConfirmResponse:
    """Confirm a detected recurrence, charge the customer's saved card now, and record the subscription."""

    service = PdvService(session=session, subject=subject)
    return await service.confirm_recurrence(payload)


@router.post("/orders/{order_id}/complete", response_model=PdvSaleResponse)
async def complete_pdv_order(
    order_id: str,
    payload: PdvSaleCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvSaleResponse:
    """Finalize one PDV order into a completed sale."""

    service = PdvService(session=session, subject=subject)
    return await service.complete_sale(order_id, payload)


@router.get("/sales", response_model=PdvSaleListResponse)
async def list_pdv_sales(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> PdvSaleListResponse:
    """Return finalized PDV sales for the console."""

    service = PdvService(session=session, subject=subject)
    return await service.list_sales(requested_store_id=store_id)

