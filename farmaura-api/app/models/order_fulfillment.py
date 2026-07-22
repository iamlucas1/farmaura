"""
farmaura-api/app/models/order_fulfillment.py

Online order fulfillment ORM model for Farmaura.

Responsibilities:
- persist delivery and pickup-specific execution data for online orders;
- store address, geolocation, SLA, and pickup confirmation fields explicitly;
- keep customer-facing ETA information aligned with operational fulfillment state;

Observations:
- this table is one-to-one with the parent order aggregate;
- fields unused for a fulfillment mode remain empty instead of creating parallel tables;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# ONLINE ORDER FULFILLMENT MODEL
# ============================================================================


class OrderFulfillment(Base, UuidModel, TimestampedModel):
    """Persist delivery or pickup execution data for an online order."""

    __tablename__ = "order_fulfillments"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_order_fulfillments_order_id"),
        CheckConstraint("route_distance_km >= 0", name="order_fulfillments_route_distance_non_negative"),
        CheckConstraint("sla_target_minutes >= 0", name="order_fulfillments_sla_target_non_negative"),
    )

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    fulfillment_type: Mapped[str] = mapped_column(String(24), nullable=False)
    store_label: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    pickup_code: Mapped[str] = mapped_column(String(32), default="", index=True, nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    recipient_document_snapshot: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    address_line: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    district: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    state_code: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    postal_code: Mapped[str] = mapped_column(String(12), default="", nullable=False)
    reference_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    route_distance_km: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0.00"), nullable=False)
    route_sequence: Mapped[int] = mapped_column(default=0, nullable=False)
    sla_target_minutes: Mapped[int] = mapped_column(default=0, nullable=False)
    eta_label: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    ready_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    dispatched_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    delivered_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    picked_up_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    driver_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    driver_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    carrier_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    shipping_service_id: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    tracking_code: Mapped[str] = mapped_column(String(64), default="", index=True, nullable=False)
    shipping_provider_order_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    shipping_label_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
