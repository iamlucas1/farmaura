"""
farmaura-api/app/models/user.py

User ORM model for Farmaura.

Responsibilities:
- persist authenticated user accounts;
- store tenant and role ownership boundaries;
- support password-based authentication flows;

Observations:
- password hashes are stored using Argon2id outputs;
- tenant scope is mandatory for all user records;
"""

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import AccessScope, UserRole
from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# USER MODEL
# ============================================================================


class User(Base, UuidModel, TimestampedModel):
    """Persist a platform user account."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'customer', 'manager', 'pharmacist', 'cashier', 'driver')",
            name="users_role_allowed",
        ),
        CheckConstraint(
            "access_scope IN ('marketplace', 'internal', 'hybrid')",
            name="users_access_scope_allowed",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default=UserRole.CUSTOMER.value, nullable=False)
    access_scope: Mapped[str] = mapped_column(
        String(32),
        default=AccessScope.MARKETPLACE.value,
        nullable=False,
    )
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    two_factor_secret: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    session_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    store_id: Mapped[str | None] = mapped_column(ForeignKey("stores.id", ondelete="SET NULL"), index=True, nullable=True)
