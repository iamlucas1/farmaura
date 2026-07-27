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
    Brand,
    BrandSupplier,
    CashbackRule,
    CashbackTransaction,
    CashbackTransactionLine,
    Category,
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
    InventoryProduct,
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
    PaymentWebhookEvent,
    PortalSetting,
    Prescription,
    PrescriptionCheck,
    PrescriptionFile,
    PrescriptionItem,
    ProductReview,
    PurchaseQuote,
    PurchaseQuoteItem,
    PurchaseQuotePaymentTerm,
    RefreshToken,
    SavedProduct,
    Store,
    Subscription,
    Supplier,
    TherapeuticClass,
    User,
)
from app.models.base import Base


# ============================================================================
# ENGINE AND SESSION FACTORY
# ============================================================================


settings = get_settings()
# pool_size/max_overflow are explicit (SQLAlchemy's async defaults are 5/10 = 15 total) because
# purchase quote batch imports open one independent session per file and run them concurrently
# (see PurchaseQuoteAiService._preview_one/_confirm_one) -- up to MAX_BATCH_FILES=10 sessions can
# be held open by a single request. 30 total gives that its own headroom plus room for the rest of
# the app's normal concurrent traffic on this single-process engine (no --workers in the uvicorn
# entrypoint, so this is the whole app's pool, not one of several).
engine = create_async_engine(
    settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=20
)
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
