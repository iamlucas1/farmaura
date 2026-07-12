"""
farmaura-api/app/models/file_asset.py

File asset ORM model for Farmaura.

Responsibilities:
- persist metadata for private uploaded files;
- enforce tenant-separated ownership and status tracking;
- support protected download and scanning workflows;

Observations:
- raw file bytes stay outside the database;
- storage paths must never be derived from user filenames;
"""

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import FileStatus
from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# FILE ASSET MODEL
# ============================================================================


class FileAsset(Base, UuidModel, TimestampedModel):
    """Persist private uploaded file metadata."""

    __tablename__ = "file_assets"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=FileStatus.PENDING_SCAN.value, nullable=False)
