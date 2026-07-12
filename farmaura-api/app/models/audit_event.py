"""
farmaura-api/app/models/audit_event.py

Audit event ORM model for Farmaura.

Responsibilities:
- persist security-sensitive audit records;
- provide actor and tenant traceability;
- support later compliance and incident review workflows;

Observations:
- payload fields must stay redacted and minimal;
- audit writes should never block critical paths excessively;
"""

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# AUDIT EVENT MODEL
# ============================================================================


class AuditEvent(Base, UuidModel, TimestampedModel):
    """Persist a security-sensitive audit event."""

    __tablename__ = "audit_events"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    actor_role: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    access_scope: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    request_id: Mapped[str] = mapped_column(String(64), index=True, default="", nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="backend", nullable=False)
    action: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    outcome: Mapped[str] = mapped_column(String(24), default="success", nullable=False)
    http_method: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    http_path: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    user_agent: Mapped[str] = mapped_column(String(512), default="", nullable=False)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
