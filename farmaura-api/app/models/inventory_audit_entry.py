"""
farmaura-api/app/models/inventory_audit_entry.py

Inventory audit entry ORM model for Farmaura.

Responsibilities:
- persist a field-level before/after trail for inventory item and storage
  location writes (creation, edits, status changes);
- capture full actor identity (denormalized at write time) and request IP;
- support the admin-only audit console screen;

Observations:
- one row per save action, not per changed field — "changes_json" holds the
  list of fields that actually changed in that action;
- quantity movements already have their own trail in InventoryMovement and
  are not duplicated here; the audit read endpoint merges both sources.
"""

from sqlalchemy import CheckConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# INVENTORY AUDIT ENTRY MODEL
# ============================================================================


class InventoryAuditEntry(Base, UuidModel, TimestampedModel):
    """Persist a field-level audit trail entry for an inventory write."""

    __tablename__ = "inventory_audit_entries"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('item', 'location')",
            name="inventory_audit_entries_entity_type_allowed",
        ),
        CheckConstraint(
            "action IN ('create', 'update', 'status_change')",
            name="inventory_audit_entries_action_allowed",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    entity_label: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    action: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    changes_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    actor_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    actor_email: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    actor_role: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    user_agent: Mapped[str] = mapped_column(String(512), default="", nullable=False)
