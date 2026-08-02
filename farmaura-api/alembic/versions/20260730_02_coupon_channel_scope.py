"""coupon_channel_scope

Add coupon_campaigns.channel_scope so a campaign can be restricted to only the
online marketplace or only the PDV balcão, instead of always redeemable on both
channels now that PDV supports coupons too (see 20260730_01_pdv_coupon_support).
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260730_02"
down_revision = "20260730_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "coupon_campaigns",
        sa.Column("channel_scope", sa.String(length=16), server_default="all", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_coupon_campaigns_coupon_campaigns_channel_scope_valid"),
        "coupon_campaigns",
        "channel_scope IN ('all', 'online', 'pdv')",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_coupon_campaigns_coupon_campaigns_channel_scope_valid"), "coupon_campaigns", type_="check"
    )
    op.drop_column("coupon_campaigns", "channel_scope")
