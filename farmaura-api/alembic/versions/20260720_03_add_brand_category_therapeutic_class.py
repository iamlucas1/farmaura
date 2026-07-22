"""add_brand_category_therapeutic_class

Separate product configuration from stock: introduce Brand, Category, and
TherapeuticClass as first-class tenant-scoped catalogs (Brand also links to
Supplier through brand_suppliers), move SKU onto inventory_products (shared
across stores instead of drifting per inventory_items row), and replace the
free-text brand_name/category_name/medication_class_name columns on
inventory_products with FKs to the new catalogs.
"""

from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# Every id/FK column in this migration uses postgresql.UUID (not sa.String) to match
# UuidModel's actual Postgres column type (app/models/base.py uses
# UUID(as_uuid=False), a native uuid column, not varchar) — the tables these new
# tables reference (suppliers, inventory_products) are real uuid columns, so a
# varchar id here would make every cross-table foreign key fail with a type
# mismatch at DDL time.
UUID_TYPE = postgresql.UUID(as_uuid=False)


# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260720_03"
down_revision = "20260720_02"
branch_labels = None
depends_on = None


# ============================================================================
# SHADOW TABLES (typed, migration-local — decoupled from the ORM models)
# ============================================================================


def _inventory_products_table() -> sa.Table:
    return sa.table(
        "inventory_products",
        sa.column("id", UUID_TYPE),
        sa.column("tenant_id", sa.String),
        sa.column("name", sa.String),
        sa.column("sku", sa.String),
        sa.column("brand_name", sa.String),
        sa.column("category_name", sa.String),
        sa.column("medication_class_name", sa.String),
        sa.column("brand_id", UUID_TYPE),
        sa.column("category_id", UUID_TYPE),
        sa.column("therapeutic_class_id", UUID_TYPE),
    )


