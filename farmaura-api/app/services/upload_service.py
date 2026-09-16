"""
farmaura-api/app/services/upload_service.py

Upload service for Farmaura.

Responsibilities:
- validate private uploads and generate storage keys;
- persist upload metadata records and the underlying file bytes;
- enforce tenant-separated file handling contracts;

Observations:
- malware scanning can be added later (status stays "pending_scan" until then — see
  FileAsset/FileStatus — nothing currently claims a scan happened, and no downstream
  code gates on "accepted" instead of tenant/owner ownership, which is the actual
  access control for downloads);
- storage_key is generated server-side (tenant/owner/uuid + sniffed extension) and is
  never derived from the client-supplied filename, so a hostile filename (path traversal
  segments, null bytes, an executable-looking name) can never influence where or how the
  file is written or later served.
"""

import re
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.file_storage import read_private_file, write_private_file
from app.core.file_validation import EXTENSION_BY_CONTENT_TYPE, validate_upload
from app.domain.enums import AccessScope, UserRole
from app.models.file_asset import FileAsset
from app.repositories.file_repository import FileRepository
from app.schemas.auth import TokenSubject
from app.schemas.uploads import UploadResponse

# Internal roles allowed to read any file uploaded within their own tenant (the pharmacist
# review/chat workflows this backs are tenant-wide operational data, same trust boundary
# PrescriptionService.list_review_queue already uses — tenant scope, not per-file ownership).
_STAFF_DOWNLOAD_ROLES = {UserRole.ADMIN, UserRole.PHARMACIST, UserRole.MANAGER}

# Strip everything except a conservative safe set before a filename ever reaches an HTTP header —
# untrusted (client-supplied at upload time), and header-injection (CR/LF) or quote-breaking
# characters must never reach Content-Disposition unescaped.
_UNSAFE_FILENAME_CHARS = re.compile(r'[^A-Za-z0-9 ._-]+')


# ============================================================================
# UPLOAD SERVICE
# ============================================================================


class UploadService:
    """Handle private upload validation, byte storage, and metadata persistence."""

    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        """Store dependencies for upload handling."""

        self.session = session
        self.settings = settings
        self.repository = FileRepository(session)

    async def register_upload(self, *, tenant_id: str, owner_user_id: str, file: UploadFile) -> UploadResponse:
        """Validate, store, and register an uploaded file."""

        await validate_upload(file, self.settings)
        content = await file.read()
        await file.seek(0)
        extension = EXTENSION_BY_CONTENT_TYPE.get(file.content_type or "", "")
        storage_key = f"{tenant_id}/{owner_user_id}/{uuid4()}{extension}"
        await write_private_file(settings=self.settings, storage_key=storage_key, content=content)
        metadata = FileAsset(
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
            original_name=file.filename or "unnamed",
            storage_key=storage_key,
            content_type=file.content_type or "application/octet-stream",
            size_bytes=len(content),
        )
        await self.repository.save(metadata)
        return UploadResponse(file_id=metadata.id, storage_key=metadata.storage_key, status=metadata.status)

    async def get_download(self, *, subject: TokenSubject, file_id: str) -> tuple[FileAsset, bytes, str]:
        """Return one file asset's metadata, bytes, and a header-safe filename for a protected download.

        Authorization is enforced here, independent of anything the caller already checked: the
        requester must either be the file's own uploader, or internal staff (admin/pharmacist/
        manager) within the same tenant. `storage_key` is never exposed to callers — it stays an
        internal identifier, never a public URL, per the file_asset design intent.
        """

        file_asset = await self.repository.get_by_id(tenant_id=str(subject.tenant_id), file_id=file_id)
        if file_asset is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
        is_owner = str(subject.user_id) == file_asset.owner_user_id
        is_staff = subject.access_scope == AccessScope.INTERNAL and subject.role in _STAFF_DOWNLOAD_ROLES
        if not (is_owner or is_staff):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this file.")
        content = await read_private_file(settings=self.settings, storage_key=file_asset.storage_key)
        safe_name = _UNSAFE_FILENAME_CHARS.sub("_", file_asset.original_name).strip() or "arquivo"
        return file_asset, content, safe_name[:200]
