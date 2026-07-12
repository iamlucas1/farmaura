"""
farmaura-api/app/models/chat_message_attachment.py

Chat message attachment ORM model for Farmaura.

Responsibilities:
- link private uploaded files to chat messages;
- support medication photos, prescription references, and supporting documents in conversations;
- preserve attachment metadata snapshots for safe message rendering;

Observations:
- attachments reuse file_asset records so upload validation remains centralized;
- attachment rows stay separate from messages to keep text and file payload concerns isolated;
"""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CHAT MESSAGE ATTACHMENT MODEL
# ============================================================================


class ChatMessageAttachment(Base, UuidModel, TimestampedModel):
    """Persist an attachment linked to a chat message."""

    __tablename__ = "chat_message_attachments"
    __table_args__ = (
        UniqueConstraint("message_id", "file_asset_id", name="uq_chat_message_attachments_message_file"),
    )

    message_id: Mapped[str] = mapped_column(ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True, nullable=False)
    file_asset_id: Mapped[str] = mapped_column(ForeignKey("file_assets.id", ondelete="CASCADE"), index=True, nullable=False)
    original_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    content_type_snapshot: Mapped[str] = mapped_column(String(128), default="", nullable=False)
