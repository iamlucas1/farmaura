"""
farmaura-api/app/api/v1/fiscal.py

Fiscal document routes for Farmaura.

Responsibilities:
- expose issued fiscal documents for printing and customer delivery;
- trigger e-mail dispatch for already issued fiscal documents;
- keep transport handlers thin and delegated to the fiscal service.

Observations:
- document issuance itself happens inside order and PDV services;
- printing returns HTML because the browser already owns the print flow.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.fiscal import FiscalDocumentEmailRequest, FiscalDocumentEmailResponse, FiscalDocumentResponse
from app.services.fiscal_service import FiscalService


# ============================================================================
# FISCAL ROUTES
# ============================================================================


router = APIRouter()


@router.get("/{document_id}", response_model=FiscalDocumentResponse)
async def get_fiscal_document(
    document_id: str,
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> FiscalDocumentResponse:
    """Return one issued fiscal document."""

    service = FiscalService(session)
    document = await service.get_document(document_id=document_id)
    return service.serialize_document(document)


@router.get("/{document_id}/printable", response_class=HTMLResponse)
async def get_fiscal_document_printable(
    document_id: str,
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> HTMLResponse:
    """Return one printable HTML view for a fiscal document."""

    service = FiscalService(session)
    document = await service.get_document(document_id=document_id)
    html = service.notification_service.render_fiscal_document_html(document=document)
    return HTMLResponse(content=html)


@router.post("/{document_id}/send-email", response_model=FiscalDocumentEmailResponse)
async def send_fiscal_document_email(
    document_id: str,
    payload: FiscalDocumentEmailRequest,
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> FiscalDocumentEmailResponse:
    """Send one issued fiscal document by e-mail."""

    service = FiscalService(session)
    return await service.send_document_email(
        document_id=document_id,
        email=payload.email,
        also_whatsapp=payload.also_whatsapp,
    )
