"""customer_children_names

Adds customers.children_names (JSON list of str), parallel by index to the existing
children_birth_years — same slot (index) is the same child. Lets the marketplace profile
form and the internal PDV client card show each child's name alongside their age instead
of just a headcount.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260914_01"
down_revision = "20260905_02"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("children_names", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.alter_column("customers", "children_names", server_default=None)


def downgrade() -> None:
    op.drop_column("customers", "children_names")
