"""widen_marketplace_image_url

Widen inventory_products.marketplace_image_url from varchar(500) to text.
The Products screen now lets pharmacies upload images as base64 data URLs
(app/schemas/product.py caps MarketplaceImageUrl at 600,000 characters), so
the varchar(500) column truncated every real upload with
StringDataRightTruncation before this fix.
"""

import sqlalchemy as sa
from alembic import op


# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260720_04"
down_revision = "20260720_03"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.alter_column(
        "inventory_products",
        "marketplace_image_url",
        existing_type=sa.String(length=500),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute(
        "UPDATE inventory_products SET marketplace_image_url = '' "
        "WHERE length(marketplace_image_url) > 500"
    )
    op.alter_column(
        "inventory_products",
        "marketplace_image_url",
        existing_type=sa.Text(),
        type_=sa.String(length=500),
        existing_nullable=False,
    )
