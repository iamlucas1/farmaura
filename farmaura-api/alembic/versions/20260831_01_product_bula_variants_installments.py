"""product_bula_variants_installments

Add bula_markdown (package-insert Markdown), marketing_highlights (short topic
bullets), variant_group_id, and variant_label to inventory_products — the
product-detail-page redesign that lets a customer pick between dosage/size
variants of one product and read a real package insert, per product.

installment_overrides (per-product / per-minimum-value installment-count rules)
needed no schema change — it rides inside the existing marketplace-meta JSON
blob already stored under portal_settings (SETTING_KEY_MARKETPLACE_META).
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260831_01"
down_revision = "20260830_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "inventory_products",
        sa.Column("bula_markdown", sa.Text(), server_default="", nullable=False),
    )
    op.add_column(
        "inventory_products",
        sa.Column("marketing_highlights", sa.JSON(), server_default="[]", nullable=False),
    )
    op.add_column(
        "inventory_products",
        sa.Column("variant_group_id", sa.String(length=36), nullable=True),
    )
    op.add_column(
        "inventory_products",
        sa.Column("variant_label", sa.String(length=60), server_default="", nullable=False),
    )
    op.create_index(
        op.f("ix_inventory_products_variant_group_id"),
        "inventory_products",
        ["variant_group_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_inventory_products_variant_group_id"), table_name="inventory_products")
    op.drop_column("inventory_products", "variant_label")
    op.drop_column("inventory_products", "variant_group_id")
    op.drop_column("inventory_products", "marketing_highlights")
    op.drop_column("inventory_products", "bula_markdown")
