"""subscription_provider_id

Adds subscriptions.provider_subscription_id (Asaas "sub_..." id) — links a Farmaura
Subscription row to the real recurring subscription created on Asaas's side, which is
what actually generates and charges a new payment every cycle from now on (see
PaymentService.charge_recurring_subscription). Empty for subscriptions created before
this linkage existed.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260915_01"
down_revision = "20260914_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("provider_subscription_id", sa.String(length=64), nullable=False, server_default=""),
    )
    op.alter_column("subscriptions", "provider_subscription_id", server_default=None)


def downgrade() -> None:
    op.drop_column("subscriptions", "provider_subscription_id")
