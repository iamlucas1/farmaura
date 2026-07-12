"""
farmaura-api/app/models/delivery_route.py

Delivery route ORM model for Farmaura.

Responsibilities:
- persist a dispatched or planned delivery route for grouped online orders;
- store driver assignment, origin hub snapshot, and route-level metrics explicitly;
- support operational tracking of route planning, dispatch, and completion;

Observations:
- route-level metrics are snapshots and should not be recomputed destructively;
- individual stops are modeled in a dedicated child table for ordered sequencing;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# DELIVERY ROUTE MODEL
# ============================================================================


class DeliveryRoute(Base, UuidModel, TimestampedModel):
    """Persist a delivery route assignment."""

    __tablename__ = "delivery_routes"
    __table_args__ = (
        CheckConstraint("total_distance_km >= 0", name="delivery_routes_total_distance_non_negative"),
        CheckConstraint("saved_distance_km >= 0", name="delivery_routes_saved_distance_non_negative"),
        CheckConstraint("estimated_duration_minutes >= 0", name="delivery_routes_estimated_duration_non_negative"),
        CheckConstraint("stop_count >= 0", name="delivery_routes_stop_count_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    driver_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    route_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    route_status: Mapped[str] = mapped_column(String(24), default="planned", nullable=False)
    driver_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    vehicle_label: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    origin_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    origin_address: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    origin_latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    origin_longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    stop_count: Mapped[int] = mapped_column(default=0, nullable=False)
    total_distance_km: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0.00"), nullable=False)
    saved_distance_km: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0.00"), nullable=False)
    estimated_duration_minutes: Mapped[int] = mapped_column(default=0, nullable=False)
    route_provider: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    route_polyline: Mapped[str] = mapped_column(String(4000), default="", nullable=False)
    planned_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    dispatched_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    completed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
