"""product_view_events

Adds product_view_events — logs one marketplace product-detail page view by an
identified customer, feeding a browsing-interest signal into the PDV upsell
engine (PurchaseHistoryService.get_cart_upsell_suggestions) alongside real
purchases, favorites, and back-in-stock requests.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260916_02"
down_revision = "20260916_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.create_table(
        "product_view_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("customer_id", sa.String(length=36), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "inventory_product_id",
            sa.String(length=36),
            sa.ForeignKey("inventory_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_product_view_events_tenant_id", "product_view_events", ["tenant_id"])
    op.create_index("ix_product_view_events_customer_id", "product_view_events", ["customer_id"])
    op.create_index("ix_product_view_events_inventory_product_id", "product_view_events", ["inventory_product_id"])


def downgrade() -> None:
    op.drop_table("product_view_events")
