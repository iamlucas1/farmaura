"""
farmaura-api/app/models/pdv_draft_session.py

PDV draft session ORM model for Farmaura.

Responsibilities:
- persist one pharmacist's in-progress PDV atendimento (customer, cart, discount, delivery);
- support autosave and recovery after a page reload or a lost session;
- keep drafts strictly scoped to the pharmacist who owns them via row-level security.

Observations:
- a draft is deleted once its cart is sent to the cashier queue as a real PdvOrder;
- cart, customer, and delivery snapshots are stored denormalized (JSON) so recovery
  never needs extra product or customer lookups.
"""

from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, ForeignKey, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PDV DRAFT SESSION MODEL
# ============================================================================


class PdvDraftSession(Base, UuidModel, TimestampedModel):
    """Persist one pharmacist's in-progress PDV atendimento for autosave and recovery."""

    __tablename__ = "pdv_draft_sessions"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), default="", nullable=False)
    pharmacist_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    customer_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    items_snapshot: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    cash_wanted_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(16), default="pix", nullable=False)
    include_cpf_on_invoice: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    delivery_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    started_at_ms: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    operator: Mapped[str] = mapped_column(String(16), default="pharm", nullable=False)
