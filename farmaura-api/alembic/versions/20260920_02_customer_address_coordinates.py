"""customer_address_coordinates

Adds customer_addresses.latitude/longitude — the exact location the customer
confirmed on the marketplace map picker, kept alongside the typed address
fields rather than replacing them. Nullable: a customer who never opened the
map picker (or an address created before this feature) has no confirmed pin,
which is a different thing from a pin confirmed at (0,0) — so there is no
backfill value and no default.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260920_02"
down_revision = "20260920_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column("customer_addresses", sa.Column("latitude", sa.Numeric(10, 7), nullable=True))
    op.add_column("customer_addresses", sa.Column("longitude", sa.Numeric(10, 7), nullable=True))


def downgrade() -> None:
    op.drop_column("customer_addresses", "longitude")
    op.drop_column("customer_addresses", "latitude")
