"""
farmaura-api/app/models/portal_setting.py

Portal setting ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped portal configuration and analytical assumptions;
- centralize marketplace meta, fiscal data, and finance presets outside frontend globals;
- provide a flexible JSON-backed storage layer for portal bootstrap settings;

Observations:
- settings values are stored as JSON text for transport and database portability;
- portal plus key pairs are unique per tenant to keep configuration deterministic;
"""

from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PORTAL SETTING MODEL
# ============================================================================


class PortalSetting(Base, UuidModel, TimestampedModel):
    """Persist one tenant-scoped portal configuration payload."""

    __tablename__ = "portal_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "portal_name", "setting_key", name="uq_portal_settings_scope"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    portal_name: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    setting_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    value_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
