"""promotion_kind_drop_item_promo

Add pricing_promotions.kind (campaign vs. product_discount — see the ADR for this
session) and drop inventory_items.promotional_discount_percent: manual per-item
discount is retired, every discount now lives in PricingPromotion.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260730_04"
down_revision = "20260730_03"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "pricing_promotions",
        sa.Column("kind", sa.String(length=24), server_default="campaign", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_pricing_promotions_pricing_promotions_kind_valid"),
        "pricing_promotions",
        "kind IN ('campaign', 'product_discount')",
    )
    op.drop_constraint(op.f("ck_inventory_items_inventory_items_promo_non_negative"), "inventory_items", type_="check")
    op.drop_constraint(op.f("ck_inventory_items_inventory_items_promo_max_100"), "inventory_items", type_="check")
    op.drop_column("inventory_items", "promotional_discount_percent")


def downgrade() -> None:
    op.add_column(
        "inventory_items",
        sa.Column("promotional_discount_percent", sa.Numeric(5, 2), server_default="0.00", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_inventory_items_inventory_items_promo_non_negative"), "inventory_items", "promotional_discount_percent >= 0",
    )
    op.create_check_constraint(
        op.f("ck_inventory_items_inventory_items_promo_max_100"), "inventory_items", "promotional_discount_percent <= 100",
    )
    op.drop_constraint(op.f("ck_pricing_promotions_pricing_promotions_kind_valid"), "pricing_promotions", type_="check")
    op.drop_column("pricing_promotions", "kind")
