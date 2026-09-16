"""coupon_anniversary_personal

Lets coupon_campaigns hold personal, single-customer coupons — the birthday / customer-
anniversary claims a customer generates for themselves (CustomerService.claim_anniversary_offer)
reuse the existing coupon redemption engine instead of a parallel discount mechanism.

target_customer_id locks a campaign to one customer (enforced in CouponService.resolve_coupon);
(tenant_id, target_customer_id, anniversary_kind, anniversary_year) is unique so a customer can't
claim the same kind twice in the same year. Regular admin campaigns leave all three columns
NULL/"" and never collide, since Postgres treats every NULL as distinct for uniqueness.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260905_02"
down_revision = "20260905_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column("coupon_campaigns", sa.Column("target_customer_id", sa.String(length=36), nullable=True))
    op.add_column("coupon_campaigns", sa.Column("anniversary_kind", sa.String(length=24), nullable=False, server_default=""))
    op.alter_column("coupon_campaigns", "anniversary_kind", server_default=None)
    op.add_column("coupon_campaigns", sa.Column("anniversary_year", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_coupon_campaigns_target_customer_id"),
        "coupon_campaigns",
        ["target_customer_id"],
    )
    op.create_unique_constraint(
        "uq_coupon_campaigns_customer_anniversary_claim",
        "coupon_campaigns",
        ["tenant_id", "target_customer_id", "anniversary_kind", "anniversary_year"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_coupon_campaigns_customer_anniversary_claim", "coupon_campaigns", type_="unique")
    op.drop_index(op.f("ix_coupon_campaigns_target_customer_id"), table_name="coupon_campaigns")
    op.drop_column("coupon_campaigns", "anniversary_year")
    op.drop_column("coupon_campaigns", "anniversary_kind")
    op.drop_column("coupon_campaigns", "target_customer_id")
