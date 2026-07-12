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

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_subject_session, require_marketplace_subject
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
