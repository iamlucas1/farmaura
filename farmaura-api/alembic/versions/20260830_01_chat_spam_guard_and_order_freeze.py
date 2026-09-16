"""chat_spam_guard_and_order_freeze

Add per-customer chat spam-guard state (chat_flagged_spam, chat_violation_count,
chat_blocked_until, chat_permanently_blocked on customers) backing the escalating
rate-limit/block engine in app.core.chat_guard, plus chat_threads.closed_reason so
an order-linked thread that auto-freezes when its order is delivered/picked up can
show the customer why.

Also add chat_unblock_requests, the customer-appeal queue a pharmacist reviews to
accept or deny lifting a block (separate from the pharmacist's own direct-override
unblock action, which just clears the customers columns above with no request row).
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260830_01"
down_revision = "20260731_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("chat_flagged_spam", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "customers",
        sa.Column("chat_violation_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "customers",
        sa.Column("chat_blocked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "customers",
        sa.Column("chat_permanently_blocked", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "chat_threads",
        sa.Column("closed_reason", sa.String(length=40), server_default="", nullable=False),
    )
    op.create_table(
        "chat_unblock_requests",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("customer_message", sa.Text(), server_default="", nullable=False),
        sa.Column("violation_count_snapshot", sa.Integer(), server_default="0", nullable=False),
        sa.Column("permanently_blocked_snapshot", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("decided_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pharmacist_notes", sa.Text(), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], name=op.f("fk_chat_unblock_requests_customer_id_customers"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["thread_id"], ["chat_threads.id"], name=op.f("fk_chat_unblock_requests_thread_id_chat_threads"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"], name=op.f("fk_chat_unblock_requests_decided_by_user_id_users"), ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_chat_unblock_requests_tenant_id"), "chat_unblock_requests", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_chat_unblock_requests_customer_id"), "chat_unblock_requests", ["customer_id"], unique=False)
    op.create_index(op.f("ix_chat_unblock_requests_thread_id"), "chat_unblock_requests", ["thread_id"], unique=False)
    op.create_index(op.f("ix_chat_unblock_requests_decided_by_user_id"), "chat_unblock_requests", ["decided_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_chat_unblock_requests_decided_by_user_id"), table_name="chat_unblock_requests")
    op.drop_index(op.f("ix_chat_unblock_requests_thread_id"), table_name="chat_unblock_requests")
    op.drop_index(op.f("ix_chat_unblock_requests_customer_id"), table_name="chat_unblock_requests")
    op.drop_index(op.f("ix_chat_unblock_requests_tenant_id"), table_name="chat_unblock_requests")
    op.drop_table("chat_unblock_requests")
    op.drop_column("chat_threads", "closed_reason")
    op.drop_column("customers", "chat_permanently_blocked")
    op.drop_column("customers", "chat_blocked_until")
    op.drop_column("customers", "chat_violation_count")
    op.drop_column("customers", "chat_flagged_spam")
