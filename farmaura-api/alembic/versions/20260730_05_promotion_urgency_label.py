"""promotion_urgency_label

Add pricing_promotions.urgency_label — a free-text scarcity/urgency message
(e.g. "Restam só 2 no estoque") the admin can set per promotion, shown on the
marketplace card when that promotion is the one applying to the product.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260730_05"
down_revision = "20260730_04"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "pricing_promotions",
        sa.Column("urgency_label", sa.String(length=60), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("pricing_promotions", "urgency_label")
