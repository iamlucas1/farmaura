"""subscription_pending_card

Adds subscriptions.next_charge_due_at (real, computable due date for the first
charge), cancel_reason (short machine-readable reason for a persisted "cancelled"
status), and card_reminder_last_threshold_days (idempotency guard for the card
reminder scheduler) — support for confirming a recurrence in the PDV without a
saved card yet: the subscription is scheduled as "pending_card", the customer
gets reminder e-mails, and it either charges or auto-cancels on the due date.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260916_01"
down_revision = "20260915_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("next_charge_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "subscriptions",
        sa.Column("cancel_reason", sa.String(length=64), nullable=False, server_default=""),
    )
    op.alter_column("subscriptions", "cancel_reason", server_default=None)
    op.add_column(
        "subscriptions",
        sa.Column("card_reminder_last_threshold_days", sa.Integer(), nullable=False, server_default="-1"),
    )
    op.alter_column("subscriptions", "card_reminder_last_threshold_days", server_default=None)


def downgrade() -> None:
    op.drop_column("subscriptions", "card_reminder_last_threshold_days")
    op.drop_column("subscriptions", "cancel_reason")
    op.drop_column("subscriptions", "next_charge_due_at")
