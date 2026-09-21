"""
farmaura-api/app/models/fiscal_support_tables.py

Auxiliary fiscal ORM models for Farmaura.

Responsibilities:
- `FiscalEvent`: cancellations registered against a document, with the exact XML sent/received;
- `FiscalAttempt`: one row per call to SEFAZ, for auditing and latency/error analysis;
- `FiscalNumberSequence`: the transactional counter that hands out NFC-e numbers;
- `FiscalInutilization`: number ranges that were formally voided;
- `ProductFiscalProfile`: the tax classification a product needs to be sold with an NFC-e;

Observations:
- no row here ever stores the CSC, certificate or password;
- the sequence table is the only place numbers are allocated, always through one atomic UPDATE;
- a product fiscal profile is data entered/approved by accounting; the engine never fills gaps itself;
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel

# ============================================================================
# EVENTS
# ============================================================================


class FiscalEvent(Base, UuidModel, TimestampedModel):
    """Persist one fiscal event (cancellation) with the original XML."""

    __tablename__ = "fiscal_events"
    __table_args__ = (
        UniqueConstraint("fiscal_document_id", "event_type", "sequence", name="uq_fiscal_events_document_type_sequence"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    fiscal_document_id: Mapped[str] = mapped_column(
        ForeignKey("fiscal_documents.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(24), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    protocol: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    cstat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    justification: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    created_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    xml: Mapped[str] = mapped_column(Text, default="", nullable=False)


# ============================================================================
# ATTEMPTS
# ============================================================================


class FiscalAttempt(Base, UuidModel, TimestampedModel):
    """Persist one call made to SEFAZ (or one local processing step)."""

    __tablename__ = "fiscal_attempts"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    fiscal_document_id: Mapped[str | None] = mapped_column(
        ForeignKey("fiscal_documents.id", ondelete="RESTRICT"), index=True, nullable=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cstat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    xmotivo: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    error_category: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)


# ============================================================================
# NUMBERING
# ============================================================================


class FiscalNumberSequence(Base, UuidModel, TimestampedModel):
    """Persist the next NFC-e number for one emitter, environment, model and series."""

    __tablename__ = "fiscal_number_sequences"
    __table_args__ = (
        UniqueConstraint("emitter_cnpj", "environment", "model", "serie", name="uq_fiscal_number_sequences_key"),
        CheckConstraint("next_number >= 1", name="fiscal_number_sequences_next_positive"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    emitter_cnpj: Mapped[str] = mapped_column(String(14), nullable=False)
    environment: Mapped[str] = mapped_column(String(12), nullable=False)
    model: Mapped[str] = mapped_column(String(2), default="65", nullable=False)
    serie: Mapped[int] = mapped_column(Integer, nullable=False)
    next_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


# ============================================================================
# INUTILIZATION
# ============================================================================


class FiscalInutilization(Base, UuidModel, TimestampedModel):
    """Persist one request to void a range of NFC-e numbers."""

    __tablename__ = "fiscal_inutilizations"
    __table_args__ = (CheckConstraint("number_end >= number_start", name="fiscal_inutilizations_range_valid"),)

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    environment: Mapped[str] = mapped_column(String(12), nullable=False)
    emitter_cnpj: Mapped[str] = mapped_column(String(14), nullable=False)
    serie: Mapped[int] = mapped_column(Integer, nullable=False)
    number_start: Mapped[int] = mapped_column(Integer, nullable=False)
    number_end: Mapped[int] = mapped_column(Integer, nullable=False)
    justification: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="REQUESTED", nullable=False)
    cstat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    protocol: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    requested_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    xml: Mapped[str] = mapped_column(Text, default="", nullable=False)


# ============================================================================
# PRODUCT FISCAL PROFILE
# ============================================================================


class ProductFiscalProfile(Base, UuidModel, TimestampedModel):
    """Persist the tax classification of one product, entered or approved by accounting."""

    __tablename__ = "product_fiscal_profiles"
    __table_args__ = (UniqueConstraint("product_id", name="uq_product_fiscal_profiles_product"),)

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    product_id: Mapped[str] = mapped_column(ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False)
    ncm: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    cest: Mapped[str] = mapped_column(String(7), default="", nullable=False)
    cfop: Mapped[str] = mapped_column(String(4), default="", nullable=False)
    origin: Mapped[str] = mapped_column(String(1), default="", nullable=False)
    commercial_unit: Mapped[str] = mapped_column(String(6), default="", nullable=False)
    icms_cst: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    icms_csosn: Mapped[str] = mapped_column(String(3), default="", nullable=False)
    icms_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    pis_cst: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    pis_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    cofins_cst: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    cofins_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    cbenef: Mapped[str] = mapped_column(String(10), default="", nullable=False)
    ibscbs_cst: Mapped[str] = mapped_column(String(3), default="", nullable=False)
    ibscbs_cclasstrib: Mapped[str] = mapped_column(String(6), default="", nullable=False)
    ibscbs_has_tax_group: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ibs_uf_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    ibs_mun_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    cbs_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    notes: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    updated_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
