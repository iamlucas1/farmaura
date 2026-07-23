"""
farmaura-api/app/models/purchase_quote.py

Purchase quote ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped supplier purchase quotes (orçamentos de compra);
- keep quotes fully separate from sellable inventory — a quote never creates
  or updates an InventoryItem/InventoryProduct, it only records what a
  supplier offered on a given date so the operator can compare and decide;

Observations:
- quotes are tenant-scoped, not store-scoped, mirroring Supplier;
- quote_date is the day the quotation is valid for (prices vary daily), kept
  independent from created_at/updated_at so it can be corrected during review;
- the source document, when present, is stored outside the database via
  app.core.file_storage, following the InventoryInvoiceRecord convention;
"""

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampedModel, UuidModel

if TYPE_CHECKING:
    from app.models.purchase_quote_item import PurchaseQuoteItem
    from app.models.purchase_quote_payment_term import PurchaseQuotePaymentTerm


# ============================================================================
# PURCHASE QUOTE MODEL
# ============================================================================


class PurchaseQuote(Base, UuidModel, TimestampedModel):
    """Persist a tenant-scoped supplier purchase quote header."""

    __tablename__ = "purchase_quotes"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'confirmed', 'archived')", name="purchase_quotes_status_valid"
        ),
        CheckConstraint(
            "freight_type IN ('', 'FOB', 'CIF')", name="purchase_quotes_freight_type_valid"
        ),
        CheckConstraint(
            "freight_cost IS NULL OR freight_cost >= 0",
            name="purchase_quotes_freight_cost_non_negative",
        ),
        CheckConstraint(
            "delivery_time_days IS NULL OR delivery_time_days >= 0",
            name="purchase_quotes_delivery_time_non_negative",
        ),
        CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0", name="purchase_quotes_size_bytes_non_negative"
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    supplier_id: Mapped[str | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True, nullable=True
    )
    supplier_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    supplier_document_snapshot: Mapped[str] = mapped_column(String(18), default="", nullable=False)

    quote_date: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(16), default="confirmed", nullable=False)

    freight_type: Mapped[str] = mapped_column(String(4), default="", nullable=False)
    freight_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    delivery_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    source_provider: Mapped[str] = mapped_column(String(24), default="", nullable=False)
    source_model: Mapped[str] = mapped_column(String(64), default="", nullable=False)

    file_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_key: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )

    items: Mapped[list["PurchaseQuoteItem"]] = relationship(
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="PurchaseQuoteItem.created_at",
    )
    payment_terms: Mapped[list["PurchaseQuotePaymentTerm"]] = relationship(
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="PurchaseQuotePaymentTerm.created_at",
    )
