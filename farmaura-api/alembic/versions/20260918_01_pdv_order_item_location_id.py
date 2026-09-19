"""pdv_order_item_location_id

Adds pdv_order_items.location_id — the exact storage-location UUID the
pharmacist picked for a cart line (already sent by the frontend at queue
time), previously only kept as a display string (storage_location_snapshot)
with no id, so the cashier's location dropdown never came back pre-selected
after claiming the order from the queue.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260918_01"
down_revision = "20260917_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "pdv_order_items",
        sa.Column("location_id", sa.String(length=36), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("pdv_order_items", "location_id")
