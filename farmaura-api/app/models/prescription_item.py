"""
farmaura-api/app/models/prescription_item.py

Prescription item ORM model for Farmaura.

Responsibilities:
- persist the medications and dosage details extracted from a prescription;
- link prescribed items to the related online order items when applicable;
- support pharmacist comparison between prescription contents and purchase intent;

Observations:
- item matching is explicit because the order may include additional non-prescription products;
- dosage and quantity stay as textual medical snapshots to avoid unsafe normalization;
"""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRESCRIPTION ITEM MODEL
# ============================================================================


class PrescriptionItem(Base, UuidModel, TimestampedModel):
    """Persist a prescribed medication line."""

    __tablename__ = "prescription_items"

    prescription_id: Mapped[str] = mapped_column(ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True, nullable=False)
    order_item_id: Mapped[str | None] = mapped_column(ForeignKey("order_items.id", ondelete="SET NULL"), index=True, nullable=True)
    inventory_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    marketplace_listing_id: Mapped[str | None] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    medication_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dosage_instructions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    prescribed_quantity_label: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    matches_requested_item: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pharmacist_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
