"""
farmaura-api/app/models/fiscal_document.py

Fiscal document ORM model for Farmaura.

Responsibilities:
- persist NFC-e issuance metadata for online and PDV sales;
- store fiscal identifiers, customer snapshot, and issuance context;
- centralize document lookup independently from the sale channel;

Observations:
- the actual XML lifecycle can be attached later through storage assets;
- this model covers the current prototype's note issuance and consultation needs;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# FISCAL DOCUMENT MODEL
# ============================================================================


class FiscalDocument(Base, UuidModel, TimestampedModel):
    """Persist NFC-e metadata for a sale."""

    __tablename__ = "fiscal_documents"
    __table_args__ = (
        UniqueConstraint("document_number", "series_code", name="uq_fiscal_documents_number_series"),
        CheckConstraint("gross_total_amount >= 0", name="fiscal_documents_gross_total_non_negative"),
        CheckConstraint("approximate_tax_amount >= 0", name="fiscal_documents_tax_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    document_type: Mapped[str] = mapped_column(String(24), default="nfce", nullable=False)
    source_channel: Mapped[str] = mapped_column(String(24), nullable=False)
    pdv_sale_id: Mapped[str | None] = mapped_column(ForeignKey("pdv_sales.id", ondelete="SET NULL"), index=True, nullable=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True)
    issued_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    document_number: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    access_key: Mapped[str] = mapped_column(String(44), unique=True, index=True, nullable=False)
    series_code: Mapped[str] = mapped_column(String(10), default="001", nullable=False)
    issue_datetime_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    payment_method_snapshot: Mapped[str] = mapped_column(String(24), default="", nullable=False)
    recipient_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    recipient_document_snapshot: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    gross_total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    approximate_tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    authorized: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
