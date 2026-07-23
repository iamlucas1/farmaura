"""
farmaura-api/app/api/v1/purchase_quotes.py

Purchase quote routes for Farmaura.

Responsibilities:
- expose purchase quote (orçamento) CRUD, status, and comparison endpoints;
- expose the AI import preview/confirm endpoints for supplier documents;
- enforce authenticated internal access restricted to purchasing decision-makers;

Observations:
- quotes never mutate sellable inventory — these routes only ever touch
  purchase_quotes/purchase_quote_items/purchase_quote_payment_terms;
- restricted to admin/manager, matching the sensitivity of acquisition costs
  and cross-supplier pricing data.
"""

from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_subject_session, require_internal_subject
from app.core.config import Settings
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.inventory import InventoryInvoicePreviewResponse
from app.schemas.purchase_quote import (
    PurchaseQuoteCompareResponse,
    PurchaseQuoteCreateRequest,
    PurchaseQuoteImportConfirmRequest,
    PurchaseQuoteImportPreviewResponse,
    PurchaseQuoteListResponse,
    PurchaseQuoteResponse,
    PurchaseQuoteStatusUpdateRequest,
    PurchaseQuoteUpdateRequest,
)
from app.services.purchase_quote_ai_service import PurchaseQuoteAiService
from app.services.purchase_quote_service import PurchaseQuoteService

router = APIRouter()

_ALLOWED_ROLES = (UserRole.ADMIN, UserRole.MANAGER)


# ============================================================================
# PURCHASE QUOTE ROUTES
# ============================================================================


@router.get("", response_model=PurchaseQuoteListResponse)
async def list_purchase_quotes(
    supplier_id: str = Query(default="", max_length=36),
    product_query: str = Query(default="", max_length=120),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    payment_method: str = Query(default=""),
    freight_type: str = Query(default=""),
    status_filter: str = Query(default="", alias="status"),
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> PurchaseQuoteListResponse:
    """Return tenant purchase quotes for the list screen."""

    service = PurchaseQuoteService(session=session, subject=subject)
    return await service.list_quotes(
        supplier_id=supplier_id,
        product_query=product_query,
        date_from=date_from,
        date_to=date_to,
        payment_method=payment_method,
        freight_type=freight_type,
        status_filter=status_filter,
    )


@router.get("/compare", response_model=PurchaseQuoteCompareResponse)
async def compare_purchase_quotes(
    product_id: str = Query(default="", max_length=36),
    brand_name: str = Query(default="", max_length=255),
    product_query: str = Query(default="", max_length=120),
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> PurchaseQuoteCompareResponse:
    """Compare active quotes for a product or brand across suppliers.

    All three filters are optional; with none given, returns every confirmed quoted line for the
    tenant — used by the compare screen's default full-overview table.
    """

    service = PurchaseQuoteService(session=session, subject=subject)
    return await service.compare_by_product(
        product_id=product_id, brand_name=brand_name, product_query=product_query
    )


@router.get("/{quote_id}/purchase-preview", response_model=InventoryInvoicePreviewResponse)
async def preview_purchase_from_quote(
    quote_id: str,
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> InventoryInvoicePreviewResponse:
    """Build an inventory-receiving review payload from a confirmed purchase quote.

    Read-only: does not touch inventory by itself. Turning this preview into real stock still
    requires the explicit, separate `/inventory/invoice-confirm` action.
    """

    service = PurchaseQuoteService(session=session, subject=subject)
    return await service.preview_purchase(quote_id, settings=settings)


@router.get("/{quote_id}", response_model=PurchaseQuoteResponse)
async def get_purchase_quote(
    quote_id: str,
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> PurchaseQuoteResponse:
    """Return one purchase quote with its payment terms and items."""

    service = PurchaseQuoteService(session=session, subject=subject)
    return await service.get_quote(quote_id)


@router.post("", response_model=PurchaseQuoteResponse, status_code=201)
async def create_purchase_quote(
    payload: PurchaseQuoteCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> PurchaseQuoteResponse:
    """Create a manually entered purchase quote."""

    service = PurchaseQuoteService(session=session, subject=subject)
    return await service.create_quote(payload)


@router.put("/{quote_id}", response_model=PurchaseQuoteResponse)
async def update_purchase_quote(
    quote_id: str,
    payload: PurchaseQuoteUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> PurchaseQuoteResponse:
    """Replace the header, payment terms, and items of an existing purchase quote."""

    service = PurchaseQuoteService(session=session, subject=subject)
    return await service.update_quote(quote_id, payload)


@router.patch("/{quote_id}/status", response_model=PurchaseQuoteResponse)
async def update_purchase_quote_status(
    quote_id: str,
    payload: PurchaseQuoteStatusUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> PurchaseQuoteResponse:
    """Transition a purchase quote's status (draft/confirmed/archived)."""

    service = PurchaseQuoteService(session=session, subject=subject)
    return await service.update_status(quote_id, payload)


@router.get("/{quote_id}/file")
async def download_purchase_quote_file(
    quote_id: str,
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> Response:
    """Download the stored source document for a purchase quote."""

    service = PurchaseQuoteService(session=session, subject=subject)
    quote, content = await service.get_file(quote_id, settings=settings)
    return Response(
        content=content,
        media_type=quote.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{quote.file_name}"'},
    )


@router.post("/import-preview", response_model=PurchaseQuoteImportPreviewResponse)
async def preview_purchase_quote_import(
    file: UploadFile = File(...),
    provider: str = Form(default=""),
    model: str = Form(default=""),
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> PurchaseQuoteImportPreviewResponse:
    """Extract purchase quote data from a supplier document (PDF/image/XLSX/DOCX)."""

    service = PurchaseQuoteAiService(session=session, subject=subject, settings=settings)
    return await service.preview_quote_import(file=file, provider=provider, model=model)


@router.post("/import-confirm", response_model=PurchaseQuoteResponse, status_code=201)
async def confirm_purchase_quote_import(
    file: UploadFile = File(...),
    payload: str = Form(...),
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> PurchaseQuoteResponse:
    """Persist the human-reviewed AI extraction result as a confirmed purchase quote."""

    try:
        confirm_payload = PurchaseQuoteImportConfirmRequest.model_validate_json(payload)
    except ValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    service = PurchaseQuoteAiService(session=session, subject=subject, settings=settings)
    return await service.confirm_quote_import(payload=confirm_payload, file=file)
