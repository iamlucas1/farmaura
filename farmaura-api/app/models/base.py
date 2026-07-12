"""
farmaura-api/app/models/base.py

Shared ORM base classes for Farmaura.

Responsibilities:
- define the declarative base and common columns;
- standardize UUID identifiers and timestamps;
- keep entity metadata consistent across models;

Observations:
- UTC-aware timestamps are generated server-side;
- public identifiers use UUID values from the first version;
"""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, MetaData
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# ============================================================================
# DECLARATIVE BASE
# ============================================================================


convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base declarative model with naming conventions."""

    metadata = MetaData(naming_convention=convention)


class TimestampedModel:
    """Reusable created-at and updated-at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=UTC),
        onupdate=lambda: datetime.now(tz=UTC),
        nullable=False,
    )


class UuidModel:
    """Reusable UUID primary key column."""

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
