"""
farmaura-api/app/models/chat_unblock_request.py

Chat unblock request ORM model for Farmaura.

Responsibilities:
- persist a customer's appeal against an active chat spam block;
- snapshot the block state at request time so the pharmacist reviews what was
  actually true when the customer was blocked, not a value that may have
  since drifted (e.g. a temporary block that expired naturally by itself);
- record the pharmacist decision for audit purposes.

Observations:
- a customer may have at most one "pending" request at a time — enforced in
  the service layer, not a DB constraint, since a partial unique index scoped
  to one status value is more ceremony than this prototype needs;
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CHAT UNBLOCK REQUEST MODEL
# ============================================================================


class ChatUnblockRequest(Base, UuidModel, TimestampedModel):
    """Persist one customer appeal against an active chat spam block."""

    __tablename__ = "chat_unblock_requests"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    thread_id: Mapped[str | None] = mapped_column(ForeignKey("chat_threads.id", ondelete="SET NULL"), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    customer_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    violation_count_snapshot: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    permanently_blocked_snapshot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    decided_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pharmacist_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
