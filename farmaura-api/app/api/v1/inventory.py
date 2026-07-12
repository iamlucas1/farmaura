"""
farmaura-api/app/api/v1/inventory.py

Inventory routes for Farmaura.

Responsibilities:
- expose inventory read and write endpoints for the internal console;
- enforce authenticated internal access for stock workflows;
- keep inventory transport logic thin and service-driven;

Observations:
- mutations are server-authoritative and always record movement history;
- export currently emits CSV for the internal inventory workflow;
"""

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_subject_session, require_internal_subject
from app.core.config import Settings
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.inventory import (
    InventoryAdjustmentRequest,
    InventoryDashboardResponse,
    InventoryInvoiceConfirmRequest,
    InventoryInvoiceConfirmResponse,
    InventoryInvoicePreviewResponse,
    InventoryItemCreateRequest,
    InventoryItemUpdateRequest,
    InventoryItemResponse,
    InventoryListResponse,
    InventoryLocationCreateRequest,
    InventoryLocationResponse,
    InventoryMovementListResponse,
    InventoryStatusResponse,
    InventoryTransferRequest,
)
from app.services.inventory_invoice_service import InventoryInvoiceService
from app.services.inventory_service import InventoryService
from app.services.operations_service import OperationsService


# ============================================================================
# INVENTORY ROUTES
# ============================================================================


router = APIRouter()


@router.get("/status", response_model=InventoryStatusResponse)
async def get_inventory_status(
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
) -> InventoryStatusResponse:
    """Return the inventory module readiness state."""

    service = OperationsService()
    return await service.get_status("Inventory workflows scaffolded.")


@router.get("/dashboard", response_model=InventoryDashboardResponse)
async def get_inventory_dashboard(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryDashboardResponse:
    """Return the inventory dashboard payload."""

    service = InventoryService(session=session, subject=subject)
    return await service.get_dashboard()


@router.get("/items", response_model=InventoryListResponse)
async def list_inventory_items(
    query: str = Query(default="", max_length=120),
    stock_status: str = Query(default="all", pattern="^(all|ok|normal|attention|low|out)$"),
    controlled_only: bool = Query(default=False),
    location_code: str = Query(default="", max_length=64),
    medication_class_name: str = Query(default="", max_length=120),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryListResponse:
    """Return filtered inventory items."""

    service = InventoryService(session=session, subject=subject)
    return await service.list_items(
        query=query,
        stock_status=stock_status,
        controlled_only=controlled_only,
        location_code=location_code,
        medication_class_name=medication_class_name,
    )


@router.post("/items", response_model=InventoryItemResponse, status_code=201)
async def create_inventory_item(
    payload: InventoryItemCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Create a new inventory item."""

    service = InventoryService(session=session, subject=subject)
    return await service.create_item(payload)


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
async def update_inventory_item(
    item_id: str,
    payload: InventoryItemUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Update an existing inventory item."""

    service = InventoryService(session=session, subject=subject)
    return await service.update_item(item_id, payload)


@router.post("/items/{item_id}/adjustments", response_model=InventoryItemResponse)
async def adjust_inventory_item(
    item_id: str,
    payload: InventoryAdjustmentRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Adjust the stock quantity for an existing inventory item."""

    service = InventoryService(session=session, subject=subject)
    return await service.adjust_item(item_id, payload)


@router.post("/items/{item_id}/transfers", response_model=InventoryItemResponse)
async def transfer_inventory_item(
    item_id: str,
    payload: InventoryTransferRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Transfer an inventory item between storage locations."""

    service = InventoryService(session=session, subject=subject)
    return await service.transfer_item(item_id, payload)


@router.get("/locations", response_model=list[InventoryLocationResponse])
async def list_inventory_locations(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[InventoryLocationResponse]:
    """Return storage locations."""

    service = InventoryService(session=session, subject=subject)
    return await service.list_locations()


@router.post("/locations", response_model=InventoryLocationResponse, status_code=201)
async def create_inventory_location(
    payload: InventoryLocationCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryLocationResponse:
    """Create a storage location."""

    service = InventoryService(session=session, subject=subject)
    return await service.create_location(payload)


@router.get("/movements", response_model=InventoryMovementListResponse)
async def list_inventory_movements(
    item_id: str = Query(default="", max_length=36),
    movement_type: str = Query(default="", pattern="^(|initial|entry|exit|adjustment|transfer)$"),
    limit: int = Query(default=50, ge=1, le=200),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryMovementListResponse:
    """Return recent movement history."""

    service = InventoryService(session=session, subject=subject)
    return await service.list_movements(item_id=item_id, movement_type=movement_type, limit=limit)


@router.post("/invoice-preview", response_model=InventoryInvoicePreviewResponse)
async def preview_inventory_invoice_import(
    file: UploadFile = File(...),
    provider: str = Form(default=""),
    model: str = Form(default=""),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> InventoryInvoicePreviewResponse:
    """Extract stock data from an invoice file for operator review."""

    service = InventoryInvoiceService(session=session, subject=subject, settings=settings)
    return await service.preview_invoice_import(file=file, provider=provider, model=model)


@router.post("/invoice-confirm", response_model=InventoryInvoiceConfirmResponse)
async def confirm_inventory_invoice_import(
    payload: InventoryInvoiceConfirmRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> InventoryInvoiceConfirmResponse:
    """Persist reviewed invoice lines into stock items and movements."""

    service = InventoryInvoiceService(session=session, subject=subject, settings=settings)
    return await service.confirm_invoice_import(payload)


@router.get("/export")
async def export_inventory_items(
    query: str = Query(default="", max_length=120),
    stock_status: str = Query(default="all", pattern="^(all|ok|normal|attention|low|out)$"),
    controlled_only: bool = Query(default=False),
    location_code: str = Query(default="", max_length=64),
    medication_class_name: str = Query(default="", max_length=120),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> Response:
    """Export inventory items as CSV."""

    service = InventoryService(session=session, subject=subject)
    export = await service.export_items(
        query=query,
        stock_status=stock_status,
        controlled_only=controlled_only,
        location_code=location_code,
        medication_class_name=medication_class_name,
    )
    return Response(
        content=export.body,
        media_type=export.content_type,
        headers={"Content-Disposition": f'attachment; filename="{export.filename}"'},
    )
