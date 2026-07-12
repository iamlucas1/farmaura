"""
farmaura-api/app/models/chat_thread.py

Chat thread ORM model for Farmaura.

Responsibilities:
- persist a customer-to-pharmacist conversation scoped to a specific order;
- keep the order, customer, and assigned pharmacist linkage explicit;
- store thread-level metadata used by inbox and support workflows;

Observations:
- a single customer may have multiple threads because each order owns its own conversation;
- unread counters are snapshots and can be recomputed from message state when needed;
"""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CHAT THREAD MODEL
# ============================================================================


class ChatThread(Base, UuidModel, TimestampedModel):
    """Persist an order-scoped pharmacist chat thread."""

    __tablename__ = "chat_threads"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    pharmacist_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    thread_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    source_channel: Mapped[str] = mapped_column(String(24), default="marketplace", nullable=False)
    thread_status: Mapped[str] = mapped_column(String(24), default="open", nullable=False)
    topic: Mapped[str] = mapped_column(String(120), default="Atendimento farmacêutico", nullable=False)
    customer_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    pharmacist_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    order_code_snapshot: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    last_message_preview: Mapped[str] = mapped_column(Text, default="", nullable=False)
    last_message_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    customer_unread_count: Mapped[int] = mapped_column(default=0, nullable=False)
    pharmacist_unread_count: Mapped[int] = mapped_column(default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
