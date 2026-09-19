"""prescription_item_validated_quantity

Adds prescription_items.validated_quantity — the exact unit count the
pharmacist validated a PDV prescription for, so PdvService's queue-order gate
can reject sending an order to the cashier if the cart quantity for that
controlled item was bumped past what was actually validated. Null for
prescriptions created outside the PDV flow.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260918_02"
down_revision = "20260918_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "prescription_items",
        sa.Column("validated_quantity", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prescription_items", "validated_quantity")
