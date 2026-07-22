"""add_invoice_tax_cost_icms_st

Add tax_cost_amount and is_subject_to_icms_st to inventory_invoice_records (the acquisition-cost
history), and is_subject_to_icms_st to inventory_items (the currently-applied value) — both
nullable so the Precificador can override the CNAE-level ICMS-ST default per product/purchase
instead of always inheriting the tenant-wide CNAE setting.
"""

import sqlalchemy as sa
from alembic import op


# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260720_05"
down_revision = "20260720_04"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "inventory_invoice_records",
        sa.Column("tax_cost_amount", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "inventory_invoice_records",
        sa.Column("is_subject_to_icms_st", sa.Boolean(), nullable=True),
    )
    op.create_check_constraint(
        "inventory_invoice_records_tax_cost_non_negative",
        "inventory_invoice_records",
        "tax_cost_amount IS NULL OR tax_cost_amount >= 0",
    )
    op.add_column(
        "inventory_items",
        sa.Column("is_subject_to_icms_st", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inventory_items", "is_subject_to_icms_st")
    op.drop_constraint("inventory_invoice_records_tax_cost_non_negative", "inventory_invoice_records", type_="check")
    op.drop_column("inventory_invoice_records", "is_subject_to_icms_st")
    op.drop_column("inventory_invoice_records", "tax_cost_amount")