def _inventory_items_table() -> sa.Table:
    return sa.table(
        "inventory_items",
        sa.column("id", UUID_TYPE),
        sa.column("product_id", UUID_TYPE),
        sa.column("sku", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )


def _brands_table() -> sa.Table:
    return sa.table(
        "brands",
        sa.column("id", UUID_TYPE),
        sa.column("tenant_id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("logo_url", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )


def _categories_table() -> sa.Table:
    return sa.table(
        "categories",
        sa.column("id", UUID_TYPE),
        sa.column("tenant_id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )


def _therapeutic_classes_table() -> sa.Table:
    return sa.table(
        "therapeutic_classes",
        sa.column("id", UUID_TYPE),
        sa.column("tenant_id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )


# ============================================================================
# MIGRATION OPERATIONS
# ============================================================================


def upgrade() -> None:
    """Create Brand/Category/TherapeuticClass, backfill them, and move SKU to products."""

    bind = op.get_bind()
    existing_tables = set(inspect(bind).get_table_names())

    if "brands" not in existing_tables:
        op.create_table(
            "brands",
            sa.Column("id", UUID_TYPE, primary_key=True),
            sa.Column("tenant_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("logo_url", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_brands_tenant_id", "brands", ["tenant_id"])
        op.create_unique_constraint("uq_brands_tenant_name", "brands", ["tenant_id", "name"])

    if "brand_suppliers" not in existing_tables:
        op.create_table(
            "brand_suppliers",
            sa.Column("id", UUID_TYPE, primary_key=True),
            sa.Column("tenant_id", sa.String(length=36), nullable=False),
            sa.Column("brand_id", UUID_TYPE, nullable=False),
            sa.Column("supplier_id", UUID_TYPE, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_brand_suppliers_tenant_id", "brand_suppliers", ["tenant_id"])
        op.create_index("ix_brand_suppliers_brand_id", "brand_suppliers", ["brand_id"])
        op.create_index("ix_brand_suppliers_supplier_id", "brand_suppliers", ["supplier_id"])
        op.create_unique_constraint(
            "uq_brand_suppliers_brand_supplier", "brand_suppliers", ["brand_id", "supplier_id"],
        )
        op.create_foreign_key(
            "fk_brand_suppliers_brand_id_brands", "brand_suppliers", "brands", ["brand_id"], ["id"], ondelete="CASCADE",
        )
        op.create_foreign_key(
            "fk_brand_suppliers_supplier_id_suppliers", "brand_suppliers", "suppliers", ["supplier_id"], ["id"], ondelete="CASCADE",
        )

    if "categories" not in existing_tables:
        op.create_table(
            "categories",
            sa.Column("id", UUID_TYPE, primary_key=True),
            sa.Column("tenant_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_categories_tenant_id", "categories", ["tenant_id"])
        op.create_unique_constraint("uq_categories_tenant_name", "categories", ["tenant_id", "name"])

    if "therapeutic_classes" not in existing_tables:
        op.create_table(
            "therapeutic_classes",
            sa.Column("id", UUID_TYPE, primary_key=True),
            sa.Column("tenant_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_therapeutic_classes_tenant_id", "therapeutic_classes", ["tenant_id"])
        op.create_unique_constraint("uq_therapeutic_classes_tenant_name", "therapeutic_classes", ["tenant_id", "name"])

    product_columns = {column["name"] for column in inspect(bind).get_columns("inventory_products")}
    if "sku" not in product_columns:
        op.add_column("inventory_products", sa.Column("sku", sa.String(length=64), nullable=True))
    if "brand_id" not in product_columns:
        op.add_column("inventory_products", sa.Column("brand_id", UUID_TYPE, nullable=True))
    if "category_id" not in product_columns:
        op.add_column("inventory_products", sa.Column("category_id", UUID_TYPE, nullable=True))
    if "therapeutic_class_id" not in product_columns:
        op.add_column("inventory_products", sa.Column("therapeutic_class_id", UUID_TYPE, nullable=True))
    if "is_active" not in product_columns:
        op.add_column("inventory_products", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"))

    if "brand_name" in product_columns:
        _backfill_catalogs_and_sku(bind)

    op.create_foreign_key(
        "fk_inventory_products_brand_id_brands", "inventory_products", "brands", ["brand_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_inventory_products_category_id_categories", "inventory_products", "categories", ["category_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_inventory_products_therapeutic_class_id_therapeutic_classes",
        "inventory_products", "therapeutic_classes", ["therapeutic_class_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_inventory_products_brand_id", "inventory_products", ["brand_id"])
    op.create_index("ix_inventory_products_category_id", "inventory_products", ["category_id"])
    op.create_index("ix_inventory_products_therapeutic_class_id", "inventory_products", ["therapeutic_class_id"])

    op.alter_column("inventory_products", "sku", nullable=False)
    op.create_unique_constraint("uq_inventory_products_tenant_sku", "inventory_products", ["tenant_id", "sku"])

    for column in ("brand_name", "category_name", "medication_class_name"):
        if column in product_columns:
            op.drop_column("inventory_products", column)

    item_columns = {column["name"] for column in inspect(bind).get_columns("inventory_items")}
    if "sku" in item_columns:
        op.drop_column("inventory_items", "sku")


def _generate_sku(name: str) -> str:
    """Mirror InventoryService._generate_sku so backfilled SKUs read the same way."""

    cleaned = "".join(character if character.isalnum() else "-" for character in (name or "").upper())
    compact = "-".join(segment for segment in cleaned.split("-") if segment)
    return "INV-" + compact[:36] + "-" + uuid4().hex[:6].upper()


def _backfill_catalogs_and_sku(bind) -> None:
    """Create Brand/Category/TherapeuticClass rows from existing free text and move SKU to products."""

    products = _inventory_products_table()
    items = _inventory_items_table()
    brands = _brands_table()
    categories = _categories_table()
    therapeutic_classes = _therapeutic_classes_table()
    now = datetime.now(tz=UTC)

    product_rows = bind.execute(
        sa.select(
            products.c.id, products.c.tenant_id, products.c.name, products.c.brand_name,
            products.c.category_name, products.c.medication_class_name,
        )
    ).all()

    item_rows = bind.execute(
        sa.select(items.c.product_id, items.c.sku, items.c.created_at)
        .where(items.c.sku.is_not(None))
        .order_by(items.c.created_at.asc())
    ).all()
    first_item_sku_by_product: dict[str, str] = {}
    for row in item_rows:
        if row.sku and row.product_id not in first_item_sku_by_product:
            first_item_sku_by_product[row.product_id] = row.sku

    brand_id_by_key: dict[tuple[str, str], str] = {}
    category_id_by_key: dict[tuple[str, str], str] = {}
    therapeutic_class_id_by_key: dict[tuple[str, str], str] = {}

    def _resolve(cache: dict[tuple[str, str], str], table: sa.Table, tenant_id: str, name: str) -> str | None:
        cleaned = (name or "").strip()
        if not cleaned:
            return None
        key = (tenant_id, cleaned)
        if key in cache:
            return cache[key]
        new_id = str(uuid4())
        bind.execute(
            table.insert().values(
                id=new_id, tenant_id=tenant_id, name=cleaned, description="", is_active=True,
                created_at=now, updated_at=now,
            )
        )
        cache[key] = new_id
        return new_id

    used_skus: set[str] = set()
    for row in product_rows:
        brand_id = _resolve(brand_id_by_key, brands, row.tenant_id, row.brand_name)
        category_id = _resolve(category_id_by_key, categories, row.tenant_id, row.category_name)
        therapeutic_class_id = _resolve(
            therapeutic_class_id_by_key, therapeutic_classes, row.tenant_id, row.medication_class_name,
        )
        sku = first_item_sku_by_product.get(row.id, "").strip()
        while not sku or sku in used_skus:
            sku = _generate_sku(row.name)
        used_skus.add(sku)
        bind.execute(
            products.update().where(products.c.id == row.id).values(
                sku=sku, brand_id=brand_id, category_id=category_id, therapeutic_class_id=therapeutic_class_id,
            )
        )


def downgrade() -> None:
    """Restore per-item SKU and the free-text product columns, then drop the new catalogs."""

    bind = op.get_bind()
    item_columns = {column["name"] for column in inspect(bind).get_columns("inventory_items")}
    product_columns = {column["name"] for column in inspect(bind).get_columns("inventory_products")}

    if "sku" not in item_columns:
        op.add_column("inventory_items", sa.Column("sku", sa.String(length=64), nullable=True))
        op.execute(
            """
            UPDATE inventory_items
            SET sku = product.sku
            FROM inventory_products AS product
            WHERE product.id = inventory_items.product_id
            """
        )
        op.alter_column("inventory_items", "sku", nullable=False)
        op.create_index("ix_inventory_items_sku", "inventory_items", ["sku"])

    if "brand_name" not in product_columns:
        op.add_column("inventory_products", sa.Column("brand_name", sa.String(length=255), nullable=False, server_default=""))
        op.add_column("inventory_products", sa.Column("category_name", sa.String(length=120), nullable=False, server_default="Medicamentos"))
        op.add_column("inventory_products", sa.Column("medication_class_name", sa.String(length=120), nullable=False, server_default="Geral"))
        op.execute(
            """
            UPDATE inventory_products AS product
            SET brand_name = COALESCE(brand.name, ''),
                category_name = COALESCE(category.name, 'Medicamentos'),
                medication_class_name = COALESCE(therapeutic_class.name, 'Geral')
            FROM (SELECT id, brand_id, category_id, therapeutic_class_id FROM inventory_products) AS src
            LEFT JOIN brands AS brand ON brand.id = src.brand_id
            LEFT JOIN categories AS category ON category.id = src.category_id
            LEFT JOIN therapeutic_classes AS therapeutic_class ON therapeutic_class.id = src.therapeutic_class_id
            WHERE product.id = src.id
            """
        )

    op.drop_constraint("uq_inventory_products_tenant_sku", "inventory_products", type_="unique")
    op.drop_index("ix_inventory_products_therapeutic_class_id", table_name="inventory_products")
    op.drop_index("ix_inventory_products_category_id", table_name="inventory_products")
    op.drop_index("ix_inventory_products_brand_id", table_name="inventory_products")
    op.drop_constraint("fk_inventory_products_therapeutic_class_id_therapeutic_classes", "inventory_products", type_="foreignkey")
    op.drop_constraint("fk_inventory_products_category_id_categories", "inventory_products", type_="foreignkey")
    op.drop_constraint("fk_inventory_products_brand_id_brands", "inventory_products", type_="foreignkey")
    op.drop_column("inventory_products", "is_active")
    op.drop_column("inventory_products", "therapeutic_class_id")
    op.drop_column("inventory_products", "category_id")
    op.drop_column("inventory_products", "brand_id")
    op.drop_column("inventory_products", "sku")

    if "therapeutic_classes" in set(inspect(bind).get_table_names()):
        op.drop_table("therapeutic_classes")
    if "categories" in set(inspect(bind).get_table_names()):
        op.drop_table("categories")
    if "brand_suppliers" in set(inspect(bind).get_table_names()):
        op.drop_table("brand_suppliers")
    if "brands" in set(inspect(bind).get_table_names()):
        op.drop_table("brands")
