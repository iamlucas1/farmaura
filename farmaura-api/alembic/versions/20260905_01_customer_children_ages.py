"""customer_children_ages

Adds customers.children_birth_years (JSON list of ints) alongside the existing children_count,
so the marketplace account profile can record each child's birth year instead of just a headcount.

Birth year, not age: an age typed once would go stale the moment the year turns. Every reader
derives the current age from the birth year (current_year - birth_year) instead of trusting a
frozen number entered at some unknown point in the past.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260905_01"
down_revision = "20260903_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("children_birth_years", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.alter_column("customers", "children_birth_years", server_default=None)


def downgrade() -> None:
    op.drop_column("customers", "children_birth_years")
