"""product_short_description

Add short_description to inventory_products — a real, short marketing paragraph
distinct from bula_markdown (full package insert) and marketing_highlights
(short topic bullets). Fills the panel on the product detail page that used to
render the bula inline, now that the bula moved to its own page.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260831_02"
down_revision = "20260831_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "inventory_products",
        sa.Column("short_description", sa.Text(), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("inventory_products", "short_description")
