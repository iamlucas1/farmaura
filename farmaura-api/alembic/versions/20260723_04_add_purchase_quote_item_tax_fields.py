"""add_purchase_quote_item_tax_fields

Add purchase_quote_items.ncm_code/ipi_percentage/icms_st_value/final_unit_price
(all optional) — fiscal metadata some supplier price lists include (fiscal
classification code, IPI rate, ICMS-ST amount, tax-inclusive unit price).
Purely additive/informational; unit_price stays the base price used elsewhere
in the module.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260723_04"
down_revision = "20260723_03"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "purchase_quote_items",
        sa.Column("ncm_code", sa.String(length=16), nullable=False, server_default=""),
    )
    op.alter_column("purchase_quote_items", "ncm_code", server_default=None)
    op.add_column(
        "purchase_quote_items",
        sa.Column("ipi_percentage", sa.Numeric(precision=6, scale=3), nullable=True),
    )
    op.add_column(
        "purchase_quote_items",
        sa.Column("icms_st_value", sa.Numeric(precision=12, scale=2), nullable=True),
    )
    op.add_column(
        "purchase_quote_items",
        sa.Column("final_unit_price", sa.Numeric(precision=12, scale=2), nullable=True),
    )
    op.create_check_constraint(
        "purchase_quote_items_ipi_percentage_non_negative",
        "purchase_quote_items",
        "ipi_percentage IS NULL OR ipi_percentage >= 0",
    )
    op.create_check_constraint(
        "purchase_quote_items_icms_st_value_non_negative",
        "purchase_quote_items",
        "icms_st_value IS NULL OR icms_st_value >= 0",
    )
    op.create_check_constraint(
        "purchase_quote_items_final_unit_price_non_negative",
        "purchase_quote_items",
        "final_unit_price IS NULL OR final_unit_price >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "purchase_quote_items_final_unit_price_non_negative",
        "purchase_quote_items",
        type_="check",
    )
    op.drop_constraint(
        "purchase_quote_items_icms_st_value_non_negative",
        "purchase_quote_items",
        type_="check",
    )
    op.drop_constraint(
        "purchase_quote_items_ipi_percentage_non_negative",
        "purchase_quote_items",
        type_="check",
    )
    op.drop_column("purchase_quote_items", "final_unit_price")
    op.drop_column("purchase_quote_items", "icms_st_value")
    op.drop_column("purchase_quote_items", "ipi_percentage")
    op.drop_column("purchase_quote_items", "ncm_code")
