"""add_purchase_quotes

Add the Orçamentos (purchase quote) tables: purchase_quotes (header),
purchase_quote_items (quoted product lines, product_id is an optional
cross-reference only — never mutates the sellable catalog), and
purchase_quote_payment_terms (pix/boleto/cartão/etc. offered per quote).
Row-level security for these tables is applied separately and idempotently
by app/core/row_level_security.py on every boot, independent of this
migration.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260723_02"
down_revision = "20260723_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.create_table(
        "purchase_quotes",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("supplier_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("supplier_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("supplier_document_snapshot", sa.String(length=18), nullable=False),
        sa.Column("quote_date", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("freight_type", sa.String(length=4), nullable=False),
        sa.Column("freight_cost", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("delivery_time_days", sa.Integer(), nullable=True),
        sa.Column("source_provider", sa.String(length=24), nullable=False),
        sa.Column("source_model", sa.String(length=64), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "freight_type IN ('', 'FOB', 'CIF')",
            name=op.f("ck_purchase_quotes_purchase_quotes_freight_type_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'confirmed', 'archived')",
            name=op.f("ck_purchase_quotes_purchase_quotes_status_valid"),
        ),
        sa.CheckConstraint(
            "delivery_time_days IS NULL OR delivery_time_days >= 0",
            name=op.f("ck_purchase_quotes_purchase_quotes_delivery_time_non_negative"),
        ),
        sa.CheckConstraint(
            "freight_cost IS NULL OR freight_cost >= 0",
            name=op.f("ck_purchase_quotes_purchase_quotes_freight_cost_non_negative"),
        ),
        sa.CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0",
            name=op.f("ck_purchase_quotes_purchase_quotes_size_bytes_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_purchase_quotes_created_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name=op.f("fk_purchase_quotes_supplier_id_suppliers"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_quotes")),
    )
    op.create_index(
        op.f("ix_purchase_quotes_created_by_user_id"),
        "purchase_quotes",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_purchase_quotes_supplier_id"), "purchase_quotes", ["supplier_id"], unique=False
    )
    op.create_index(
        op.f("ix_purchase_quotes_tenant_id"), "purchase_quotes", ["tenant_id"], unique=False
    )
    op.create_table(
        "purchase_quote_items",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("quote_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("brand_name", sa.String(length=255), nullable=False),
        sa.Column("sku_snapshot", sa.String(length=64), nullable=False),
        sa.Column("ean_code_snapshot", sa.String(length=32), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("quantity_reference", sa.Numeric(precision=12, scale=3), nullable=True),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("is_comodato", sa.Boolean(), nullable=False),
        sa.Column("comodato_notes", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "quantity_reference IS NULL OR quantity_reference >= 0",
            name=op.f(
                "ck_purchase_quote_items_purchase_quote_items_quantity_reference_non_negative"
            ),
        ),
        sa.CheckConstraint(
            "unit_price >= 0",
            name=op.f("ck_purchase_quote_items_purchase_quote_items_unit_price_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["inventory_products.id"],
            name=op.f("fk_purchase_quote_items_product_id_inventory_products"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["quote_id"],
            ["purchase_quotes.id"],
            name=op.f("fk_purchase_quote_items_quote_id_purchase_quotes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_quote_items")),
    )
    op.create_index(
        op.f("ix_purchase_quote_items_product_id"),
        "purchase_quote_items",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_purchase_quote_items_quote_id"), "purchase_quote_items", ["quote_id"], unique=False
    )
    op.create_index(
        op.f("ix_purchase_quote_items_tenant_id"),
        "purchase_quote_items",
        ["tenant_id"],
        unique=False,
    )
    op.create_table(
        "purchase_quote_payment_terms",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("quote_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("method", sa.String(length=24), nullable=False),
        sa.Column("discount_percent", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("surcharge_percent", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("installment_count", sa.Integer(), nullable=True),
        sa.Column("days_to_pay", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "method IN ('pix', 'boleto_avista', 'boleto_prazo', 'cartao_credito', 'cartao_debito', 'consignado', 'dinheiro', 'transferencia', 'outro')",
            name=op.f("ck_purchase_quote_payment_terms_purchase_quote_payment_terms_method_valid"),
        ),
        sa.CheckConstraint(
            "days_to_pay IS NULL OR days_to_pay >= 0",
            name=op.f(
                "ck_purchase_quote_payment_terms_purchase_quote_payment_terms_days_non_negative"
            ),
        ),
        sa.CheckConstraint(
            "discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)",
            name=op.f(
                "ck_purchase_quote_payment_terms_purchase_quote_payment_terms_discount_range"
            ),
        ),
        sa.CheckConstraint(
            "installment_count IS NULL OR installment_count >= 1",
            name=op.f(
                "ck_purchase_quote_payment_terms_purchase_quote_payment_terms_installments_positive"
            ),
        ),
        sa.CheckConstraint(
            "surcharge_percent IS NULL OR (surcharge_percent >= 0 AND surcharge_percent <= 100)",
            name=op.f(
                "ck_purchase_quote_payment_terms_purchase_quote_payment_terms_surcharge_range"
            ),
        ),
        sa.ForeignKeyConstraint(
            ["quote_id"],
            ["purchase_quotes.id"],
            name=op.f("fk_purchase_quote_payment_terms_quote_id_purchase_quotes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_quote_payment_terms")),
    )
    op.create_index(
        op.f("ix_purchase_quote_payment_terms_quote_id"),
        "purchase_quote_payment_terms",
        ["quote_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_purchase_quote_payment_terms_tenant_id"),
        "purchase_quote_payment_terms",
        ["tenant_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_purchase_quote_payment_terms_tenant_id"), table_name="purchase_quote_payment_terms"
    )
    op.drop_index(
        op.f("ix_purchase_quote_payment_terms_quote_id"), table_name="purchase_quote_payment_terms"
    )
    op.drop_table("purchase_quote_payment_terms")
    op.drop_index(op.f("ix_purchase_quote_items_tenant_id"), table_name="purchase_quote_items")
    op.drop_index(op.f("ix_purchase_quote_items_quote_id"), table_name="purchase_quote_items")
    op.drop_index(op.f("ix_purchase_quote_items_product_id"), table_name="purchase_quote_items")
    op.drop_table("purchase_quote_items")
    op.drop_index(op.f("ix_purchase_quotes_tenant_id"), table_name="purchase_quotes")
    op.drop_index(op.f("ix_purchase_quotes_supplier_id"), table_name="purchase_quotes")
    op.drop_index(op.f("ix_purchase_quotes_created_by_user_id"), table_name="purchase_quotes")
    op.drop_table("purchase_quotes")
