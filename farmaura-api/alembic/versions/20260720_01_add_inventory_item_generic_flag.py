"""add_inventory_item_generic_flag

Add the persisted generic-medicine flag used by marketplace image compliance.
"""

from alembic import op
from sqlalchemy import Boolean, Column, inspect


# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260720_01"
down_revision = None
branch_labels = None
depends_on = None


# ============================================================================
# MIGRATION OPERATIONS
# ============================================================================


def upgrade() -> None:
    """Add the generic flag when the inventory table does not yet contain it."""

    bind = op.get_bind()
    column_names = {column["name"] for column in inspect(bind).get_columns("inventory_items")}
    if "is_generic" not in column_names:
        op.add_column("inventory_items", Column("is_generic", Boolean(), nullable=False, server_default="false"))
    op.execute("UPDATE inventory_items SET is_generic = false WHERE is_generic IS NULL")


def downgrade() -> None:
    """Remove the persisted generic flag when rolling back this revision."""

    bind = op.get_bind()
    column_names = {column["name"] for column in inspect(bind).get_columns("inventory_items")}
    if "is_generic" in column_names:
        op.drop_column("inventory_items", "is_generic")
