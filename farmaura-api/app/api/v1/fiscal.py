"""
farmaura-api/app/api/v1/fiscal.py

NFC-e fiscal routes for Farmaura.

Responsibilities:
- expose queueing, lookup, printing, download, cancellation, reconciliation and inutilization;
- expose the admin module status and the product tax-profile registry;
- keep transport handlers thin and delegated to the fiscal services;

Observations:
- permissions: cashier/pharmacist emit, consult and print; manager cancels; admin voids numbers and edits profiles;
- non-admin users only ever see documents of their own store (a foreign id answers 404, never 403);
- XML/PDF are returned only through authenticated endpoints and never by a public URL (LGPD: they hold CPF);
- no secret (CSC, certificate, password) is ever part of a response;
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.models.fiscal_document import FiscalDocument
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.schemas.auth import TokenSubject
from app.schemas.fiscal import (
    FiscalCancelRequest,
    FiscalDocumentEmailRequest,
    FiscalDocumentEmailResponse,
    FiscalDocumentListResponse,
    FiscalDocumentResponse,
    FiscalEmitRequest,
    FiscalInutilizationRequest,
    FiscalInutilizationResponse,
    FiscalModuleStatusResponse,
    ProductFiscalProfileRequest,
    ProductFiscalProfileResponse,
)
from app.services.fiscal_profile_service import FiscalProfileService
from app.services.fiscal_service import FiscalService, kick_emission

# ============================================================================
# FISCAL ROUTES
# ============================================================================


router = APIRouter()

OperatorSubject = Annotated[
    TokenSubject,
    Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
]
ManagerSubject = Annotated[TokenSubject, Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER))]
AdminSubject = Annotated[TokenSubject, Depends(require_internal_subject(UserRole.ADMIN))]
SessionDep = Annotated[AsyncSession, Depends(get_subject_session)]


async def _visible_document(service: FiscalService, subject: TokenSubject, document_id: str) -> FiscalDocument:
    """Load a document, hiding it (404) from staff of another store."""

    document = await service.get_document(document_id=document_id)
    if subject.role != UserRole.ADMIN and subject.store_id and str(document.store_id) != str(subject.store_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiscal document not found.")
    return document


# --- module status ---------------------------------------------------------------------------


@router.get("/status", response_model=FiscalModuleStatusResponse)
async def get_fiscal_status(
    _: ManagerSubject, session: SessionDep, live: Annotated[bool, Query()] = False,
) -> FiscalModuleStatusResponse:
    """Return the fiscal module health; `live=true` also asks SEFAZ for its service status."""

    return FiscalModuleStatusResponse(**await FiscalService(session).module_status(live=live))


# --- documents -------------------------------------------------------------------------------


@router.post("/nfce", response_model=FiscalDocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def emit_nfce(payload: FiscalEmitRequest, subject: OperatorSubject, session: SessionDep) -> FiscalDocumentResponse:
    """Queue the NFC-e of one closed PDV sale. Idempotent: an existing document is returned, never duplicated."""

    service = FiscalService(session)
    if not service.module_enabled():
        raise HTTPException(status.HTTP_409_CONFLICT, "O módulo de NFC-e não está habilitado.")
    sale = await session.get(PdvSale, payload.sale_id)
    if sale is None or (subject.role != UserRole.ADMIN and subject.store_id and str(sale.store_id) != str(subject.store_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda não encontrada.")
    items = list((await session.execute(select(PdvSaleItem).where(PdvSaleItem.pdv_sale_id == sale.id))).scalars().all())
    document = await service.enqueue_pdv_sale(sale=sale, sale_items=items, actor_user_id=str(subject.user_id))
    if document is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "O módulo de NFC-e não está habilitado.")
    await session.commit()
    kick_emission(document.id)
    return service.serialize_document(document)


@router.get("/nfce", response_model=FiscalDocumentListResponse)
async def list_nfce(
    subject: OperatorSubject,
    session: SessionDep,
    status_filter: Annotated[str | None, Query(alias="status", max_length=24)] = None,
    number: Annotated[int | None, Query(ge=1, le=999_999_999)] = None,
    serie: Annotated[int | None, Query(ge=0, le=999)] = None,
    access_key: Annotated[str | None, Query(pattern=r"^\d{44}$")] = None,
    sale_id: Annotated[str | None, Query(max_length=36)] = None,
    consumer_cpf: Annotated[str | None, Query(pattern=r"^\d{11}$")] = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> FiscalDocumentListResponse:
    """List fiscal documents with filters; capped pagination, store-limited for non-admin staff."""

    service = FiscalService(session)
    store_id = None if subject.role == UserRole.ADMIN else (str(subject.store_id) if subject.store_id else None)
    rows, total = await service.repository.list_documents(
        limit=limit, offset=offset, status=status_filter, number=number, serie=serie, access_key=access_key,
        sale_id=sale_id, document_cpf=consumer_cpf, date_from=date_from, date_to=date_to, store_id=store_id,
    )
    return FiscalDocumentListResponse(
        items=[service.serialize_document(row) for row in rows], total=total, limit=limit, offset=offset,
    )


@router.get("/nfce/{document_id}", response_model=FiscalDocumentResponse)
async def get_nfce(document_id: str, subject: OperatorSubject, session: SessionDep) -> FiscalDocumentResponse:
    """Return one fiscal document."""

    service = FiscalService(session)
    return service.serialize_document(await _visible_document(service, subject, document_id))


@router.get("/nfce/{document_id}/xml")
async def download_nfce_xml(document_id: str, subject: OperatorSubject, session: SessionDep) -> Response:
    """Download the authorized XML (nfeProc with protocol)."""

    service = FiscalService(session)
    content, media_type, filename = await service.read_document_file(await _visible_document(service, subject, document_id), "xml")
    return Response(content, media_type=media_type, headers=_download_headers(filename))


@router.get("/nfce/{document_id}/pdf")
async def download_nfce_pdf(document_id: str, subject: OperatorSubject, session: SessionDep) -> Response:
    """Download the DANFE NFC-e as an 80 mm PDF, generated from the authorized XML."""

    service = FiscalService(session)
    content, media_type, filename = await service.read_document_file(await _visible_document(service, subject, document_id), "pdf")
    return Response(content, media_type=media_type, headers=_download_headers(filename))


@router.get("/nfce/{document_id}/printable", response_class=HTMLResponse)
async def get_nfce_printable(document_id: str, subject: OperatorSubject, session: SessionDep) -> HTMLResponse:
    """Return the print-ready DANFE HTML (80 mm)."""

    service = FiscalService(session)
    html = await service.render_printable_html(await _visible_document(service, subject, document_id))
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.post("/nfce/{document_id}/print", response_model=FiscalDocumentResponse)
async def print_nfce(document_id: str, subject: OperatorSubject, session: SessionDep) -> FiscalDocumentResponse:
    """Confirm the note is printable and return the URLs the browser prints (the request itself is audited)."""

    service = FiscalService(session)
    document = await _visible_document(service, subject, document_id)
    await service.render_printable_html(document)
    return service.serialize_document(document)


@router.post("/nfce/{document_id}/cancel", response_model=FiscalDocumentResponse)
async def cancel_nfce(
    document_id: str, payload: FiscalCancelRequest, subject: ManagerSubject, session: SessionDep,
) -> FiscalDocumentResponse:
    """Cancel an authorized NFC-e with the official event (manager/admin)."""

    service = FiscalService(session)
    await _visible_document(service, subject, document_id)
    document = await service.cancel_document(
        document_id=document_id, justification=payload.justification, actor_user_id=str(subject.user_id)
    )
    return service.serialize_document(document)


@router.post("/nfce/{document_id}/sync", response_model=FiscalDocumentResponse)
async def sync_nfce(document_id: str, subject: OperatorSubject, session: SessionDep) -> FiscalDocumentResponse:
    """Consult SEFAZ by access key and correct the local state to the official one."""

    service = FiscalService(session)
    await _visible_document(service, subject, document_id)
    return service.serialize_document(await service.sync_document(document_id))


@router.post("/nfce/{document_id}/reprocess", response_model=FiscalDocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def reprocess_nfce(document_id: str, subject: OperatorSubject, session: SessionDep) -> FiscalDocumentResponse:
    """Re-snapshot the sale from the current product profiles and queue an ERROR/REJECTED note again."""

    service = FiscalService(session)
    await _visible_document(service, subject, document_id)
    document = await service.reprocess(document_id)
    kick_emission(document.id)
    return service.serialize_document(document)


@router.post("/nfce/{document_id}/send-email", response_model=FiscalDocumentEmailResponse)
async def send_nfce_email(
    document_id: str, payload: FiscalDocumentEmailRequest, subject: OperatorSubject, session: SessionDep,
) -> FiscalDocumentEmailResponse:
    """Send one authorized fiscal document by e-mail."""

    service = FiscalService(session)
    await _visible_document(service, subject, document_id)
    return await service.send_document_email(document_id=document_id, email=payload.email, also_whatsapp=payload.also_whatsapp)


# --- reconciliation and inutilization ----------------------------------------------------------


@router.post("/reconcile")
async def reconcile_nfce(_: AdminSubject, session: SessionDep) -> dict[str, int]:
    """Consult SEFAZ for every document that may be out of sync (admin)."""

    return {"checked": await FiscalService(session).reconcile_pending()}


@router.post("/inutilization", response_model=FiscalInutilizationResponse, status_code=status.HTTP_201_CREATED)
async def create_inutilization(
    payload: FiscalInutilizationRequest, subject: AdminSubject, session: SessionDep,
) -> FiscalInutilizationResponse:
    """Formally void a range of unused NFC-e numbers (admin only)."""

    record = await FiscalService(session).inutilize(
        tenant_id=str(subject.tenant_id), first_number=payload.first_number, last_number=payload.last_number,
        justification=payload.justification, actor_user_id=str(subject.user_id),
    )
    return _inutilization_response(record)


@router.get("/inutilization", response_model=list[FiscalInutilizationResponse])
async def list_inutilizations(_: ManagerSubject, session: SessionDep) -> list[FiscalInutilizationResponse]:
    """List recent inutilizations."""

    return [_inutilization_response(row) for row in await FiscalService(session).repository.list_inutilizations()]


# --- product tax profile -----------------------------------------------------------------------


@router.get("/products/{product_id}/profile", response_model=ProductFiscalProfileResponse)
async def get_product_profile(product_id: str, _: ManagerSubject, session: SessionDep) -> ProductFiscalProfileResponse:
    """Return the tax classification of one product, including what is still missing."""

    return await FiscalProfileService(session).get_profile(product_id=product_id)


@router.put("/products/{product_id}/profile", response_model=ProductFiscalProfileResponse)
async def put_product_profile(
    product_id: str, payload: ProductFiscalProfileRequest, subject: AdminSubject, session: SessionDep,
) -> ProductFiscalProfileResponse:
    """Create or update the tax classification of one product (admin, from accounting data)."""

    return await FiscalProfileService(session).upsert_profile(
        tenant_id=str(subject.tenant_id), product_id=product_id, payload=payload, actor_user_id=str(subject.user_id)
    )


# --- helpers -------------------------------------------------------------------------------------


def _download_headers(filename: str) -> dict[str, str]:
    return {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    }


def _inutilization_response(record: object) -> FiscalInutilizationResponse:
    return FiscalInutilizationResponse.model_validate(record, from_attributes=True)
