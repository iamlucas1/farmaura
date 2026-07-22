"""add_inventory_products

Split product identity/classification out of inventory_items into a shared
inventory_products table (one row per tenant+EAN), so the same product no
longer drifts (generic flag, controlled tarja, etc.) between stores.
"""

from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260720_02"
down_revision = "20260720_01"
branch_labels = None
depends_on = None


# ============================================================================
# SHADOW TABLES (typed, migration-local — decoupled from the ORM models)
# ============================================================================


def _inventory_items_table() -> sa.Table:
    return sa.table(
        "inventory_items",
        sa.column("id", sa.String),
        sa.column("tenant_id", sa.String),
        sa.column("product_id", sa.String),
        sa.column("name", sa.String),
        sa.column("brand_name", sa.String),
        sa.column("category_name", sa.String),
        sa.column("medication_class_name", sa.String),
        sa.column("ean_code", sa.String),
        sa.column("is_controlled", sa.Boolean),
        sa.column("controlled_category", sa.String),
        sa.column("is_generic", sa.Boolean),
        sa.column("cnae_code", sa.String),
        sa.column("marketplace_image_url", sa.String),
        sa.column("marketplace_gallery_urls", sa.JSON),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )


def _inventory_products_table() -> sa.Table:
    return sa.table(
        "inventory_products",
        sa.column("id", sa.String),
        sa.column("tenant_id", sa.String),
        sa.column("ean_code", sa.String),
        sa.column("name", sa.String),
        sa.column("brand_name", sa.String),
        sa.column("category_name", sa.String),
        sa.column("medication_class_name", sa.String),
        sa.column("is_controlled", sa.Boolean),
        sa.column("controlled_category", sa.String),
        sa.column("is_generic", sa.Boolean),
        sa.column("cnae_code", sa.String),
        sa.column("marketplace_image_url", sa.String),
        sa.column("marketplace_gallery_urls", sa.JSON),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )


# ============================================================================
# MIGRATION OPERATIONS
# ============================================================================


