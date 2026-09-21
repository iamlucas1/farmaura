"""customer_profile_nudge_dismissed_at

Adds customers.profile_nudge_dismissed_at — when the customer last answered
"Agora não" (or closed) the "complete your profile" popup. It used to live in the
browser's localStorage, so clearing the browser or switching device brought the
popup straight back; as a column on the customer it survives both, and the
server decides whether the popup is due (14 days after this timestamp, and only
while promotion-relevant profile fields are still missing).

Nullable with no backfill: NULL means "never dismissed", which is exactly what
every existing customer is.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260920_04"
down_revision = "20260920_03"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("profile_nudge_dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customers", "profile_nudge_dismissed_at")
