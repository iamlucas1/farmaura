"""add_purchase_quote_item_brand_id

Add purchase_quote_items.brand_id (optional FK -> brands.id, ondelete SET NULL)
alongside the existing brand_name string column, which stays as the
free-text/AI-extracted snapshot. Mirrors how purchase_quotes.supplier_id
already links to suppliers while supplier_name_snapshot is kept for display.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260727_01"
down_revision = "20260723_04"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "purchase_quote_items",
        sa.Column("brand_id", sa.UUID(as_uuid=False), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_purchase_quote_items_brand_id_brands"),
        "purchase_quote_items",
        "brands",
        ["brand_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_purchase_quote_items_brand_id"),
        "purchase_quote_items",
        ["brand_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_purchase_quote_items_brand_id"), table_name="purchase_quote_items")
    op.drop_constraint(
        op.f("fk_purchase_quote_items_brand_id_brands"),
        "purchase_quote_items",
        type_="foreignkey",
    )
    op.drop_column("purchase_quote_items", "brand_id")
