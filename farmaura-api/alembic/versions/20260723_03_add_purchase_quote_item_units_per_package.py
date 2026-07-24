"""add_purchase_quote_item_units_per_package

Add purchase_quote_items.units_per_package (nullable) — how many sellable
units a quoted package-like unit (caixa, fardo, pacote, etc.) contains, when
the supplier states it. Purely additive metadata; purchase receiving uses it
to convert a quoted package quantity into a sellable-unit stock quantity when
present, and falls back to prior behavior when it isn't.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260723_03"
down_revision = "20260723_02"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "purchase_quote_items",
        sa.Column("units_per_package", sa.Numeric(precision=12, scale=3), nullable=True),
    )
    op.create_check_constraint(
        "purchase_quote_items_units_per_package_positive",
        "purchase_quote_items",
        "units_per_package IS NULL OR units_per_package > 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "purchase_quote_items_units_per_package_positive",
        "purchase_quote_items",
        type_="check",
    )
    op.drop_column("purchase_quote_items", "units_per_package")
