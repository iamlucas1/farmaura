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

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_subject_session, require_internal_subject
from app.core.config import Settings
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.inventory import (
    InventoryAdjustmentRequest,
    InventoryAuditListResponse,
    InventoryDashboardResponse,
    InventoryInvoiceApplyResponse,
    InventoryInvoiceConfirmRequest,
    InventoryInvoiceConfirmResponse,
    InventoryInvoicePreviewResponse,
    InventoryInvoiceRecordListResponse,
    InventoryItemCreateRequest,
    InventoryItemUpdateRequest,
    InventoryItemResponse,
    InventoryListResponse,
    InventoryLocationCreateRequest,
    InventoryLocationResponse,
    InventoryLocationStatusUpdateRequest,
    InventoryLocationUpdateRequest,
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
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
) -> InventoryStatusResponse:
    """Return the inventory module readiness state."""

    service = OperationsService()
    return await service.get_status("Inventory workflows scaffolded.")


@router.get("/dashboard", response_model=InventoryDashboardResponse)
async def get_inventory_dashboard(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryDashboardResponse:
    """Return the inventory dashboard payload."""

    service = InventoryService(session=session, subject=subject)
    return await service.get_dashboard(requested_store_id=store_id)


@router.get("/items", response_model=InventoryListResponse)
async def list_inventory_items(
    query: str = Query(default="", max_length=120),
    stock_status: str = Query(default="all", pattern="^(all|ok|normal|attention|low|out)$"),
    controlled_only: bool = Query(default=False),
    location_code: str = Query(default="", max_length=64),
    medication_class_name: str = Query(default="", max_length=120),
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
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
        requested_store_id=store_id,
    )


@router.post("/items", response_model=InventoryItemResponse, status_code=201)
async def create_inventory_item(
    payload: InventoryItemCreateRequest,
    request: Request,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Create a new inventory item."""

    service = InventoryService(session=session, subject=subject)
    return await service.create_item(
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
async def update_inventory_item(
    item_id: str,
    payload: InventoryItemUpdateRequest,
    request: Request,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Update an existing inventory item."""

    service = InventoryService(session=session, subject=subject)
    return await service.update_item(
        item_id,
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.post("/items/{item_id}/adjustments", response_model=InventoryItemResponse)
async def adjust_inventory_item(
    item_id: str,
    payload: InventoryAdjustmentRequest,
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Adjust the stock quantity for an existing inventory item."""

    service = InventoryService(session=session, subject=subject)
    return await service.adjust_item(item_id, payload, requested_store_id=store_id)


@router.post("/items/{item_id}/transfers", response_model=InventoryItemResponse)
async def transfer_inventory_item(
    item_id: str,
    payload: InventoryTransferRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Transfer an inventory item between storage locations."""

    service = InventoryService(session=session, subject=subject)
    return await service.transfer_item(item_id, payload)


@router.post("/items/{item_id}/invoices", response_model=InventoryInvoiceApplyResponse, status_code=201)
async def apply_inventory_item_invoice(
    item_id: str,
    request: Request,
    file: UploadFile = File(...),
    invoice_total_amount: Decimal = Form(...),
    product_total_amount: Decimal = Form(...),
    quantity: int = Form(...),
    note: str = Form(default=""),
    tax_cost_amount: Decimal | None = Form(default=None),
    is_subject_to_icms_st: bool | None = Form(default=None),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> InventoryInvoiceApplyResponse:
    """Attach a supplier invoice (PDF/XML) to an item, recompute its unit cost, and receive stock. Admin only."""

    service = InventoryService(session=session, subject=subject)
    return await service.apply_invoice_edit(
        item_id,
        invoice_total_amount=invoice_total_amount,
        product_total_amount=product_total_amount,
        quantity=quantity,
        note=note,
        file=file,
        settings=settings,
        tax_cost_amount=tax_cost_amount,
        is_subject_to_icms_st=is_subject_to_icms_st,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.get("/items/{item_id}/invoices", response_model=InventoryInvoiceRecordListResponse)
async def list_inventory_item_invoices(
    item_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryInvoiceRecordListResponse:
    """Return the stored supplier invoice history for one inventory item."""

    service = InventoryService(session=session, subject=subject)
    return await service.list_item_invoice_records(item_id)


@router.get("/invoices/{invoice_id}/file")
async def download_inventory_invoice_file(
    invoice_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> Response:
    """Download the stored file for one supplier invoice record."""

    service = InventoryService(session=session, subject=subject)
    record, content = await service.get_invoice_file(invoice_id, settings=settings)
    return Response(
        content=content,
        media_type=record.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{record.file_name}"'},
    )


@router.get("/locations", response_model=list[InventoryLocationResponse])
async def list_inventory_locations(
    store_id: str = Query(default="", max_length=36),
    location_type: str = Query(default="", pattern="^(|estoque|prateleira|gondola|caixa|outro)$"),
    active_only: bool = Query(default=False),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[InventoryLocationResponse]:
    """Return storage locations for one store (unit)."""

    service = InventoryService(session=session, subject=subject)
    return await service.list_locations(store_id=store_id, location_type=location_type, active_only=active_only)


@router.post("/locations", response_model=InventoryLocationResponse, status_code=201)
async def create_inventory_location(
    payload: InventoryLocationCreateRequest,
    request: Request,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryLocationResponse:
    """Create a storage location."""

    service = InventoryService(session=session, subject=subject)
    return await service.create_location(
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.put("/locations/{location_id}", response_model=InventoryLocationResponse)
async def update_inventory_location(
    location_id: str,
    payload: InventoryLocationUpdateRequest,
    request: Request,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryLocationResponse:
    """Update a storage location."""

    service = InventoryService(session=session, subject=subject)
    return await service.update_location(
        location_id,
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.patch("/locations/{location_id}/status", response_model=InventoryLocationResponse)
async def update_inventory_location_status(
    location_id: str,
    payload: InventoryLocationStatusUpdateRequest,
    request: Request,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryLocationResponse:
    """Activate or deactivate a storage location."""

    service = InventoryService(session=session, subject=subject)
    return await service.update_location_status(
        location_id,
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.get("/movements", response_model=InventoryMovementListResponse)
async def list_inventory_movements(
    item_id: str = Query(default="", max_length=36),
    movement_type: str = Query(default="", pattern="^(|initial|entry|exit|adjustment|transfer)$"),
    limit: int = Query(default=50, ge=1, le=200),
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryMovementListResponse:
    """Return recent movement history."""

    service = InventoryService(session=session, subject=subject)
    return await service.list_movements(item_id=item_id, movement_type=movement_type, limit=limit, requested_store_id=store_id)


@router.post("/invoice-preview", response_model=InventoryInvoicePreviewResponse)
async def preview_inventory_invoice_import(
    file: UploadFile = File(...),
    provider: str = Form(default=""),
    model: str = Form(default=""),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> InventoryInvoicePreviewResponse:
    """Extract stock data from an invoice file for operator review."""

    service = InventoryInvoiceService(session=session, subject=subject, settings=settings)
    return await service.preview_invoice_import(file=file, provider=provider, model=model)


@router.post("/invoice-confirm", response_model=InventoryInvoiceConfirmResponse)
async def confirm_inventory_invoice_import(
    payload: InventoryInvoiceConfirmRequest,
    request: Request,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> InventoryInvoiceConfirmResponse:
    """Persist reviewed invoice lines into stock items and movements."""

    service = InventoryInvoiceService(session=session, subject=subject, settings=settings)
    return await service.confirm_invoice_import(
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.get("/audit", response_model=InventoryAuditListResponse)
async def list_inventory_audit_trail(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    entity_type: str = Query(default="", pattern="^(|item|location)$"),
    action: str = Query(default="", pattern="^(|create|update|status_change|stock_movement|pdv_sale)$"),
    actor_query: str = Query(default="", max_length=120),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    q: str = Query(default="", max_length=120),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryAuditListResponse:
    """Return the merged, paginated inventory audit trail (admin sees every store, manager sees their own)."""

    service = InventoryService(session=session, subject=subject)
    return await service.list_audit_trail(
        page=page,
        page_size=page_size,
        entity_type=entity_type,
        action=action,
        actor_query=actor_query,
        date_from=date_from,
        date_to=date_to,
        q=q,
    )


@router.get("/export")
async def export_inventory_items(
    query: str = Query(default="", max_length=120),
    stock_status: str = Query(default="all", pattern="^(all|ok|normal|attention|low|out)$"),
    controlled_only: bool = Query(default=False),
    location_code: str = Query(default="", max_length=64),
    medication_class_name: str = Query(default="", max_length=120),
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
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
        requested_store_id=store_id,
    )
    return Response(
        content=export.body,
        media_type=export.content_type,
        headers={"Content-Disposition": f'attachment; filename="{export.filename}"'},
    )
