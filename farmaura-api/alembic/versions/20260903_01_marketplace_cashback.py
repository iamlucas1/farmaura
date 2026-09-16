"""marketplace_cashback

Adds real marketplace cashback: a per-product cashback rate on inventory_products
(null falls back to the tenant-wide default in marketplace meta), and tenant_id on
customer_cashback_wallets / cashback_transaction_lines so both join the generic RLS
mesh (app/core/row_level_security.py) alongside cashback_rules/cashback_transactions —
closing the cross-tenant wallet gap documented in
dev-obsidian/farmaura/04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv.md.

tenant_id is backfilled from the owning customer before being made NOT NULL.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260903_01"
down_revision = "20260831_02"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "inventory_products",
        sa.Column("cashback_percent", sa.Numeric(5, 2), nullable=True),
    )

    op.add_column(
        "customer_cashback_wallets",
        sa.Column("tenant_id", sa.String(length=36), nullable=True),
    )
    op.execute(
        """
        UPDATE customer_cashback_wallets AS w
        SET tenant_id = c.tenant_id
        FROM customers AS c
        WHERE c.id = w.customer_id
        """
    )
    op.alter_column("customer_cashback_wallets", "tenant_id", nullable=False)
    op.create_index(
        op.f("ix_customer_cashback_wallets_tenant_id"),
        "customer_cashback_wallets",
        ["tenant_id"],
    )

    op.add_column(
        "cashback_transaction_lines",
        sa.Column("tenant_id", sa.String(length=36), nullable=True),
    )
    op.execute(
        """
        UPDATE cashback_transaction_lines AS l
        SET tenant_id = c.tenant_id
        FROM customers AS c
        WHERE c.id = l.customer_id
        """
    )
    op.alter_column("cashback_transaction_lines", "tenant_id", nullable=False)
    op.create_index(
        op.f("ix_cashback_transaction_lines_tenant_id"),
        "cashback_transaction_lines",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_cashback_transaction_lines_tenant_id"), table_name="cashback_transaction_lines")
    op.drop_column("cashback_transaction_lines", "tenant_id")
    op.drop_index(op.f("ix_customer_cashback_wallets_tenant_id"), table_name="customer_cashback_wallets")
    op.drop_column("customer_cashback_wallets", "tenant_id")
    op.drop_column("inventory_products", "cashback_percent")
