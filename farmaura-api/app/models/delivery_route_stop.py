"""
farmaura-api/app/models/delivery_route_stop.py

Delivery route stop ORM model for Farmaura.

Responsibilities:
- persist the ordered stops that compose a delivery route;
- link each stop back to the originating order and fulfillment record;
- store navigation, ETA, and completion snapshots for each delivery stop;

Observations:
- stop sequencing is route-specific and should be explicit instead of inferred;
- order and fulfillment snapshots remain duplicated here for immutable logistics history;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# DELIVERY ROUTE STOP MODEL
# ============================================================================


class DeliveryRouteStop(Base, UuidModel, TimestampedModel):
    """Persist an ordered stop inside a delivery route."""

    __tablename__ = "delivery_route_stops"
    __table_args__ = (
        UniqueConstraint("route_id", "stop_sequence", name="uq_delivery_route_stops_route_sequence"),
        CheckConstraint("stop_sequence > 0", name="delivery_route_stops_sequence_positive"),
        CheckConstraint("distance_from_origin_km >= 0", name="delivery_route_stops_distance_non_negative"),
    )

    route_id: Mapped[str] = mapped_column(ForeignKey("delivery_routes.id", ondelete="CASCADE"), index=True, nullable=False)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    order_fulfillment_id: Mapped[str | None] = mapped_column(
        ForeignKey("order_fulfillments.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    stop_sequence: Mapped[int] = mapped_column(nullable=False)
    stop_status: Mapped[str] = mapped_column(String(24), default="planned", nullable=False)
    customer_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    address_line_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    district_snapshot: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    postal_code_snapshot: Mapped[str] = mapped_column(String(12), default="", nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    distance_from_origin_km: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0.00"), nullable=False)
    estimated_arrival_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    arrived_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    delivered_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    navigation_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
