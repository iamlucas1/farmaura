"""
farmaura-api/app/models/payment_webhook_event.py

Payment webhook event ORM model for Farmaura.

Responsibilities:
- record every processed inbound payment webhook event exactly once;
- provide the idempotency key that protects order state from webhook replay.

Observations:
- (source, event_name, external_id) is the natural dedup key for provider replays;
- this table intentionally has no tenant_id: the matching order already carries it,
  and webhook delivery happens before any tenant context is established.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PAYMENT WEBHOOK EVENT MODEL
# ============================================================================


class PaymentWebhookEvent(Base, UuidModel, TimestampedModel):
    """Persist one processed payment webhook event for idempotency."""

    __tablename__ = "payment_webhook_events"
    __table_args__ = (
        UniqueConstraint("source", "event_name", "external_id", name="uq_payment_webhook_events_dedup_key"),
    )

    source: Mapped[str] = mapped_column(String(32), default="asaas", nullable=False)
    event_name: Mapped[str] = mapped_column(String(64), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
