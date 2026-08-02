"""pdv_coupon_support

Add pdv_orders.coupon_code and pdv_sales.coupon_code so the balcão sale flow can
redeem the same CouponCampaign rows the marketplace checkout already uses,
mirroring orders.coupon_code (see 20260729_01_coupon_checkout_integrity).
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260730_01"
down_revision = "20260729_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "pdv_orders",
        sa.Column("coupon_code", sa.String(length=24), server_default="", nullable=False),
    )
    op.add_column(
        "pdv_sales",
        sa.Column("coupon_code", sa.String(length=24), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("pdv_sales", "coupon_code")
    op.drop_column("pdv_orders", "coupon_code")
