"""
farmaura-api/app/models/chat_message.py

Chat message ORM model for Farmaura.

Responsibilities:
- persist the message stream inside each pharmacist chat thread;
- keep sender identity and audience read state explicit for both sides;
- support immutable conversational history tied to the originating order thread;

Observations:
- messages are append-only records and should not be overwritten after delivery;
- sender role snapshots are stored to preserve history even if account roles change later;
"""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CHAT MESSAGE MODEL
# ============================================================================


class ChatMessage(Base, UuidModel, TimestampedModel):
    """Persist one message inside a pharmacist chat thread."""

    __tablename__ = "chat_messages"

    thread_id: Mapped[str] = mapped_column(ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    sender_customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    message_type: Mapped[str] = mapped_column(String(24), default="text", nullable=False)
    sender_role: Mapped[str] = mapped_column(String(24), nullable=False)
    sender_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    body_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    sent_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    customer_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pharmacist_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_internal_note: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    prescription_id: Mapped[str | None] = mapped_column(ForeignKey("prescriptions.id", ondelete="SET NULL"), index=True, nullable=True)
