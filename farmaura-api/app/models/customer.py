"""
farmaura-api/app/models/customer.py

Customer ORM model for Farmaura.

Responsibilities:
- persist the customer identity used across PDV and marketplace flows;
- store contact, document, profile, loyalty, and consent fields;
- support CRM, checkout, account, and loyalty use-cases from a single customer aggregate;

Observations:
- addresses and payment methods are modeled in dedicated related tables;
- several CRM-oriented fields are stored as denormalized profile data for the current prototype scope;
"""

from decimal import Decimal

from sqlalchemy import JSON, Boolean, CheckConstraint, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CUSTOMER MODEL
# ============================================================================


class Customer(Base, UuidModel, TimestampedModel):
    """Persist a Farmaura customer across online and in-store channels."""

    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint("cashback_balance >= 0", name="customers_cashback_balance_non_negative"),
        CheckConstraint("orders_count >= 0", name="customers_orders_count_non_negative"),
        CheckConstraint("total_spent >= 0", name="customers_total_spent_non_negative"),
        CheckConstraint("average_ticket >= 0", name="customers_average_ticket_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    external_code: Mapped[str] = mapped_column(String(64), default="", index=True, nullable=False)
    payment_provider_customer_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), default="", index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(32), default="", index=True, nullable=False)
    cpf: Mapped[str | None] = mapped_column(String(14), default=None, unique=True, nullable=True)
    birth_date: Mapped[str] = mapped_column(String(10), default="", nullable=False)
    gender: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    avatar_url: Mapped[str] = mapped_column(Text, default="", nullable=False)
    loyalty_tier: Mapped[str] = mapped_column(String(24), default="Novo", nullable=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    member_since_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    city_label: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    district_label: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    cashback_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    orders_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_spent: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    average_ticket: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    last_purchase_days_ago: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purchase_frequency_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tenure_months: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_subscriptions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    favorite_items: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    top_products_snapshot: Mapped[list[dict[str, int | str]]] = mapped_column(JSON, default=list, nullable=False)
    interest_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    category_mix_snapshot: Mapped[list[dict[str, int | str]]] = mapped_column(JSON, default=list, nullable=False)
    monthly_orders_snapshot: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    marketing_program_preferences: Mapped[list[dict[str, bool | str]]] = mapped_column(JSON, default=list, nullable=False)
    communication_channel_preferences: Mapped[list[dict[str, bool | str]]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
