"""
farmaura-api/app/models/supplier.py

Supplier ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped supplier (fornecedor) records;
- store commercial terms used by goods-receipt and stock-lot workflows;

Observations:
- suppliers are tenant-scoped, not store-scoped, since one supplier can serve every store in the tenant;
- suppliers are soft-deleted via is_active to preserve stock-lot history references;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# SUPPLIER MODEL
# ============================================================================


class Supplier(Base, UuidModel, TimestampedModel):
    """Persist a tenant-scoped supplier record."""

    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "cnpj", name="uq_suppliers_tenant_cnpj"),
        CheckConstraint("uf = '' OR char_length(uf) = 2", name="suppliers_uf_length"),
        CheckConstraint("lead_time_days >= 0", name="suppliers_lead_time_non_negative"),
        CheckConstraint("minimum_order_amount >= 0", name="suppliers_minimum_order_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trade_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    cnpj: Mapped[str] = mapped_column(String(18), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    website: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    category: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    contact_person_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    uf: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    address_line: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    minimum_order_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    freight_policy: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    payment_terms: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
