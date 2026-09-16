"""
farmaura-api/app/api/v1/uploads.py

Upload routes for Farmaura.

Responsibilities:
- expose protected private file upload endpoints;
- validate authenticated upload ownership context;
- delegate file validation and metadata persistence to services;

Observations:
- raw file storage adapters can be added without changing the route shape;
- upload endpoints should receive dedicated throttling in production deployment;
"""

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_current_subject, get_subject_session, require_marketplace_subject
from app.domain.enums import UserRole
from app.core.config import Settings
from app.schemas.auth import TokenSubject
from app.schemas.uploads import UploadResponse
from app.services.upload_service import UploadService


# ============================================================================
# UPLOAD ROUTES
# ============================================================================


router = APIRouter()


@router.post("", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> UploadResponse:
    """Validate and register a protected upload."""

    service = UploadService(session=session, settings=settings)
    return await service.register_upload(
        tenant_id=str(subject.tenant_id),
        owner_user_id=str(subject.user_id),
        file=file,
    )


@router.get("/{file_id}")
async def download_file(
    file_id: str,
    subject: TokenSubject = Depends(get_current_subject),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> Response:
    """Download one protected upload — the uploader's own marketplace customer, or internal
    admin/pharmacist/manager staff within the same tenant. Open to either portal deliberately
    (see `get_current_subject`, not a portal-restricted dependency): this is how a pharmacist
    views a prescription a customer attached in chat, and how that same customer can later
    reopen what they sent — both need it, neither is a good fit for a single-portal guard."""

    service = UploadService(session=session, settings=settings)
    file_asset, content, safe_name = await service.get_download(subject=subject, file_id=file_id)
    return Response(
        content=content,
        media_type=file_asset.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
