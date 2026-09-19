"""pdv_sale_terminal_reference

Adds pdv_sales.payment_terminal_reference — the NSU/authCode/chargeId returned
by the Itaú card/PIX terminal (via farmaura-pdv-bridge, the local USB bridge
agent) for pix/debit/credit sales, empty for cash. Used for reconciliation
against the terminal's own settlement report.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260917_01"
down_revision = "20260916_02"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "pdv_sales",
        sa.Column("payment_terminal_reference", sa.String(length=64), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("pdv_sales", "payment_terminal_reference")
