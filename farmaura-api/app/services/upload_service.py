"""
farmaura-api/app/services/upload_service.py

Upload service for Farmaura.

Responsibilities:
- validate private uploads and generate storage keys;
- persist upload metadata records;
- enforce tenant-separated file handling contracts;

Observations:
- malware scanning and durable storage adapters can be added later;
- raw bytes currently remain in the request lifecycle only;
"""

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.file_validation import validate_upload
from app.models.file_asset import FileAsset
from app.repositories.file_repository import FileRepository
from app.schemas.uploads import UploadResponse


# ============================================================================
# UPLOAD SERVICE
# ============================================================================


class UploadService:
    """Handle private upload validation and metadata persistence."""

    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        """Store dependencies for upload handling."""

        self.session = session
        self.settings = settings
        self.repository = FileRepository(session)

    async def register_upload(self, *, tenant_id: str, owner_user_id: str, file: UploadFile) -> UploadResponse:
        """Validate and register an uploaded file."""

        await validate_upload(file, self.settings)
        extension = Path(file.filename or "").suffix.lower()
        storage_key = f"{tenant_id}/{owner_user_id}/{uuid4()}{extension}"
        metadata = FileAsset(
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
            original_name=file.filename or "unnamed",
            storage_key=storage_key,
            content_type=file.content_type or "application/octet-stream",
            size_bytes=int(file.size or 0),
        )
        await self.repository.save(metadata)
        return UploadResponse(file_id=metadata.id, storage_key=metadata.storage_key, status=metadata.status)
