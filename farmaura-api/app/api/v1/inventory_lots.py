"""
farmaura-api/app/api/v1/inventory_lots.py

Inventory stock lot and traceability routes for Farmaura.

Responsibilities:
- expose per-batch, per-location stock balance endpoints for the segregated stock screen;
- expose the product traceability/audit lookup endpoints for the admin console;

Observations:
- mounted under the existing /inventory prefix, alongside the aggregate inventory routes;
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.inventory_lot import (
    ItemTraceResponse,
    LotAdjustmentRequest,
    LotReceiptRequest,
    LotTransferRequest,
    StockLotListResponse,
    StockLotResponse,
    TraceCandidateListResponse,
)
from app.services.inventory_lot_service import InventoryLotService


# ============================================================================
# INVENTORY LOT ROUTES
# ============================================================================


router = APIRouter()


@router.get("/lots", response_model=StockLotListResponse)
async def list_stock_lots(
    item_id: str = Query(default="", max_length=36),
    location_id: str = Query(default="", max_length=36),
    location_type: str = Query(default="", pattern="^(|estoque|prateleira|gondola|caixa|outro)$"),
    status_filter: str = Query(default="", alias="status", pattern="^(|available|reserved|quarantine|expired|written_off)$"),
    batch_code: str = Query(default="", max_length=64),
    expiry_from: date | None = Query(default=None),
    expiry_to: date | None = Query(default=None),
    supplier_id: str = Query(default="", max_length=36),
    only_positive: bool = Query(default=True),
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> StockLotListResponse:
    """Return filtered stock lots for the segregated stock screen."""

    service = InventoryLotService(session=session, subject=subject)
    return await service.list_lots(
        item_id=item_id,
        location_id=location_id,
        location_type=location_type,
        status_filter=status_filter,
        batch_code=batch_code,
        expiry_from=expiry_from,
        expiry_to=expiry_to,
        supplier_id=supplier_id,
        only_positive=only_positive,
        requested_store_id=store_id,
    )


@router.post("/lots/receipts", response_model=StockLotResponse, status_code=201)
async def receive_stock_lot(
    payload: LotReceiptRequest,
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> StockLotResponse:
    """Register a goods-receipt event for one batch at one storage location."""

    service = InventoryLotService(session=session, subject=subject)
    return await service.receive_stock(payload, requested_store_id=store_id)


@router.post("/lots/{lot_id}/transfers", response_model=StockLotListResponse)
async def transfer_stock_lot(
    lot_id: str,
    payload: LotTransferRequest,
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> StockLotListResponse:
    """Move part (or all) of one stock lot to another storage location."""

    service = InventoryLotService(session=session, subject=subject)
    return await service.transfer_lot(lot_id, payload, requested_store_id=store_id)


@router.post("/lots/{lot_id}/adjustments", response_model=StockLotResponse)
async def adjust_stock_lot(
    lot_id: str,
    payload: LotAdjustmentRequest,
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> StockLotResponse:
    """Apply a manual adjustment (loss, breakage, count correction) to one stock lot."""

    service = InventoryLotService(session=session, subject=subject)
    return await service.adjust_lot(lot_id, payload, requested_store_id=store_id)


@router.get("/trace/search", response_model=TraceCandidateListResponse)
async def search_trace_candidates(
    query: str = Query(default="", max_length=120),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> TraceCandidateListResponse:
    """Return candidate items matching a SKU, EAN, name, or batch code search."""

    service = InventoryLotService(session=session, subject=subject)
    return await service.search_candidates(query)


@router.get("/trace/{item_id}", response_model=ItemTraceResponse)
async def get_item_trace(
    item_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> ItemTraceResponse:
    """Return the full current breakdown and movement history for one item."""

    service = InventoryLotService(session=session, subject=subject)
    return await service.get_item_trace(item_id)
