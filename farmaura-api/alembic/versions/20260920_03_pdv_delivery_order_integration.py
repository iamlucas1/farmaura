"""pdv_delivery_order_integration

A PDV ("Balcão") sale with "Entregar em casa" used to become a `PdvSale` row only —
terminal (`sale_status = "completed"`) the instant it was paid, and a
`DeliveryRouteStop` was attached directly at that moment. Neither the "Pedidos
online" board nor route planning can ever see a stop keyed by `pdv_sale_id`
(both only look at `orders`), so that stop was invisible to the whole
operational pipeline. This migration adds what's needed to also create a real
`Order`/`OrderFulfillment` for a PDV delivery sale, so it goes through the same
new → separating → ready → dispatched lifecycle an online order does:

- `orders.originating_pdv_sale_id` — traceability link back to the PDV sale
  that created it (nullable: only set for PDV-originated delivery orders).
- `order_fulfillments.requested_delivery_time_label` and
  `pdv_orders.requested_delivery_time_label` — a free-text customer-requested
  delivery time, new on both the marketplace checkout and PDV delivery flows.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260920_03"
down_revision = "20260920_02"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "originating_pdv_sale_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("pdv_sales.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_orders_originating_pdv_sale_id", "orders", ["originating_pdv_sale_id"])
    op.add_column(
        "order_fulfillments",
        sa.Column("requested_delivery_time_label", sa.String(length=80), nullable=False, server_default=""),
    )
    op.alter_column("order_fulfillments", "requested_delivery_time_label", server_default=None)
    op.add_column(
        "pdv_orders",
        sa.Column("requested_delivery_time_label", sa.String(length=80), nullable=False, server_default=""),
    )
    op.alter_column("pdv_orders", "requested_delivery_time_label", server_default=None)


def downgrade() -> None:
    op.drop_column("pdv_orders", "requested_delivery_time_label")
    op.drop_column("order_fulfillments", "requested_delivery_time_label")
    op.drop_index("ix_orders_originating_pdv_sale_id", table_name="orders")
    op.drop_column("orders", "originating_pdv_sale_id")
