"""
farmaura-api/app/core/database.py

Database connectivity for Farmaura.

Responsibilities:
- configure the SQLAlchemy engine and session factory;
- expose request-scoped async sessions;
- keep ORM access explicit and typed;

Observations:
- this scaffold uses SQLAlchemy async sessions;
- models are imported by metadata-aware tooling such as Alembic;
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import (
    AuditEvent,
    CashbackRule,
    CashbackTransaction,
    CashbackTransactionLine,
    CouponCampaign,
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
    PortalSetting,
    Prescription,
    PrescriptionCheck,
    PrescriptionFile,
    PrescriptionItem,
    Product,
    ProductReview,
    RefreshToken,
    SavedProduct,
    Subscription,
    User,
)
from app.models.base import Base


# ============================================================================
# ENGINE AND SESSION FACTORY
# ============================================================================


settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionFactory = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


# ============================================================================
# SESSION ACCESS
# ============================================================================


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a request-scoped async session."""

    async with SessionFactory() as session:
        yield session


async def initialize_database() -> None:
    """Create database tables for local bootstrap flows."""

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
