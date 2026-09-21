"""
farmaura-api/app/models/fiscal_document.py

Fiscal document ORM model for Farmaura.

Responsibilities:
- persist the full lifecycle of one NFC-e: numbering, access key, SEFAZ outcome, storage references;
- keep one immutable payload snapshot so emission and retries never depend on live sale/product rows;
- support the durable outbox the emission worker drains (status, lease, retry timing);

Observations:
- one document per sale is enforced by a unique partial index on `pdv_sale_id`;
- the emitter's number is unique per (CNPJ, environment, model, series) through a partial unique index;
- rows created by the pre-2026-09 prototype carry `status = LEGACY_SIMULATED`: their number/key are hashes,
  never came from SEFAZ, and must not be presented as authorized. Their legacy columns (`document_number`,
  `series_code`, `issue_datetime_label`, `approximate_tax_amount`, `authorized`) are kept only for them;
- `gross_total_amount` is the invoice total (`vNF`);
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.fiscal import FiscalDocumentStatus
from app.models.base import Base, TimestampedModel, UuidModel

_STATUS_VALUES = ", ".join(f"'{status.value}'" for status in FiscalDocumentStatus)


# ============================================================================
# FISCAL DOCUMENT MODEL
# ============================================================================


class FiscalDocument(Base, UuidModel, TimestampedModel):
    """Persist one fiscal document (NFC-e) and its SEFAZ lifecycle."""

    __tablename__ = "fiscal_documents"
    __table_args__ = (
        CheckConstraint("gross_total_amount >= 0", name="fiscal_documents_gross_total_non_negative"),
        CheckConstraint("approximate_tax_amount >= 0", name="fiscal_documents_tax_non_negative"),
        CheckConstraint(f"status IN ({_STATUS_VALUES})", name="fiscal_documents_status_valid"),
        CheckConstraint("attempt_count >= 0", name="fiscal_documents_attempts_non_negative"),
        Index(
            "uq_fiscal_documents_emitter_number",
            "emitter_cnpj", "environment", "model", "serie", "number",
            unique=True,
            postgresql_where=text("number IS NOT NULL"),
            sqlite_where=text("number IS NOT NULL"),
        ),
        Index(
            "uq_fiscal_documents_pdv_sale",
            "pdv_sale_id",
            unique=True,
            postgresql_where=text("pdv_sale_id IS NOT NULL"),
            sqlite_where=text("pdv_sale_id IS NOT NULL"),
        ),
        Index("ix_fiscal_documents_worker", "status", "next_attempt_at"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    document_type: Mapped[str] = mapped_column(String(24), default="nfce", nullable=False)
    source_channel: Mapped[str] = mapped_column(String(24), nullable=False)
    pdv_sale_id: Mapped[str | None] = mapped_column(ForeignKey("pdv_sales.id", ondelete="SET NULL"), nullable=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True)
    issued_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)

    # --- identity -----------------------------------------------------------------
    model: Mapped[str] = mapped_column(String(2), default="65", nullable=False)
    environment: Mapped[str | None] = mapped_column(String(12), nullable=True)
    emitter_cnpj: Mapped[str | None] = mapped_column(String(14), nullable=True)
    serie: Mapped[int | None] = mapped_column(Integer, nullable=True)
    number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    numeric_code: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    access_key: Mapped[str | None] = mapped_column(String(44), unique=True, index=True, nullable=True)

    # --- lifecycle ----------------------------------------------------------------
    status: Mapped[str] = mapped_column(String(24), default=FiscalDocumentStatus.DRAFT.value, index=True, nullable=False)
    cstat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status_message: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    protocol: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    issue_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    authorization_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contingency: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    qr_code_url: Mapped[str] = mapped_column(Text, default="", nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)

    # --- outbox / retry -----------------------------------------------------------
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_category: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    error_details: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # --- payload + files ----------------------------------------------------------
    payload_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    xml_signed_key: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    xml_authorized_key: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    pdf_key: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    # --- consumer snapshot + totals -----------------------------------------------
    payment_method_snapshot: Mapped[str] = mapped_column(String(24), default="", nullable=False)
    recipient_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    recipient_document_snapshot: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    gross_total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # --- legacy prototype columns (LEGACY_SIMULATED rows only) --------------------
    document_number: Mapped[str] = mapped_column(String(20), default="", index=True, nullable=False)
    series_code: Mapped[str] = mapped_column(String(10), default="", nullable=False)
    issue_datetime_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    approximate_tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    authorized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
