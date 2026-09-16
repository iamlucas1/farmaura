"""
farmaura-api/app/repositories/file_repository.py

File repository for Farmaura.

Responsibilities:
- persist upload metadata records;
- support protected file retrieval workflows;
- keep file metadata access tenant-aware;

Observations:
- file byte storage remains outside repository scope;
- scanning state transitions can build on this module;
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file_asset import FileAsset


# ============================================================================
# FILE REPOSITORY
# ============================================================================


class FileRepository:
    """Provide file metadata persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def save(self, file_asset: FileAsset) -> FileAsset:
        """Persist a file asset record."""

        self.session.add(file_asset)
        await self.session.flush()
        return file_asset

    async def get_by_id(self, *, tenant_id: str, file_id: str) -> FileAsset | None:
        """Return one tenant-scoped file asset by identifier, for protected downloads."""

        statement = select(FileAsset).where(FileAsset.id == file_id, FileAsset.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
