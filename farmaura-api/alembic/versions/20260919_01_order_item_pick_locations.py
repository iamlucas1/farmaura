"""order_item_pick_locations

Adds order_items.pick_locations — a JSON list of {location_code, location_name,
quantity} entries recording exactly where each unit of an online-order line was
picked from. Needed because a single line can be split across two shelves when
the primary location doesn't have the full quantity; storage_location_snapshot
(a single string) can't represent that, so it now holds a display-only summary
derived from pick_locations while this column carries the real, editable data.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260919_01"
down_revision = "20260918_02"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column("pick_locations", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.alter_column("order_items", "pick_locations", server_default=None)


def downgrade() -> None:
    op.drop_column("order_items", "pick_locations")