def upgrade() -> None:
    """Create inventory_products, backfill it from inventory_items, and drop the moved columns."""

    bind = op.get_bind()
    existing_tables = set(inspect(bind).get_table_names())

    if "inventory_products" not in existing_tables:
        op.create_table(
            "inventory_products",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("tenant_id", sa.String(length=36), nullable=False),
            sa.Column("ean_code", sa.String(length=32), nullable=False, server_default=""),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("brand_name", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("category_name", sa.String(length=120), nullable=False, server_default="Medicamentos"),
            sa.Column("medication_class_name", sa.String(length=120), nullable=False, server_default="Geral"),
            sa.Column("is_controlled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("controlled_category", sa.String(length=24), nullable=False, server_default="none"),
            sa.Column("is_generic", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("cnae_code", sa.String(length=20), nullable=False, server_default=""),
            sa.Column("marketplace_image_url", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("marketplace_gallery_urls", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_inventory_products_tenant_id", "inventory_products", ["tenant_id"])
        op.create_index("ix_inventory_products_ean_code", "inventory_products", ["ean_code"])
        op.create_index(
            "uq_inventory_products_tenant_ean",
            "inventory_products",
            ["tenant_id", "ean_code"],
            unique=True,
            postgresql_where=sa.text("ean_code <> ''"),
        )

    item_columns = {column["name"] for column in inspect(bind).get_columns("inventory_items")}
    if "product_id" not in item_columns:
        op.add_column("inventory_items", sa.Column("product_id", sa.String(length=36), nullable=True))

    if "name" in item_columns:
        _backfill_products(bind)

    op.alter_column("inventory_items", "product_id", nullable=False)
    op.create_foreign_key(
        "fk_inventory_items_product_id_inventory_products",
        "inventory_items",
        "inventory_products",
        ["product_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_inventory_items_product_id", "inventory_items", ["product_id"])

    for column in (
        "name", "brand_name", "category_name", "medication_class_name", "ean_code",
        "is_controlled", "controlled_category", "is_generic", "cnae_code",
        "marketplace_image_url", "marketplace_gallery_urls",
    ):
        if column in item_columns:
            op.drop_column("inventory_items", column)


def _backfill_products(bind) -> None:
    """Group existing inventory_items by (tenant_id, ean_code) and create one product per group.

    Items sharing a non-empty EAN within a tenant collapse into a single product, using the
    most recently updated row's values as canonical (existing divergent data — e.g. one store
    marking a medicine generic and another not — is resolved this way). Items without an EAN
    are never merged: each gets its own dedicated product.
    """

    items = _inventory_items_table()
    products = _inventory_products_table()
    rows = bind.execute(
        sa.select(
            items.c.id, items.c.tenant_id, items.c.ean_code, items.c.name, items.c.brand_name,
            items.c.category_name, items.c.medication_class_name, items.c.is_controlled,
            items.c.controlled_category, items.c.is_generic, items.c.cnae_code,
            items.c.marketplace_image_url, items.c.marketplace_gallery_urls, items.c.updated_at,
        ).order_by(items.c.updated_at.desc())
    ).all()

    groups: dict[tuple[str, str], list] = {}
    singles: list = []
    for row in rows:
        ean = (row.ean_code or "").strip()
        if ean:
            groups.setdefault((row.tenant_id, ean), []).append(row)
        else:
            singles.append(row)

    now = datetime.now(tz=UTC)

    def _insert_product(tenant_id: str, ean_code: str, canonical) -> str:
        product_id = str(uuid4())
        bind.execute(
            products.insert().values(
                id=product_id,
                tenant_id=tenant_id,
                ean_code=ean_code,
                name=canonical.name,
                brand_name=canonical.brand_name,
                category_name=canonical.category_name,
                medication_class_name=canonical.medication_class_name,
                is_controlled=canonical.is_controlled,
                controlled_category=canonical.controlled_category,
                is_generic=canonical.is_generic,
                cnae_code=canonical.cnae_code,
                marketplace_image_url=canonical.marketplace_image_url,
                marketplace_gallery_urls=canonical.marketplace_gallery_urls or [],
                created_at=now,
                updated_at=now,
            )
        )
        return product_id

    for (tenant_id, ean_code), group_rows in groups.items():
        canonical = group_rows[0]
        product_id = _insert_product(tenant_id, ean_code, canonical)
        item_ids = [row.id for row in group_rows]
        bind.execute(items.update().where(items.c.id.in_(item_ids)).values(product_id=product_id))

    for row in singles:
        product_id = _insert_product(row.tenant_id, "", row)
        bind.execute(items.update().where(items.c.id == row.id).values(product_id=product_id))


def downgrade() -> None:
    """Restore the per-item product columns and drop inventory_products."""

    bind = op.get_bind()
    item_columns = {column["name"] for column in inspect(bind).get_columns("inventory_items")}

    if "name" not in item_columns:
        op.add_column("inventory_items", sa.Column("name", sa.String(length=255), nullable=True))
        op.add_column("inventory_items", sa.Column("brand_name", sa.String(length=255), nullable=False, server_default=""))
        op.add_column("inventory_items", sa.Column("category_name", sa.String(length=120), nullable=False, server_default="Medicamentos"))
        op.add_column("inventory_items", sa.Column("medication_class_name", sa.String(length=120), nullable=False, server_default="Geral"))
        op.add_column("inventory_items", sa.Column("ean_code", sa.String(length=32), nullable=False, server_default=""))
        op.add_column("inventory_items", sa.Column("is_controlled", sa.Boolean(), nullable=False, server_default="false"))
        op.add_column("inventory_items", sa.Column("controlled_category", sa.String(length=24), nullable=False, server_default="none"))
        op.add_column("inventory_items", sa.Column("is_generic", sa.Boolean(), nullable=False, server_default="false"))
        op.add_column("inventory_items", sa.Column("cnae_code", sa.String(length=20), nullable=False, server_default=""))
        op.add_column("inventory_items", sa.Column("marketplace_image_url", sa.String(length=500), nullable=False, server_default=""))
        op.add_column("inventory_items", sa.Column("marketplace_gallery_urls", sa.JSON(), nullable=True))

        op.execute(
            """
            UPDATE inventory_items
            SET name = product.name,
                brand_name = product.brand_name,
                category_name = product.category_name,
                medication_class_name = product.medication_class_name,
                ean_code = product.ean_code,
                is_controlled = product.is_controlled,
                controlled_category = product.controlled_category,
                is_generic = product.is_generic,
                cnae_code = product.cnae_code,
                marketplace_image_url = product.marketplace_image_url,
                marketplace_gallery_urls = product.marketplace_gallery_urls
            FROM inventory_products AS product
            WHERE product.id = inventory_items.product_id
            """
        )
        op.alter_column("inventory_items", "name", nullable=False)
        op.alter_column("inventory_items", "marketplace_gallery_urls", nullable=False)

    op.drop_index("ix_inventory_items_product_id", table_name="inventory_items")
    op.drop_constraint("fk_inventory_items_product_id_inventory_products", "inventory_items", type_="foreignkey")
    op.drop_column("inventory_items", "product_id")

    if "inventory_products" in set(inspect(bind).get_table_names()):
        op.drop_table("inventory_products")
