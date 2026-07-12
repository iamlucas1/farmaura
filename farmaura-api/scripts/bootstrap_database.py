"""
farmaura-api/scripts/bootstrap_database.py

Database bootstrap flow for Farmaura containers.

Responsibilities:
- create the current schema directly from ORM metadata on every startup;
- (re)install PostgreSQL row-level security policies on every startup;
- populate deterministic development seed data when the database has no users;

Observations:
- this project is in its development phase and does not use Alembic migrations
  (see the "Development Environment Policy" in claude.md) — schema changes go
  directly into the ORM models and this bootstrap path applies them;
- schema creation and RLS application both run unconditionally on every start;
  ORM metadata create_all and the RLS statements in
  app/core/row_level_security.py are idempotent, so this is safe to repeat
  against an already-initialized database;
- seed execution is restricted to empty operational datasets to avoid overwriting active data;
"""

import asyncio

from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings
from app.core.row_level_security import apply_row_level_security
from app.models import (
    AuditEvent,
    CartItem,
    CashbackRule,
    CashbackTransaction,
    CashbackTransactionLine,
    ChatMessage,
    ChatMessageAttachment,
    ChatThread,
    Customer,
    CustomerAddress,
    CustomerCashbackWallet,
    CustomerPaymentMethod,
    DeliveryRoute,
    DeliveryRouteStop,
    FileAsset,
    FiscalDocument,
    HealthService,
    HealthServiceAppointment,
    InventoryItem,
    InventoryLocation,
    InventoryMovement,
    MarketplaceListing,
    Order,
    OrderFulfillment,
    OrderItem,
    OrderStatusEvent,
    PdvOrder,
    PdvOrderItem,
    PdvSale,
    PdvSaleItem,
    Prescription,
    PrescriptionCheck,
    PrescriptionFile,
    PrescriptionItem,
    Product,
    RefreshToken,
    SavedProduct,
    Subscription,
    User,
)
from app.models.base import Base
from scripts.seed import seed_database


# ============================================================================
# DATABASE INSPECTION
# ============================================================================


def list_table_names() -> list[str]:
    """Return the existing physical tables for the configured database."""

    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    try:
        inspector = inspect(engine)
        return sorted(inspector.get_table_names())
    finally:
        engine.dispose()


def count_rows(table_name: str) -> int:
    """Return the row count for a physical table."""

    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            return int(connection.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one())
    finally:
        engine.dispose()


def initialize_schema() -> None:
    """Create the current schema from ORM metadata and (re)install RLS policies."""

    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    try:
        Base.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            apply_row_level_security(connection)
    finally:
        engine.dispose()


def should_seed_database(table_names: list[str]) -> bool:
    """Return whether the development seed should run for the current database."""

    if "users" not in table_names:
        return True
    return count_rows("users") == 0


def run_seed_database() -> None:
    """Execute the deterministic development seed flow."""

    asyncio.run(seed_database())


# ============================================================================
# BOOTSTRAP
# ============================================================================


def bootstrap_database() -> None:
    """Bring the configured database schema and RLS policies up to date."""

    initialize_schema()

    if should_seed_database(list_table_names()):
        run_seed_database()


if __name__ == "__main__":
    bootstrap_database()
