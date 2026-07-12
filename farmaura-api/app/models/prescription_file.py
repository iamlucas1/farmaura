"""
farmaura-api/app/models/prescription_file.py

Prescription file ORM model for Farmaura.

Responsibilities:
- link uploaded private files to a prescription submission;
- preserve the document order and primary page designation for review;
- keep the attachment layer explicit without overloading generic file metadata;

Observations:
- the raw file payload remains outside the database and is represented by file_asset references;
- multiple files support photos, scans, and multi-page PDF workflows;
"""

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRESCRIPTION FILE MODEL
# ============================================================================


class PrescriptionFile(Base, UuidModel, TimestampedModel):
    """Persist a file attachment linked to a prescription."""

    __tablename__ = "prescription_files"
    __table_args__ = (
        UniqueConstraint("prescription_id", "file_asset_id", name="uq_prescription_files_prescription_file"),
    )

    prescription_id: Mapped[str] = mapped_column(ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True, nullable=False)
    file_asset_id: Mapped[str] = mapped_column(ForeignKey("file_assets.id", ondelete="CASCADE"), index=True, nullable=False)
    page_order: Mapped[int] = mapped_column(default=1, nullable=False)
    original_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    content_type_snapshot: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
