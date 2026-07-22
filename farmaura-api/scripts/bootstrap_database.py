"""
farmaura-api/scripts/bootstrap_database.py

Database bootstrap flow for Farmaura containers.

Responsibilities:
- create the current schema directly from ORM metadata on every startup;
- (re)install PostgreSQL row-level security policies on every startup;
- populate deterministic development seed data when the database has no users;
- in production, create only the single real administrator account instead of
  the development seed's fictional dataset (see scripts/production_admin.py);

Observations:
- this project is in its development phase and does not use Alembic migrations
  (see the "Development Environment Policy" in claude.md) — schema changes go
  directly into the ORM models and this bootstrap path applies them;
- schema creation and RLS application both run unconditionally on every start;
  ORM metadata create_all and the RLS statements in
  app/core/row_level_security.py are idempotent, so this is safe to repeat
  against an already-initialized database;
- seed execution is restricted to empty operational datasets to avoid overwriting active data;
- which path runs (fictional seed vs. real admin) is decided by APP_ENV, not by
  a flag — production must never receive scripts/seed.py's demo accounts;
"""

import asyncio

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database_roles import ensure_runtime_role, grant_runtime_privileges
from app.core.row_level_security import apply_row_level_security
from app.models import (
    AuditEvent,
    Brand,
    BrandSupplier,
    CartItem,
    CashbackRule,
    CashbackTransaction,
    CashbackTransactionLine,
    Category,
    ChatMessage,
    ChatMessageAttachment,
    ChatThread,
    Customer,
    CustomerAddress,
    CustomerCashbackWallet,
    CustomerPaymentMethod,
    DeliveryRoute,
    DeliveryRouteStop,
    DriverLocation,
    FileAsset,
    FiscalDocument,
    HealthService,
    HealthServiceAppointment,
    InventoryAuditEntry,
    InventoryItem,
    InventoryLocation,
    InventoryLotMovement,
    InventoryMovement,
    InventoryProduct,
    InventoryStockLot,
    MarketplaceListing,
    Order,
    OrderFulfillment,
    OrderItem,
    OrderStatusEvent,
    PdvDraftSession,
    PdvOrder,
    PdvOrderItem,
    PdvSale,
    PdvSaleItem,
    Prescription,
    PrescriptionCheck,
    PrescriptionFile,
    PrescriptionItem,
    RefreshToken,
    SavedProduct,
    Store,
    Subscription,
    Supplier,
    TherapeuticClass,
    User,
)
from app.models.base import Base
from scripts.production_admin import ensure_production_admin
from scripts.seed import seed_database


# ============================================================================
# DATABASE INSPECTION
# ============================================================================


def list_table_names() -> list[str]:
    """Return the existing physical tables for the configured database.

    Uses the admin connection: table introspection must see the real schema
    regardless of what row-level security would otherwise filter.
    """

    settings = get_settings()
    engine = create_engine(settings.database_bootstrap_url, pool_pre_ping=True)
    try:
        inspector = inspect(engine)
        return sorted(inspector.get_table_names())
    finally:
        engine.dispose()


def count_rows(table_name: str) -> int:
    """Return the row count for a physical table.

    Uses the admin connection so the count reflects every tenant's rows —
    the restricted runtime role would see zero here with no tenant context set,
    which would make should_seed_database() reseed on every restart.
    """

    settings = get_settings()
    engine = create_engine(settings.database_bootstrap_url, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            return int(connection.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one())
    finally:
        engine.dispose()


def initialize_schema() -> None:
    """Create the current schema, (re)install RLS policies, and sync the runtime role.

    Runs entirely over the admin connection: schema DDL, RLS policy
    definitions, and the runtime role's own CREATE ROLE / GRANT statements
    all require privileges the restricted runtime role deliberately lacks.
    """

    settings = get_settings()
    engine = create_engine(settings.database_bootstrap_url, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            ensure_runtime_role(connection, runtime_database_url=settings.database_url)
        Base.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            apply_row_level_security(connection)
            grant_runtime_privileges(connection, runtime_database_url=settings.database_url)
    finally:
        engine.dispose()


def should_seed_database(table_names: list[str]) -> bool:
    """Return whether the development seed should run for the current database."""

    if "users" not in table_names:
        return True
    return count_rows("users") == 0


def run_seed_database() -> None:
    """Execute the deterministic development seed flow over the admin connection.

    Seeding is a system-level operation writing across every tenant with no
    per-request context — the same reason background sweeps use
    apply_system_job_context — so it runs as the admin role rather than the
    restricted runtime role most of whose RLS policies have no such carve-out.
    """

    settings = get_settings()
    admin_engine = create_async_engine(settings.database_bootstrap_url, pool_pre_ping=True)
    admin_session_factory = async_sessionmaker(bind=admin_engine, expire_on_commit=False, class_=AsyncSession)

    async def _run() -> None:
        try:
            await seed_database(session_factory=admin_session_factory)
        finally:
            await admin_engine.dispose()

    asyncio.run(_run())


def run_ensure_production_admin() -> None:
    """Create the single real administrator account over the admin connection.

    Used instead of run_seed_database() in production so the live database
    never receives scripts/seed.py's fictional customers, orders, and demo
    accounts.
    """

    settings = get_settings()
    admin_engine = create_async_engine(settings.database_bootstrap_url, pool_pre_ping=True)
    admin_session_factory = async_sessionmaker(bind=admin_engine, expire_on_commit=False, class_=AsyncSession)

    async def _run() -> None:
        try:
            await ensure_production_admin(session_factory=admin_session_factory)
        finally:
            await admin_engine.dispose()

    asyncio.run(_run())


# ============================================================================
# BOOTSTRAP
# ============================================================================


def bootstrap_database() -> None:
    """Bring the configured database schema and RLS policies up to date."""

    initialize_schema()

    if should_seed_database(list_table_names()):
        if get_settings().environment.lower() == "production":
            run_ensure_production_admin()
        else:
            run_seed_database()


if __name__ == "__main__":
    bootstrap_database()
