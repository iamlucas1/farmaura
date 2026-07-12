"""
farmaura-api/app/models/refresh_token.py

Refresh token ORM model for Farmaura.

Responsibilities:
- persist refresh token rotation records;
- support revocation and token family invalidation;
- keep refresh lifecycle state server-side;

Observations:
- only token metadata is stored here, not raw secrets;
- refresh token family compromise handling builds on this model;
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# REFRESH TOKEN MODEL
# ============================================================================


class RefreshToken(Base, UuidModel, TimestampedModel):
    """Persist refresh token rotation metadata."""

    __tablename__ = "refresh_tokens"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    token_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)
    family_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    session_version: Mapped[int] = mapped_column(default=1, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    issued_for_remember_session: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_agent: Mapped[str] = mapped_column(String(512), default="", nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    replaced_by_token_id: Mapped[str] = mapped_column(String(36), default="", nullable=False)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked_reason: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
