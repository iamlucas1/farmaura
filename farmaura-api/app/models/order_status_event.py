"""
farmaura-api/app/models/order_status_event.py

Online order status event ORM model for Farmaura.

Responsibilities:
- persist the operational history of each online order transition;
- keep actor, source, and notes traceable for auditing and customer support;
- support marketplace and backoffice timeline views from a single event ledger;

Observations:
- this table records append-only events and should not be updated after insert;
- actor fields remain nullable to support system-generated transitions;
"""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# ONLINE ORDER STATUS EVENT MODEL
# ============================================================================


class OrderStatusEvent(Base, UuidModel, TimestampedModel):
    """Persist a status or operational event for an online order."""

    __tablename__ = "order_status_events"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_channel: Mapped[str] = mapped_column(String(24), default="system", nullable=False)
    from_status: Mapped[str] = mapped_column(String(24), default="", nullable=False)
    to_status: Mapped[str] = mapped_column(String(24), default="", nullable=False)
    actor_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    actor_role_snapshot: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    occurred_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
