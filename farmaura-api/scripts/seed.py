"""
farmaura-api/scripts/seed.py

Deterministic development seed for Farmaura.

Responsibilities:
- populate a coherent end-to-end dataset across marketplace, PDV, logistics, cashback, prescriptions, and audit domains;
- create testable users for administrator, pharmacist, cashier, and customer authentication flows;
- keep seed execution idempotent by using stable primary keys and record identifiers;

Observations:
- this script expects the backend environment variables and database connectivity to be configured;
- seed identities and operational snapshots are fictional and intended strictly for local and homologation testing;
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import create_engine, inspect, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.core.row_level_security import apply_row_level_security
from app.core.password_hashing import hash_password
from app.core.token_fingerprints import hash_refresh_token
from app.domain.enums import AccessScope, FileStatus, OrderStatus, UserRole
from app.models.audit_event import AuditEvent
from app.models.cashback_rule import CashbackRule
from app.models.cashback_transaction import CashbackTransaction
from app.models.cashback_transaction_line import CashbackTransactionLine
from app.models.chat_message import ChatMessage
from app.models.chat_message_attachment import ChatMessageAttachment
from app.models.chat_thread import ChatThread
from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.models.customer_cashback_wallet import CustomerCashbackWallet
from app.models.customer_payment_method import CustomerPaymentMethod
from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.file_asset import FileAsset
from app.models.fiscal_document import FiscalDocument
from app.models.health_service import HealthService
from app.models.health_service_appointment import HealthServiceAppointment
from app.models.inventory_item import InventoryItem
from app.models.inventory_location import InventoryLocation
from app.models.inventory_movement import InventoryMovement
from app.models.marketplace_listing import MarketplaceListing
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.order_item import OrderItem
from app.models.order_status_event import OrderStatusEvent
from app.models.pdv_order import PdvOrder
from app.models.pdv_order_item import PdvOrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.models.prescription import Prescription
from app.models.prescription_check import PrescriptionCheck
from app.models.prescription_file import PrescriptionFile
from app.models.prescription_item import PrescriptionItem
from app.models.product import Product
from app.models.refresh_token import RefreshToken
from app.models.saved_product import SavedProduct
from app.models.subscription import Subscription
from app.models.base import Base
from app.models.user import User


# ============================================================================
# SEED CONSTANTS
# ============================================================================


TENANT_ID = str(uuid5(NAMESPACE_URL, "https://farmaura.local/tenant/main"))
STORE_ID = str(uuid5(NAMESPACE_URL, "https://farmaura.local/store/ponte-alta-norte"))
STORE_NAME = "Farmaura Ponte Alta Norte"
STORE_ADDRESS = "Avenida São Francisco, Ponte Alta Norte, Gama, Distrito Federal, 72426-070"
STORE_LATITUDE = Decimal("-15.9775167")
STORE_LONGITUDE = Decimal("-48.0383778")
DEFAULT_PASSWORD = "Farmaura@123"
MFA_SECRET = "JBSWY3DPEHPK3PXP"
SEED_NOW = datetime(2026, 6, 11, 9, 30, tzinfo=UTC)


# ============================================================================
# HELPERS
# ============================================================================


def seed_uuid(key: str) -> str:
    """Return a deterministic UUID string for the given seed key."""

    return str(uuid5(NAMESPACE_URL, "https://farmaura.local/seed/" + key))


def money(value: str) -> Decimal:
    """Return a Decimal amount with two-digit monetary precision."""

    return Decimal(value)


def json_text(payload: object) -> str:
    """Return a compact JSON string for persisted text payload fields."""

    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"))


def coords(latitude: str, longitude: str) -> tuple[Decimal, Decimal]:
    """Return latitude and longitude decimals for seed coordinates."""

    return Decimal(latitude), Decimal(longitude)


def build_sync_engine():
    """Return a synchronous engine for schema reconciliation tasks."""

    return create_engine(get_settings().database_url, pool_pre_ping=True)


def expected_schema_columns() -> dict[str, set[str]]:
    """Return the expected columns for every mapped table."""

    return {
        table_name: {column.name for column in table.columns}
        for table_name, table in Base.metadata.tables.items()
    }


def detect_schema_drift(engine) -> dict[str, list[str]]:
    """Return missing tables or columns relative to the current ORM metadata."""

    inspector = inspect(engine)
    actual_tables = set(inspector.get_table_names())
    drift: dict[str, list[str]] = {}

    for table_name, expected_columns in expected_schema_columns().items():
        if table_name not in actual_tables:
            drift[table_name] = ["<missing_table>"]
            continue
        actual_columns = {column["name"] for column in inspector.get_columns(table_name)}
        missing_columns = sorted(expected_columns - actual_columns)
        if missing_columns:
            drift[table_name] = missing_columns

    return drift


def fetch_table_count(engine, table_name: str) -> int:
    """Return the row count for a table."""

    with engine.connect() as connection:
        return int(connection.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one())


def rebuild_public_schema(engine) -> None:
    """Drop and recreate the public schema from the current ORM metadata."""

    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
        connection.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
        connection.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        apply_row_level_security(connection)


def reconcile_schema_for_seed() -> None:
    """Repair an empty drifted schema before inserting seed records."""

    engine = build_sync_engine()
    try:
        drift = detect_schema_drift(engine)
        if not drift:
            return

        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        users_count = fetch_table_count(engine, "users") if "users" in existing_tables else 0
        customers_count = fetch_table_count(engine, "customers") if "customers" in existing_tables else 0
        if users_count == 0 and customers_count == 0:
            rebuild_public_schema(engine)
            return

        drift_summary = ", ".join(
            f"{table_name}: {', '.join(columns)}"
            for table_name, columns in sorted(drift.items())
        )
        raise RuntimeError(
            "Database schema drift detected on a non-empty database. "
            f"Automatic reconciliation was aborted to avoid data loss. Drift: {drift_summary}"
        )
    finally:
        engine.dispose()


async def upsert_many(session: object, records: list[object]) -> None:
    """Merge a batch of ORM records into the current async session."""

    for record in records:
        await session.merge(record)
    await session.flush()


def label(dt: datetime, *, with_time: bool = True) -> str:
    """Return a pt-BR style label for seeded operational snapshots."""

    if with_time:
        return dt.astimezone(UTC).strftime("%d/%m/%Y %H:%M UTC")
    return dt.astimezone(UTC).strftime("%d/%m/%Y")


# ============================================================================
# BUILDERS
# ============================================================================


def build_users(password_hash: str) -> dict[str, User]:
    """Build test users for all supported roles and access scopes."""

    return {
        "admin": User(
            id=seed_uuid("user-admin"),
            tenant_id=TENANT_ID,
            email="adriana.lima@farmaura.com.br",
            password_hash=password_hash,
            full_name="Adriana Lima",
            role=UserRole.ADMIN.value,
            access_scope=AccessScope.HYBRID.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        ),
        "pharmacist_lead": User(
            id=seed_uuid("user-pharmacist-lead"),
            tenant_id=TENANT_ID,
            email="helena.rocha@farmaura.com.br",
            password_hash=password_hash,
            full_name="Dra. Helena Rocha",
            role=UserRole.PHARMACIST.value,
            access_scope=AccessScope.INTERNAL.value,
            two_factor_enabled=True,
            two_factor_secret=MFA_SECRET,
            session_version=1,
            is_active=True,
        ),
        "pharmacist_support": User(
            id=seed_uuid("user-pharmacist-support"),
            tenant_id=TENANT_ID,
            email="paula.sena@farmaura.com.br",
            password_hash=password_hash,
            full_name="Dra. Paula Sena",
            role=UserRole.PHARMACIST.value,
            access_scope=AccessScope.INTERNAL.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        ),
        "cashier_lead": User(
            id=seed_uuid("user-cashier-lead"),
            tenant_id=TENANT_ID,
            email="caio.martins@farmaura.com.br",
            password_hash=password_hash,
            full_name="Caio Martins",
            role=UserRole.CASHIER.value,
            access_scope=AccessScope.INTERNAL.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        ),
        "cashier_support": User(
            id=seed_uuid("user-cashier-support"),
            tenant_id=TENANT_ID,
            email="alice.ferraz@farmaura.com.br",
            password_hash=password_hash,
            full_name="Alice Ferraz",
            role=UserRole.CASHIER.value,
            access_scope=AccessScope.INTERNAL.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        ),
        "customer_mariana": User(
            id=seed_uuid("user-customer-mariana"),
            tenant_id=TENANT_ID,
            email="mariana.souza@cliente.farmaura.com.br",
            password_hash=password_hash,
            full_name="Mariana Souza",
            role=UserRole.CUSTOMER.value,
            access_scope=AccessScope.MARKETPLACE.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        ),
        "customer_lucas": User(
            id=seed_uuid("user-customer-lucas"),
            tenant_id=TENANT_ID,
            email="lucas.andrade@cliente.farmaura.com.br",
            password_hash=password_hash,
            full_name="Lucas Andrade",
            role=UserRole.CUSTOMER.value,
            access_scope=AccessScope.MARKETPLACE.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        ),
        "customer_camila": User(
            id=seed_uuid("user-customer-camila"),
            tenant_id=TENANT_ID,
            email="camila.rocha@cliente.farmaura.com.br",
            password_hash=password_hash,
            full_name="Camila Rocha",
            role=UserRole.CUSTOMER.value,
            access_scope=AccessScope.MARKETPLACE.value,
            two_factor_enabled=True,
            two_factor_secret=MFA_SECRET,
            session_version=1,
            is_active=True,
        ),
        "customer_bianca": User(
            id=seed_uuid("user-customer-bianca"),
            tenant_id=TENANT_ID,
            email="bianca.alves@cliente.farmaura.com.br",
            password_hash=password_hash,
            full_name="Bianca Alves",
            role=UserRole.CUSTOMER.value,
            access_scope=AccessScope.MARKETPLACE.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        ),
    }


def build_customers() -> dict[str, Customer]:
    """Build CRM and checkout customer entities used by online and PDV flows."""

    return {
        "mariana": Customer(
            id=seed_uuid("customer-mariana"),
            tenant_id=TENANT_ID,
            external_code="CRM-0001",
            full_name="Mariana Souza",
            email="mariana.souza@cliente.farmaura.com.br",
            phone="+55 61 99811-2201",
            cpf="163.482.990-01",
            birth_date="1991-03-14",
            gender="Feminino",
            avatar_url="",
            loyalty_tier="Ouro",
            is_recurring=True,
            two_factor_enabled=False,
            member_since_label="Cliente desde março de 2024",
            city_label="Brasilia",
            district_label="Aguas Claras",
            cashback_balance=money("38.40"),
            orders_count=7,
            total_spent=money("1248.60"),
            average_ticket=money("178.37"),
            last_purchase_days_ago=3,
            purchase_frequency_days=21,
            tenure_months=27,
            active_subscriptions=["SUB-1001"],
            favorite_items=["Losartana 50mg", "Vitamina C 1g", "Tiras de Glicemia"],
            top_products_snapshot=[{"name": "Losartana 50mg", "count": 5}, {"name": "Vitamina C 1g", "count": 3}],
            interest_tags=["hipertensao", "bem-estar", "entrega-rapida"],
            category_mix_snapshot=[{"category": "Medicamentos", "share": 68}, {"category": "Bem-estar", "share": 32}],
            monthly_orders_snapshot=[1, 2, 1, 0, 1, 2],
            marketing_program_preferences=[{"name": "Cashback Farmaura", "enabled": True}],
            communication_channel_preferences=[{"channel": "whatsapp", "enabled": True}, {"channel": "email", "enabled": True}],
            is_active=True,
        ),
        "lucas": Customer(
            id=seed_uuid("customer-lucas"),
            tenant_id=TENANT_ID,
            external_code="CRM-0002",
            full_name="Lucas Andrade",
            email="lucas.andrade@cliente.farmaura.com.br",
            phone="+55 61 99821-1402",
            cpf="203.548.870-12",
            birth_date="1986-08-02",
            gender="Masculino",
            avatar_url="",
            loyalty_tier="Prata",
            is_recurring=True,
            two_factor_enabled=False,
            member_since_label="Cliente desde janeiro de 2025",
            city_label="Brasilia",
            district_label="Aguas Claras",
            cashback_balance=money("12.30"),
            orders_count=4,
            total_spent=money("612.20"),
            average_ticket=money("153.05"),
            last_purchase_days_ago=1,
            purchase_frequency_days=28,
            tenure_months=17,
            active_subscriptions=["SUB-1002"],
            favorite_items=["Amoxicilina 500mg", "Clonazepam 2mg"],
            top_products_snapshot=[{"name": "Amoxicilina 500mg", "count": 2}, {"name": "Dipirona 1g", "count": 2}],
            interest_tags=["receita-digital", "retirada-loja"],
            category_mix_snapshot=[{"category": "Medicamentos", "share": 88}, {"category": "Perfumaria", "share": 12}],
            monthly_orders_snapshot=[0, 1, 1, 0, 1, 1],
            marketing_program_preferences=[{"name": "Campanhas sazonais", "enabled": False}],
            communication_channel_preferences=[{"channel": "whatsapp", "enabled": True}, {"channel": "sms", "enabled": False}],
            is_active=True,
        ),
        "camila": Customer(
            id=seed_uuid("customer-camila"),
            tenant_id=TENANT_ID,
            external_code="CRM-0003",
            full_name="Camila Rocha",
            email="camila.rocha@cliente.farmaura.com.br",
            phone="+55 61 99831-4503",
            cpf="309.671.540-32",
            birth_date="1995-11-10",
            gender="Feminino",
            avatar_url="",
            loyalty_tier="Bronze",
            is_recurring=False,
            two_factor_enabled=True,
            member_since_label="Cliente desde abril de 2026",
            city_label="Brasilia",
            district_label="Taguatinga Sul",
            cashback_balance=money("4.80"),
            orders_count=2,
            total_spent=money("224.70"),
            average_ticket=money("112.35"),
            last_purchase_days_ago=9,
            purchase_frequency_days=45,
            tenure_months=2,
            active_subscriptions=[],
            favorite_items=["Protetor Solar FPS 70", "Serum Vitamina C"],
            top_products_snapshot=[{"name": "Protetor Solar FPS 70", "count": 1}, {"name": "Serum Vitamina C", "count": 1}],
            interest_tags=["dermocosmeticos", "marketplace"],
            category_mix_snapshot=[{"category": "Perfumaria", "share": 76}, {"category": "Bem-estar", "share": 24}],
            monthly_orders_snapshot=[0, 0, 0, 0, 1, 1],
            marketing_program_preferences=[{"name": "Ofertas skincare", "enabled": True}],
            communication_channel_preferences=[{"channel": "email", "enabled": True}, {"channel": "push", "enabled": True}],
            is_active=True,
        ),
        "bianca": Customer(
            id=seed_uuid("customer-bianca"),
            tenant_id=TENANT_ID,
            external_code="CRM-0004",
            full_name="Bianca Alves",
            email="bianca.alves@cliente.farmaura.com.br",
            phone="+55 61 99841-9910",
            cpf="407.852.600-45",
            birth_date="1989-05-19",
            gender="Feminino",
            avatar_url="",
            loyalty_tier="Prata",
            is_recurring=False,
            two_factor_enabled=False,
            member_since_label="Cliente desde setembro de 2023",
            city_label="Brasilia",
            district_label="Guara",
            cashback_balance=money("0.00"),
            orders_count=5,
            total_spent=money("540.80"),
            average_ticket=money("108.16"),
            last_purchase_days_ago=14,
            purchase_frequency_days=35,
            tenure_months=33,
            active_subscriptions=[],
            favorite_items=["Fralda Infantil Premium", "Dipirona 1g"],
            top_products_snapshot=[{"name": "Fralda Infantil Premium", "count": 2}, {"name": "Dipirona 1g", "count": 2}],
            interest_tags=["infantil", "retirada-loja"],
            category_mix_snapshot=[{"category": "Infantil", "share": 59}, {"category": "Medicamentos", "share": 41}],
            monthly_orders_snapshot=[1, 0, 1, 1, 1, 1],
            marketing_program_preferences=[{"name": "Ofertas maternidade", "enabled": True}],
            communication_channel_preferences=[{"channel": "whatsapp", "enabled": True}, {"channel": "email", "enabled": False}],
            is_active=True,
        ),
        "rafael": Customer(
            id=seed_uuid("customer-rafael"),
            tenant_id=TENANT_ID,
            external_code="CRM-0005",
            full_name="Rafael Martins",
            email="rafael.martins@cliente.farmaura.com.br",
            phone="+55 61 99851-1133",
            cpf="518.460.190-51",
            birth_date="1978-01-28",
            gender="Masculino",
            avatar_url="",
            loyalty_tier="Ouro",
            is_recurring=True,
            two_factor_enabled=False,
            member_since_label="Cliente desde fevereiro de 2022",
            city_label="Brasilia",
            district_label="Vicente Pires",
            cashback_balance=money("21.10"),
            orders_count=11,
            total_spent=money("2324.90"),
            average_ticket=money("211.35"),
            last_purchase_days_ago=5,
            purchase_frequency_days=18,
            tenure_months=52,
            active_subscriptions=["SUB-1003"],
            favorite_items=["Tiras de Glicemia", "Losartana 50mg"],
            top_products_snapshot=[{"name": "Tiras de Glicemia", "count": 6}, {"name": "Losartana 50mg", "count": 4}],
            interest_tags=["diabetes", "delivery"],
            category_mix_snapshot=[{"category": "Medicamentos", "share": 71}, {"category": "Bem-estar", "share": 29}],
            monthly_orders_snapshot=[2, 1, 2, 2, 2, 2],
            marketing_program_preferences=[{"name": "Programa crônicos", "enabled": True}],
            communication_channel_preferences=[{"channel": "whatsapp", "enabled": True}, {"channel": "email", "enabled": True}],
            is_active=True,
        ),
    }


def build_catalog() -> dict[str, dict[str, object]]:
    """Build product, inventory, listing, and cashback catalog records."""

    product_specs = [
        {
            "key": "losartan",
            "sku": "FA-PROD-001",
            "name": "Losartana Potassica 50mg 30 comprimidos",
            "description": "Anti-hipertensivo para tratamento continuo.",
            "price": "28.90",
            "requires_prescription": False,
            "brand": "Genfar",
            "category": "Medicamentos",
            "ean": "7896004700011",
            "location": "A1-01",
            "batch": "LOT-LOS-2608",
            "expiry": "08/2027",
            "quantity": 64,
            "minimum": 12,
            "acquisition_cost": "16.20",
            "market_reference_price": "31.90",
            "promo": "0.00",
            "published_price": "28.90",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.79",
            "target_margin": "21.50",
            "cashback_percent": "6.00",
            "cashback_min": "20.00",
            "cashback_max": "18.00",
        },
        {
            "key": "amoxicillin",
            "sku": "FA-PROD-002",
            "name": "Amoxicilina 500mg 21 capsulas",
            "description": "Antibiotico de uso sob prescricao medica.",
            "price": "34.90",
            "requires_prescription": True,
            "brand": "EMS",
            "category": "Medicamentos",
            "ean": "7894916500028",
            "location": "A1-05",
            "batch": "LOT-AMO-2607",
            "expiry": "07/2027",
            "quantity": 29,
            "minimum": 8,
            "acquisition_cost": "19.80",
            "market_reference_price": "38.50",
            "promo": "4.00",
            "published_price": "33.50",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.79",
            "target_margin": "19.80",
            "cashback_percent": "4.00",
            "cashback_min": "25.00",
            "cashback_max": "10.00",
        },
        {
            "key": "clonazepam",
            "sku": "FA-PROD-003",
            "name": "Clonazepam 2mg 30 comprimidos",
            "description": "Medicamento controlado com dispensacao monitorada.",
            "price": "19.90",
            "requires_prescription": True,
            "brand": "Medley",
            "category": "Medicamentos",
            "ean": "7896422500037",
            "location": "CONTROL-02",
            "batch": "LOT-CLO-2610",
            "expiry": "10/2027",
            "quantity": 18,
            "minimum": 6,
            "acquisition_cost": "9.90",
            "market_reference_price": "23.90",
            "promo": "0.00",
            "published_price": "19.90",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.79",
            "target_margin": "24.00",
            "cashback_percent": "0.00",
            "cashback_min": "0.00",
            "cashback_max": "0.00",
            "is_controlled": True,
        },
        {
            "key": "vitamin_c",
            "sku": "FA-PROD-004",
            "name": "Vitamina C 1g 30 comprimidos efervescentes",
            "description": "Suplemento vitaminico para imunidade e rotina diaria.",
            "price": "24.50",
            "requires_prescription": False,
            "brand": "Neo Quimica",
            "category": "Bem-estar",
            "ean": "7896112400045",
            "location": "B2-03",
            "batch": "LOT-VIT-2609",
            "expiry": "09/2027",
            "quantity": 51,
            "minimum": 10,
            "acquisition_cost": "13.20",
            "market_reference_price": "27.90",
            "promo": "8.00",
            "published_price": "22.54",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.79",
            "target_margin": "18.00",
            "cashback_percent": "10.00",
            "cashback_min": "20.00",
            "cashback_max": "15.00",
        },
        {
            "key": "sunscreen",
            "sku": "FA-PROD-005",
            "name": "Protetor Solar FPS 70 toque seco 120ml",
            "description": "Protecao diaria com acabamento seco e alta resistencia.",
            "price": "59.90",
            "requires_prescription": False,
            "brand": "La Roche-Posay",
            "category": "Perfumaria",
            "ean": "7899706200052",
            "location": "C4-01",
            "batch": "LOT-SUN-2701",
            "expiry": "01/2028",
            "quantity": 23,
            "minimum": 6,
            "acquisition_cost": "39.80",
            "market_reference_price": "67.90",
            "promo": "5.00",
            "published_price": "56.90",
            "commission": "8.50",
            "payment_fee": "2.69",
            "fixed_fee": "0.99",
            "target_margin": "16.00",
            "cashback_percent": "8.00",
            "cashback_min": "40.00",
            "cashback_max": "18.00",
        },
        {
            "key": "diapers",
            "sku": "FA-PROD-006",
            "name": "Fralda Infantil Premium tamanho G 60 unidades",
            "description": "Pacote economico com alta absorcao para uso diario.",
            "price": "72.90",
            "requires_prescription": False,
            "brand": "Pampers",
            "category": "Infantil",
            "ean": "7891023400064",
            "location": "D1-02",
            "batch": "LOT-DIA-2606",
            "expiry": "06/2028",
            "quantity": 31,
            "minimum": 8,
            "acquisition_cost": "52.10",
            "market_reference_price": "79.90",
            "promo": "3.00",
            "published_price": "70.71",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.99",
            "target_margin": "14.50",
            "cashback_percent": "7.00",
            "cashback_min": "50.00",
            "cashback_max": "20.00",
        },
        {
            "key": "dipyrone",
            "sku": "FA-PROD-007",
            "name": "Dipirona 1g 10 comprimidos",
            "description": "Analgesico e antipiretico de uso eventual.",
            "price": "14.90",
            "requires_prescription": False,
            "brand": "Novalgina",
            "category": "Medicamentos",
            "ean": "7896002300073",
            "location": "A2-07",
            "batch": "LOT-DIP-2608",
            "expiry": "08/2027",
            "quantity": 78,
            "minimum": 18,
            "acquisition_cost": "8.10",
            "market_reference_price": "16.90",
            "promo": "0.00",
            "published_price": "14.90",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.79",
            "target_margin": "18.50",
            "cashback_percent": "5.00",
            "cashback_min": "10.00",
            "cashback_max": "8.00",
        },
        {
            "key": "serum",
            "sku": "FA-PROD-008",
            "name": "Serum facial vitamina C 30ml",
            "description": "Dermocosmetico antioxidante para rotina noturna.",
            "price": "89.90",
            "requires_prescription": False,
            "brand": "Principia",
            "category": "Perfumaria",
            "ean": "7896034500081",
            "location": "C4-09",
            "batch": "LOT-SER-2611",
            "expiry": "11/2027",
            "quantity": 19,
            "minimum": 5,
            "acquisition_cost": "58.40",
            "market_reference_price": "95.50",
            "promo": "7.50",
            "published_price": "83.16",
            "commission": "8.50",
            "payment_fee": "2.69",
            "fixed_fee": "0.99",
            "target_margin": "17.00",
            "cashback_percent": "9.00",
            "cashback_min": "60.00",
            "cashback_max": "22.00",
        },
        {
            "key": "glycemia_strips",
            "sku": "FA-PROD-009",
            "name": "Tiras de Glicemia 50 unidades",
            "description": "Suprimento para monitoramento domiciliar da glicose.",
            "price": "64.90",
            "requires_prescription": False,
            "brand": "Accu-Chek",
            "category": "Bem-estar",
            "ean": "7896023400098",
            "location": "B3-01",
            "batch": "LOT-GLI-2609",
            "expiry": "09/2027",
            "quantity": 26,
            "minimum": 8,
            "acquisition_cost": "42.90",
            "market_reference_price": "69.90",
            "promo": "0.00",
            "published_price": "64.90",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.99",
            "target_margin": "15.00",
            "cashback_percent": "8.00",
            "cashback_min": "45.00",
            "cashback_max": "18.00",
        },
        {
            "key": "simethicone",
            "sku": "FA-PROD-010",
            "name": "Simeticona gotas 15ml",
            "description": "Auxiliar digestivo para desconforto abdominal e gases.",
            "price": "16.90",
            "requires_prescription": False,
            "brand": "EMS",
            "category": "Medicamentos",
            "ean": "7896009100108",
            "location": "A3-02",
            "batch": "LOT-SIM-2702",
            "expiry": "02/2028",
            "quantity": 37,
            "minimum": 10,
            "acquisition_cost": "9.10",
            "market_reference_price": "18.90",
            "promo": "0.00",
            "published_price": "16.90",
            "commission": "7.50",
            "payment_fee": "2.49",
            "fixed_fee": "0.79",
            "target_margin": "17.50",
            "cashback_percent": "5.00",
            "cashback_min": "10.00",
            "cashback_max": "8.00",
        },
    ]

    products: dict[str, Product] = {}
    inventory: dict[str, InventoryItem] = {}
    listings: dict[str, MarketplaceListing] = {}
    rules: dict[str, CashbackRule] = {}

    for spec in product_specs:
        key = str(spec["key"])
        products[key] = Product(
            id=seed_uuid("product-" + key),
            tenant_id=TENANT_ID,
            sku=str(spec["sku"]),
            name=str(spec["name"]),
            description=str(spec["description"]),
            price=money(str(spec["price"])),
            requires_prescription=bool(spec["requires_prescription"]),
            is_active=True,
        )
        inventory[key] = InventoryItem(
            id=seed_uuid("inventory-" + key),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            sku=str(spec["sku"]),
            name=str(spec["name"]),
            brand_name=str(spec["brand"]),
            category_name=str(spec["category"]),
            ean_code=str(spec["ean"]),
            storage_location=str(spec["location"]),
            batch_code=str(spec["batch"]),
            expiry_label=str(spec["expiry"]),
            quantity=int(spec["quantity"]),
            minimum_quantity=int(spec["minimum"]),
            sale_price=money(str(spec["price"])),
            acquisition_cost=money(str(spec["acquisition_cost"])),
            market_reference_price=money(str(spec["market_reference_price"])),
            promotional_discount_percent=money(str(spec["promo"])),
            is_controlled=bool(spec.get("is_controlled", False)),
            is_active=True,
        )
        listings[key] = MarketplaceListing(
            id=seed_uuid("listing-" + key),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            inventory_item_id=inventory[key].id,
            marketplace_name="Marketplace Farmaura",
            listing_sku="LIST-" + str(spec["sku"]),
            title=str(spec["name"]),
            short_description=str(spec["description"]),
            brand_name=str(spec["brand"]),
            category_name=str(spec["category"]),
            ean_code=str(spec["ean"]),
            published_price=money(str(spec["published_price"])),
            acquisition_cost=money(str(spec["acquisition_cost"])),
            reference_market_price=money(str(spec["market_reference_price"])),
            promotional_discount_percent=money(str(spec["promo"])),
            commission_percent=money(str(spec["commission"])),
            payment_fee_percent=money(str(spec["payment_fee"])),
            fixed_fee=money(str(spec["fixed_fee"])),
            target_margin_percent=money(str(spec["target_margin"])),
            is_controlled=bool(spec.get("is_controlled", False)),
            requires_prescription_upload=bool(spec["requires_prescription"]),
            is_published=True,
            is_visible=True,
        )
        rules[key] = CashbackRule(
            id=seed_uuid("cashback-rule-" + key),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            inventory_item_id=inventory[key].id,
            marketplace_listing_id=listings[key].id,
            rule_name="Cashback " + str(spec["name"]).split(" ")[0],
            cashback_percent=money(str(spec["cashback_percent"])),
            minimum_order_amount=money(str(spec["cashback_min"])),
            maximum_cashback_amount=money(str(spec["cashback_max"])),
            release_after_delivery=True,
            validity_days=90,
            is_active=money(str(spec["cashback_percent"])) > Decimal("0.00"),
        )

    return {
        "products": products,
        "inventory": inventory,
        "listings": listings,
        "rules": rules,
    }


def build_customer_assets(customers: dict[str, Customer]) -> dict[str, list[object]]:
    """Build addresses, payment methods, wallets, saved items, and subscriptions."""

    addresses = [
        CustomerAddress(
            id=seed_uuid("address-mariana-home"),
            customer_id=customers["mariana"].id,
            label="Casa",
            postal_code="72426-070",
            street_line="Rua 25 Sul, Bloco B, Apto 1402",
            district="Ponte Alta Norte",
            city="Brasilia",
            state_code="DF",
            complement="Torre Jasmin",
            reference_note="Portaria principal ao lado da cafeteria",
            recipient_name="Mariana Souza",
            recipient_phone=customers["mariana"].phone,
            is_primary=True,
            is_active=True,
        ),
        CustomerAddress(
            id=seed_uuid("address-lucas-home"),
            customer_id=customers["lucas"].id,
            label="Casa",
            postal_code="71945-610",
            street_line="QSE 11, Casa 22",
            district="Taguatinga Sul",
            city="Brasilia",
            state_code="DF",
            complement="",
            reference_note="Portao azul",
            recipient_name="Lucas Andrade",
            recipient_phone=customers["lucas"].phone,
            is_primary=True,
            is_active=True,
        ),
        CustomerAddress(
            id=seed_uuid("address-camila-work"),
            customer_id=customers["camila"].id,
            label="Trabalho",
            postal_code="71910-540",
            street_line="Avenida Castanheiras, Sala 304",
            district="Ponte Alta Norte",
            city="Brasilia",
            state_code="DF",
            complement="Edificio Corporate",
            reference_note="Recepcao comercial",
            recipient_name="Camila Rocha",
            recipient_phone=customers["camila"].phone,
            is_primary=True,
            is_active=True,
        ),
        CustomerAddress(
            id=seed_uuid("address-bianca-home"),
            customer_id=customers["bianca"].id,
            label="Casa",
            postal_code="71015-120",
            street_line="QE 24, Conjunto H, Casa 09",
            district="Guara II",
            city="Brasilia",
            state_code="DF",
            complement="",
            reference_note="Interfone 09",
            recipient_name="Bianca Alves",
            recipient_phone=customers["bianca"].phone,
            is_primary=True,
            is_active=True,
        ),
        CustomerAddress(
            id=seed_uuid("address-rafael-home"),
            customer_id=customers["rafael"].id,
            label="Casa",
            postal_code="72006-600",
            street_line="Rua 08, Chacara 47, Casa 4",
            district="Vicente Pires",
            city="Brasilia",
            state_code="DF",
            complement="",
            reference_note="Entrada lateral",
            recipient_name="Rafael Martins",
            recipient_phone=customers["rafael"].phone,
            is_primary=True,
            is_active=True,
        ),
    ]

    payment_methods = [
        CustomerPaymentMethod(
            id=seed_uuid("payment-mariana-visa"),
            customer_id=customers["mariana"].id,
            provider_name="seed-gateway",
            provider_token="tok_seed_mariana_visa",
            brand_name="Visa",
            last_four_digits="4242",
            holder_name="Mariana Souza",
            expiration_month="11",
            expiration_year="2028",
            is_primary=True,
            is_active=True,
        ),
        CustomerPaymentMethod(
            id=seed_uuid("payment-lucas-master"),
            customer_id=customers["lucas"].id,
            provider_name="seed-gateway",
            provider_token="tok_seed_lucas_master",
            brand_name="Mastercard",
            last_four_digits="5454",
            holder_name="Lucas Andrade",
            expiration_month="09",
            expiration_year="2027",
            is_primary=True,
            is_active=True,
        ),
        CustomerPaymentMethod(
            id=seed_uuid("payment-camila-elo"),
            customer_id=customers["camila"].id,
            provider_name="seed-gateway",
            provider_token="tok_seed_camila_elo",
            brand_name="Elo",
            last_four_digits="8811",
            holder_name="Camila Rocha",
            expiration_month="05",
            expiration_year="2029",
            is_primary=True,
            is_active=True,
        ),
    ]

    wallets = [
        CustomerCashbackWallet(
            id=seed_uuid("wallet-mariana"),
            customer_id=customers["mariana"].id,
            available_balance=money("38.40"),
            pending_balance=money("0.00"),
            redeemed_total=money("19.50"),
            expired_total=money("2.10"),
            lifetime_earned_total=money("60.00"),
        ),
        CustomerCashbackWallet(
            id=seed_uuid("wallet-lucas"),
            customer_id=customers["lucas"].id,
            available_balance=money("5.10"),
            pending_balance=money("7.20"),
            redeemed_total=money("11.00"),
            expired_total=money("1.40"),
            lifetime_earned_total=money("24.70"),
        ),
        CustomerCashbackWallet(
            id=seed_uuid("wallet-camila"),
            customer_id=customers["camila"].id,
            available_balance=money("4.80"),
            pending_balance=money("0.00"),
            redeemed_total=money("0.00"),
            expired_total=money("0.00"),
            lifetime_earned_total=money("4.80"),
        ),
        CustomerCashbackWallet(
            id=seed_uuid("wallet-bianca"),
            customer_id=customers["bianca"].id,
            available_balance=money("0.00"),
            pending_balance=money("0.00"),
            redeemed_total=money("6.30"),
            expired_total=money("0.00"),
            lifetime_earned_total=money("6.30"),
        ),
        CustomerCashbackWallet(
            id=seed_uuid("wallet-rafael"),
            customer_id=customers["rafael"].id,
            available_balance=money("21.10"),
            pending_balance=money("5.20"),
            redeemed_total=money("12.00"),
            expired_total=money("3.00"),
            lifetime_earned_total=money("41.30"),
        ),
    ]

    return {
        "addresses": addresses,
        "payment_methods": payment_methods,
        "wallets": wallets,
    }


def build_inventory_operations(catalog: dict[str, dict[str, object]]) -> dict[str, list[object]]:
    """Build storage locations and initial stock movements from seeded inventory."""

    inventory = catalog["inventory"]
    locations_by_code: dict[str, InventoryLocation] = {}
    movements: list[InventoryMovement] = []

    for key, item in inventory.items():
        if item.storage_location not in locations_by_code:
            locations_by_code[item.storage_location] = InventoryLocation(
                id=seed_uuid("inventory-location-" + item.storage_location),
                tenant_id=item.tenant_id,
                store_id=item.store_id,
                code=item.storage_location,
                name="Storage " + item.storage_location,
                zone=item.storage_location.split("-", maxsplit=1)[0],
                description="Seeded storage location for internal inventory operations.",
                temperature_range="Ambient",
                is_controlled_only=item.storage_location.lower().startswith("cofre"),
                is_active=True,
            )
        movements.append(
            InventoryMovement(
                id=seed_uuid("inventory-movement-initial-" + key),
                tenant_id=item.tenant_id,
                store_id=item.store_id,
                inventory_item_id=item.id,
                performed_by_user_id=seed_uuid("user-pharmacist-lead"),
                movement_type="initial",
                quantity_delta=item.quantity,
                quantity_before=0,
                resulting_quantity=item.quantity,
                reason="Seeded initial stock",
                note="Initial stock registration created by deterministic seed.",
                reference_code="SEED-INITIAL",
                from_location_code="",
                to_location_code=item.storage_location,
                unit_cost_snapshot=item.acquisition_cost,
            )
        )

    return {
        "locations": list(locations_by_code.values()),
        "movements": movements,
    }


def build_services(users: dict[str, User], customers: dict[str, Customer]) -> dict[str, list[object]]:
    """Build health service catalog and customer appointments."""

    services = {
        "vaccine": HealthService(
            id=seed_uuid("service-vaccine"),
            tenant_id=TENANT_ID,
            service_code="HSV-0001",
            service_name="Aplicacao de vacina influenza",
            service_group="Imunizacao",
            icon_name="shield",
            description="Aplicacao assistida com triagem farmacêutica.",
            duration_minutes=20,
            duration_label="20 min",
            price_amount=money("89.90"),
            is_active=True,
        ),
        "glucose": HealthService(
            id=seed_uuid("service-glucose"),
            tenant_id=TENANT_ID,
            service_code="HSV-0002",
            service_name="Teste rapido de glicemia",
            service_group="Exames rapidos",
            icon_name="activity",
            description="Medição orientada com entrega de resultado e orientação.",
            duration_minutes=15,
            duration_label="15 min",
            price_amount=money("24.90"),
            is_active=True,
        ),
        "injection": HealthService(
            id=seed_uuid("service-injection"),
            tenant_id=TENANT_ID,
            service_code="HSV-0003",
            service_name="Aplicacao de injetaveis",
            service_group="Procedimentos",
            icon_name="rx",
            description="Aplicação com conferência documental e registro interno.",
            duration_minutes=25,
            duration_label="25 min",
            price_amount=money("39.90"),
            is_active=True,
        ),
    }

    appointments = [
        HealthServiceAppointment(
            id=seed_uuid("appointment-mariana-vaccine"),
            tenant_id=TENANT_ID,
            service_id=services["vaccine"].id,
            customer_id=customers["mariana"].id,
            assigned_user_id=users["pharmacist_support"].id,
            appointment_code="HSA-1001",
            source_channel="marketplace",
            appointment_status="scheduled",
            service_name_snapshot=services["vaccine"].service_name,
            professional_name_snapshot=users["pharmacist_support"].full_name,
            store_id=STORE_ID,
            store_name_snapshot=STORE_NAME,
            scheduled_date_label="14/06/2026",
            scheduled_time_label="10:30",
            completed_at_label="",
            cancelled_at_label="",
            price_amount=money("89.90"),
            notes="Cliente solicita comprovante para convênio.",
        ),
        HealthServiceAppointment(
            id=seed_uuid("appointment-rafael-glucose"),
            tenant_id=TENANT_ID,
            service_id=services["glucose"].id,
            customer_id=customers["rafael"].id,
            assigned_user_id=users["pharmacist_lead"].id,
            appointment_code="HSA-1002",
            source_channel="marketplace",
            appointment_status="completed",
            service_name_snapshot=services["glucose"].service_name,
            professional_name_snapshot=users["pharmacist_lead"].full_name,
            store_id=STORE_ID,
            store_name_snapshot=STORE_NAME,
            scheduled_date_label="10/06/2026",
            scheduled_time_label="09:00",
            completed_at_label="10/06/2026 09:18 UTC",
            cancelled_at_label="",
            price_amount=money("24.90"),
            notes="Resultado compartilhado no CRM.",
        ),
        HealthServiceAppointment(
            id=seed_uuid("appointment-bianca-injection"),
            tenant_id=TENANT_ID,
            service_id=services["injection"].id,
            customer_id=customers["bianca"].id,
            assigned_user_id=users["pharmacist_support"].id,
            appointment_code="HSA-1003",
            source_channel="phone",
            appointment_status="cancelled",
            service_name_snapshot=services["injection"].service_name,
            professional_name_snapshot=users["pharmacist_support"].full_name,
            store_id=STORE_ID,
            store_name_snapshot=STORE_NAME,
            scheduled_date_label="12/06/2026",
            scheduled_time_label="16:00",
            completed_at_label="",
            cancelled_at_label="12/06/2026 13:05 UTC",
            price_amount=money("39.90"),
            notes="Cancelado por indisponibilidade da cliente.",
        ),
    ]

    return {
        "services": list(services.values()),
        "appointments": appointments,
    }


def build_orders(
    customers: dict[str, Customer],
    assets: dict[str, list[object]],
    catalog: dict[str, dict[str, object]],
) -> dict[str, dict[str, object] | list[object]]:
    """Build marketplace orders, items, fulfillments, and status history."""

    addresses = {address.id: address for address in assets["addresses"] if isinstance(address, CustomerAddress)}
    payment_methods = {
        payment.customer_id: payment for payment in assets["payment_methods"] if isinstance(payment, CustomerPaymentMethod)
    }
    listings = catalog["listings"]
    inventory = catalog["inventory"]

    delivery_points = {
        "mariana": coords("-15.9723010", "-48.0311000"),
        "lucas": coords("-15.9819500", "-48.0445000"),
        "camila": coords("-15.9698000", "-48.0482000"),
        "bianca": coords("-15.9862000", "-48.0297000"),
        "rafael": coords("-15.9748500", "-48.0501000"),
    }

    orders = {
        "online_delivered": Order(
            id=seed_uuid("order-online-delivered"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            customer_id=customers["mariana"].id,
            selected_address_id=seed_uuid("address-mariana-home"),
            selected_payment_method_id=payment_methods[customers["mariana"].id].id,
            order_code="FA-1001",
            channel="app",
            status=OrderStatus.DELIVERED.value,
            fulfillment_type="delivery",
            priority="normal",
            payment_method_label="credit_card",
            payment_status="paid",
            customer_display_name=customers["mariana"].full_name,
            customer_document_snapshot=customers["mariana"].cpf,
            customer_phone_snapshot=customers["mariana"].phone,
            customer_email_snapshot=customers["mariana"].email,
            requires_prescription_review=False,
            prescription_status="none",
            subtotal_amount=money("80.34"),
            delivery_fee_amount=money("9.90"),
            discount_amount=money("2.00"),
            cashback_applied_amount=money("5.00"),
            cashback_earned_amount=money("4.82"),
            total_amount=money("83.24"),
            placed_at_label="09/06/2026 14:12 UTC",
            estimated_ready_at_label="09/06/2026 14:35 UTC",
            estimated_delivery_at_label="09/06/2026 15:20 UTC",
            completed_at_label="09/06/2026 15:11 UTC",
            marketplace_note="Entregar na portaria e avisar pelo WhatsApp.",
            internal_note="Separacao concluida sem divergencias.",
            is_active=True,
        ),
        "online_in_transit": Order(
            id=seed_uuid("order-online-in-transit"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            customer_id=customers["rafael"].id,
            selected_address_id=seed_uuid("address-rafael-home"),
            selected_payment_method_id=None,
            order_code="FA-1002",
            channel="web",
            status=OrderStatus.DISPATCHED.value,
            fulfillment_type="delivery",
            priority="high",
            payment_method_label="pix",
            payment_status="paid",
            customer_display_name=customers["rafael"].full_name,
            customer_document_snapshot=customers["rafael"].cpf,
            customer_phone_snapshot=customers["rafael"].phone,
            customer_email_snapshot=customers["rafael"].email,
            requires_prescription_review=False,
            prescription_status="none",
            subtotal_amount=money("93.80"),
            delivery_fee_amount=money("0.00"),
            discount_amount=money("0.00"),
            cashback_applied_amount=money("0.00"),
            cashback_earned_amount=money("7.51"),
            total_amount=money("93.80"),
            placed_at_label="11/06/2026 08:05 UTC",
            estimated_ready_at_label="11/06/2026 08:35 UTC",
            estimated_delivery_at_label="11/06/2026 09:25 UTC",
            completed_at_label="",
            marketplace_note="Cliente diabetico solicita entrega agil.",
            internal_note="Em rota ativa 2.",
            is_active=True,
        ),
        "online_pickup_ready": Order(
            id=seed_uuid("order-online-pickup-ready"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            customer_id=customers["camila"].id,
            selected_address_id=None,
            selected_payment_method_id=payment_methods[customers["camila"].id].id,
            order_code="FA-1003",
            channel="app",
            status=OrderStatus.READY.value,
            fulfillment_type="pickup",
            priority="normal",
            payment_method_label="credit_card",
            payment_status="paid",
            customer_display_name=customers["camila"].full_name,
            customer_document_snapshot=customers["camila"].cpf,
            customer_phone_snapshot=customers["camila"].phone,
            customer_email_snapshot=customers["camila"].email,
            requires_prescription_review=False,
            prescription_status="none",
            subtotal_amount=money("140.06"),
            delivery_fee_amount=money("0.00"),
            discount_amount=money("8.00"),
            cashback_applied_amount=money("0.00"),
            cashback_earned_amount=money("13.00"),
            total_amount=money("132.06"),
            placed_at_label="11/06/2026 07:40 UTC",
            estimated_ready_at_label="11/06/2026 08:20 UTC",
            estimated_delivery_at_label="",
            completed_at_label="",
            marketplace_note="Retirada apos expediente.",
            internal_note="Pedido aguardando retirada no locker 03.",
            is_active=True,
        ),
        "online_cancelled_refunded": Order(
            id=seed_uuid("order-online-cancelled"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            customer_id=customers["bianca"].id,
            selected_address_id=seed_uuid("address-bianca-home"),
            selected_payment_method_id=None,
            order_code="FA-1004",
            channel="app",
            status=OrderStatus.CANCELLED.value,
            fulfillment_type="delivery",
            priority="normal",
            payment_method_label="pix",
            payment_status="refunded",
            customer_display_name=customers["bianca"].full_name,
            customer_document_snapshot=customers["bianca"].cpf,
            customer_phone_snapshot=customers["bianca"].phone,
            customer_email_snapshot=customers["bianca"].email,
            requires_prescription_review=False,
            prescription_status="none",
            subtotal_amount=money("70.71"),
            delivery_fee_amount=money("9.90"),
            discount_amount=money("0.00"),
            cashback_applied_amount=money("3.20"),
            cashback_earned_amount=money("0.00"),
            total_amount=money("77.41"),
            placed_at_label="08/06/2026 19:05 UTC",
            estimated_ready_at_label="08/06/2026 19:28 UTC",
            estimated_delivery_at_label="08/06/2026 20:25 UTC",
            completed_at_label="08/06/2026 19:32 UTC",
            marketplace_note="Cancelar se houver atraso superior a 30 minutos.",
            internal_note="Cancelado por indisponibilidade de motoqueiro; estorno realizado.",
            is_active=False,
        ),
        "online_prescription_pending": Order(
            id=seed_uuid("order-online-prescription"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            customer_id=customers["lucas"].id,
            selected_address_id=seed_uuid("address-lucas-home"),
            selected_payment_method_id=payment_methods[customers["lucas"].id].id,
            order_code="FA-1005",
            channel="web",
            status=OrderStatus.NEW.value,
            fulfillment_type="delivery",
            priority="high",
            payment_method_label="credit_card",
            payment_status="authorized",
            customer_display_name=customers["lucas"].full_name,
            customer_document_snapshot=customers["lucas"].cpf,
            customer_phone_snapshot=customers["lucas"].phone,
            customer_email_snapshot=customers["lucas"].email,
            requires_prescription_review=True,
            prescription_status="pending",
            subtotal_amount=money("53.40"),
            delivery_fee_amount=money("9.90"),
            discount_amount=money("0.00"),
            cashback_applied_amount=money("0.00"),
            cashback_earned_amount=money("2.14"),
            total_amount=money("63.30"),
            placed_at_label="11/06/2026 08:52 UTC",
            estimated_ready_at_label="11/06/2026 09:40 UTC",
            estimated_delivery_at_label="11/06/2026 10:30 UTC",
            completed_at_label="",
            marketplace_note="Receita enviada em duas paginas.",
            internal_note="Aguardando validacao farmaceutica.",
            is_active=True,
        ),
    }

    order_items = [
        OrderItem(
            id=seed_uuid("order-item-1001-losartan"),
            order_id=orders["online_delivered"].id,
            inventory_item_id=inventory["losartan"].id,
            marketplace_listing_id=listings["losartan"].id,
            item_sku="LIST-FA-PROD-001",
            item_name_snapshot=str(listings["losartan"].title),
            brand_name_snapshot=str(listings["losartan"].brand_name),
            category_name_snapshot=str(listings["losartan"].category_name),
            ean_code_snapshot=str(listings["losartan"].ean_code),
            storage_location_snapshot=str(inventory["losartan"].storage_location),
            quantity=2,
            unit_price=money("28.90"),
            line_total=money("57.80"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=True,
            picked_at_label="09/06/2026 14:31 UTC",
        ),
        OrderItem(
            id=seed_uuid("order-item-1001-vitamin-c"),
            order_id=orders["online_delivered"].id,
            inventory_item_id=inventory["vitamin_c"].id,
            marketplace_listing_id=listings["vitamin_c"].id,
            item_sku="LIST-FA-PROD-004",
            item_name_snapshot=str(listings["vitamin_c"].title),
            brand_name_snapshot=str(listings["vitamin_c"].brand_name),
            category_name_snapshot=str(listings["vitamin_c"].category_name),
            ean_code_snapshot=str(listings["vitamin_c"].ean_code),
            storage_location_snapshot=str(inventory["vitamin_c"].storage_location),
            quantity=1,
            unit_price=money("22.54"),
            line_total=money("22.54"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=True,
            picked_at_label="09/06/2026 14:30 UTC",
        ),
        OrderItem(
            id=seed_uuid("order-item-1002-glycemia"),
            order_id=orders["online_in_transit"].id,
            inventory_item_id=inventory["glycemia_strips"].id,
            marketplace_listing_id=listings["glycemia_strips"].id,
            item_sku="LIST-FA-PROD-009",
            item_name_snapshot=str(listings["glycemia_strips"].title),
            brand_name_snapshot=str(listings["glycemia_strips"].brand_name),
            category_name_snapshot=str(listings["glycemia_strips"].category_name),
            ean_code_snapshot=str(listings["glycemia_strips"].ean_code),
            storage_location_snapshot=str(inventory["glycemia_strips"].storage_location),
            quantity=1,
            unit_price=money("64.90"),
            line_total=money("64.90"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=True,
            picked_at_label="11/06/2026 08:29 UTC",
        ),
        OrderItem(
            id=seed_uuid("order-item-1002-losartan"),
            order_id=orders["online_in_transit"].id,
            inventory_item_id=inventory["losartan"].id,
            marketplace_listing_id=listings["losartan"].id,
            item_sku="LIST-FA-PROD-001",
            item_name_snapshot=str(listings["losartan"].title),
            brand_name_snapshot=str(listings["losartan"].brand_name),
            category_name_snapshot=str(listings["losartan"].category_name),
            ean_code_snapshot=str(listings["losartan"].ean_code),
            storage_location_snapshot=str(inventory["losartan"].storage_location),
            quantity=1,
            unit_price=money("28.90"),
            line_total=money("28.90"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=True,
            picked_at_label="11/06/2026 08:30 UTC",
        ),
        OrderItem(
            id=seed_uuid("order-item-1003-serum"),
            order_id=orders["online_pickup_ready"].id,
            inventory_item_id=inventory["serum"].id,
            marketplace_listing_id=listings["serum"].id,
            item_sku="LIST-FA-PROD-008",
            item_name_snapshot=str(listings["serum"].title),
            brand_name_snapshot=str(listings["serum"].brand_name),
            category_name_snapshot=str(listings["serum"].category_name),
            ean_code_snapshot=str(listings["serum"].ean_code),
            storage_location_snapshot=str(inventory["serum"].storage_location),
            quantity=1,
            unit_price=money("83.16"),
            line_total=money("83.16"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=True,
            picked_at_label="11/06/2026 08:15 UTC",
        ),
        OrderItem(
            id=seed_uuid("order-item-1003-sunscreen"),
            order_id=orders["online_pickup_ready"].id,
            inventory_item_id=inventory["sunscreen"].id,
            marketplace_listing_id=listings["sunscreen"].id,
            item_sku="LIST-FA-PROD-005",
            item_name_snapshot=str(listings["sunscreen"].title),
            brand_name_snapshot=str(listings["sunscreen"].brand_name),
            category_name_snapshot=str(listings["sunscreen"].category_name),
            ean_code_snapshot=str(listings["sunscreen"].ean_code),
            storage_location_snapshot=str(inventory["sunscreen"].storage_location),
            quantity=1,
            unit_price=money("56.90"),
            line_total=money("56.90"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=True,
            picked_at_label="11/06/2026 08:13 UTC",
        ),
        OrderItem(
            id=seed_uuid("order-item-1004-diapers"),
            order_id=orders["online_cancelled_refunded"].id,
            inventory_item_id=inventory["diapers"].id,
            marketplace_listing_id=listings["diapers"].id,
            item_sku="LIST-FA-PROD-006",
            item_name_snapshot=str(listings["diapers"].title),
            brand_name_snapshot=str(listings["diapers"].brand_name),
            category_name_snapshot=str(listings["diapers"].category_name),
            ean_code_snapshot=str(listings["diapers"].ean_code),
            storage_location_snapshot=str(inventory["diapers"].storage_location),
            quantity=1,
            unit_price=money("70.71"),
            line_total=money("70.71"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=False,
            picked_at_label="",
        ),
        OrderItem(
            id=seed_uuid("order-item-1005-amoxicillin"),
            order_id=orders["online_prescription_pending"].id,
            inventory_item_id=inventory["amoxicillin"].id,
            marketplace_listing_id=listings["amoxicillin"].id,
            item_sku="LIST-FA-PROD-002",
            item_name_snapshot=str(listings["amoxicillin"].title),
            brand_name_snapshot=str(listings["amoxicillin"].brand_name),
            category_name_snapshot=str(listings["amoxicillin"].category_name),
            ean_code_snapshot=str(listings["amoxicillin"].ean_code),
            storage_location_snapshot=str(inventory["amoxicillin"].storage_location),
            quantity=1,
            unit_price=money("33.50"),
            line_total=money("33.50"),
            requires_prescription_upload=True,
            prescription_status="pending",
            picked_for_fulfillment=False,
            picked_at_label="",
        ),
        OrderItem(
            id=seed_uuid("order-item-1005-dipyrone"),
            order_id=orders["online_prescription_pending"].id,
            inventory_item_id=inventory["dipyrone"].id,
            marketplace_listing_id=listings["dipyrone"].id,
            item_sku="LIST-FA-PROD-007",
            item_name_snapshot=str(listings["dipyrone"].title),
            brand_name_snapshot=str(listings["dipyrone"].brand_name),
            category_name_snapshot=str(listings["dipyrone"].category_name),
            ean_code_snapshot=str(listings["dipyrone"].ean_code),
            storage_location_snapshot=str(inventory["dipyrone"].storage_location),
            quantity=1,
            unit_price=money("14.90"),
            line_total=money("14.90"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=False,
            picked_at_label="",
        ),
        OrderItem(
            id=seed_uuid("order-item-1005-simethicone"),
            order_id=orders["online_prescription_pending"].id,
            inventory_item_id=inventory["simethicone"].id,
            marketplace_listing_id=listings["simethicone"].id,
            item_sku="LIST-FA-PROD-010",
            item_name_snapshot=str(listings["simethicone"].title),
            brand_name_snapshot=str(listings["simethicone"].brand_name),
            category_name_snapshot=str(listings["simethicone"].category_name),
            ean_code_snapshot=str(listings["simethicone"].ean_code),
            storage_location_snapshot=str(inventory["simethicone"].storage_location),
            quantity=1,
            unit_price=money("16.90"),
            line_total=money("16.90"),
            requires_prescription_upload=False,
            prescription_status="none",
            picked_for_fulfillment=False,
            picked_at_label="",
        ),
    ]

    fulfillments = [
        OrderFulfillment(
            id=seed_uuid("fulfillment-1001"),
            order_id=orders["online_delivered"].id,
            fulfillment_type="delivery",
            store_label=STORE_NAME,
            pickup_code="",
            recipient_name=customers["mariana"].full_name,
            recipient_document_snapshot=customers["mariana"].cpf,
            recipient_phone=customers["mariana"].phone,
            address_line=addresses[seed_uuid("address-mariana-home")].street_line,
            district=addresses[seed_uuid("address-mariana-home")].district,
            city=addresses[seed_uuid("address-mariana-home")].city,
            state_code=addresses[seed_uuid("address-mariana-home")].state_code,
            postal_code=addresses[seed_uuid("address-mariana-home")].postal_code,
            reference_note=addresses[seed_uuid("address-mariana-home")].reference_note,
            latitude=delivery_points["mariana"][0],
            longitude=delivery_points["mariana"][1],
            route_distance_km=money("1.80"),
            route_sequence=1,
            sla_target_minutes=90,
            eta_label="15 min restantes",
            ready_at_label="09/06/2026 14:36 UTC",
            dispatched_at_label="09/06/2026 14:47 UTC",
            delivered_at_label="09/06/2026 15:11 UTC",
            picked_up_at_label="",
            driver_name="Rota Farmaura 01",
            driver_phone="+55 61 98800-1001",
        ),
        OrderFulfillment(
            id=seed_uuid("fulfillment-1002"),
            order_id=orders["online_in_transit"].id,
            fulfillment_type="delivery",
            store_label=STORE_NAME,
            pickup_code="",
            recipient_name=customers["rafael"].full_name,
            recipient_document_snapshot=customers["rafael"].cpf,
            recipient_phone=customers["rafael"].phone,
            address_line=addresses[seed_uuid("address-rafael-home")].street_line,
            district=addresses[seed_uuid("address-rafael-home")].district,
            city=addresses[seed_uuid("address-rafael-home")].city,
            state_code=addresses[seed_uuid("address-rafael-home")].state_code,
            postal_code=addresses[seed_uuid("address-rafael-home")].postal_code,
            reference_note=addresses[seed_uuid("address-rafael-home")].reference_note,
            latitude=delivery_points["rafael"][0],
            longitude=delivery_points["rafael"][1],
            route_distance_km=money("2.35"),
            route_sequence=1,
            sla_target_minutes=90,
            eta_label="Chega entre 09:15 e 09:25",
            ready_at_label="11/06/2026 08:33 UTC",
            dispatched_at_label="11/06/2026 08:48 UTC",
            delivered_at_label="",
            picked_up_at_label="",
            driver_name="Rota Farmaura 02",
            driver_phone="+55 61 98800-1002",
        ),
        OrderFulfillment(
            id=seed_uuid("fulfillment-1003"),
            order_id=orders["online_pickup_ready"].id,
            fulfillment_type="pickup",
            store_label=STORE_NAME,
            pickup_code="PICK-3409",
            recipient_name=customers["camila"].full_name,
            recipient_document_snapshot=customers["camila"].cpf,
            recipient_phone=customers["camila"].phone,
            address_line=STORE_ADDRESS,
            district="Ponte Alta Norte",
            city="Gama",
            state_code="DF",
            postal_code="72426-070",
            reference_note="Locker 03",
            latitude=STORE_LATITUDE,
            longitude=STORE_LONGITUDE,
            route_distance_km=money("0.00"),
            route_sequence=0,
            sla_target_minutes=45,
            eta_label="Disponivel para retirada",
            ready_at_label="11/06/2026 08:19 UTC",
            dispatched_at_label="",
            delivered_at_label="",
            picked_up_at_label="",
            driver_name="",
            driver_phone="",
        ),
        OrderFulfillment(
            id=seed_uuid("fulfillment-1004"),
            order_id=orders["online_cancelled_refunded"].id,
            fulfillment_type="delivery",
            store_label=STORE_NAME,
            pickup_code="",
            recipient_name=customers["bianca"].full_name,
            recipient_document_snapshot=customers["bianca"].cpf,
            recipient_phone=customers["bianca"].phone,
            address_line=addresses[seed_uuid("address-bianca-home")].street_line,
            district=addresses[seed_uuid("address-bianca-home")].district,
            city=addresses[seed_uuid("address-bianca-home")].city,
            state_code=addresses[seed_uuid("address-bianca-home")].state_code,
            postal_code=addresses[seed_uuid("address-bianca-home")].postal_code,
            reference_note=addresses[seed_uuid("address-bianca-home")].reference_note,
            latitude=delivery_points["bianca"][0],
            longitude=delivery_points["bianca"][1],
            route_distance_km=money("2.90"),
            route_sequence=0,
            sla_target_minutes=90,
            eta_label="Cancelado",
            ready_at_label="08/06/2026 19:25 UTC",
            dispatched_at_label="",
            delivered_at_label="",
            picked_up_at_label="",
            driver_name="",
            driver_phone="",
        ),
        OrderFulfillment(
            id=seed_uuid("fulfillment-1005"),
            order_id=orders["online_prescription_pending"].id,
            fulfillment_type="delivery",
            store_label=STORE_NAME,
            pickup_code="",
            recipient_name=customers["lucas"].full_name,
            recipient_document_snapshot=customers["lucas"].cpf,
            recipient_phone=customers["lucas"].phone,
            address_line=addresses[seed_uuid("address-lucas-home")].street_line,
            district=addresses[seed_uuid("address-lucas-home")].district,
            city=addresses[seed_uuid("address-lucas-home")].city,
            state_code=addresses[seed_uuid("address-lucas-home")].state_code,
            postal_code=addresses[seed_uuid("address-lucas-home")].postal_code,
            reference_note=addresses[seed_uuid("address-lucas-home")].reference_note,
            latitude=delivery_points["lucas"][0],
            longitude=delivery_points["lucas"][1],
            route_distance_km=money("1.95"),
            route_sequence=0,
            sla_target_minutes=90,
            eta_label="Aguardando validacao de receita",
            ready_at_label="",
            dispatched_at_label="",
            delivered_at_label="",
            picked_up_at_label="",
            driver_name="",
            driver_phone="",
        ),
    ]

    events = [
        OrderStatusEvent(
            id=seed_uuid("order-event-1001-new"),
            order_id=orders["online_delivered"].id,
            actor_user_id=None,
            event_type="created",
            source_channel="marketplace",
            from_status="draft",
            to_status="new",
            actor_name_snapshot="Marketplace",
            actor_role_snapshot="system",
            occurred_at_label="09/06/2026 14:12 UTC",
            notes="Pedido recebido pelo checkout.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1001-separating"),
            order_id=orders["online_delivered"].id,
            actor_user_id=seed_uuid("user-pharmacist-support"),
            event_type="status_change",
            source_channel="internal",
            from_status="new",
            to_status="separating",
            actor_name_snapshot="Dra. Paula Sena",
            actor_role_snapshot="pharmacist",
            occurred_at_label="09/06/2026 14:24 UTC",
            notes="Separacao iniciada no picking 01.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1001-ready"),
            order_id=orders["online_delivered"].id,
            actor_user_id=seed_uuid("user-pharmacist-support"),
            event_type="status_change",
            source_channel="internal",
            from_status="separating",
            to_status="ready",
            actor_name_snapshot="Dra. Paula Sena",
            actor_role_snapshot="pharmacist",
            occurred_at_label="09/06/2026 14:36 UTC",
            notes="Pedido pronto para expedição.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1001-dispatched"),
            order_id=orders["online_delivered"].id,
            actor_user_id=seed_uuid("user-admin"),
            event_type="dispatch",
            source_channel="internal",
            from_status="ready",
            to_status="dispatched",
            actor_name_snapshot="Adriana Lima",
            actor_role_snapshot="admin",
            occurred_at_label="09/06/2026 14:47 UTC",
            notes="Saiu na rota 01.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1001-delivered"),
            order_id=orders["online_delivered"].id,
            actor_user_id=seed_uuid("user-admin"),
            event_type="status_change",
            source_channel="internal",
            from_status="dispatched",
            to_status="delivered",
            actor_name_snapshot="Adriana Lima",
            actor_role_snapshot="admin",
            occurred_at_label="09/06/2026 15:11 UTC",
            notes="Entrega confirmada pela recepção.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1002-created"),
            order_id=orders["online_in_transit"].id,
            actor_user_id=None,
            event_type="created",
            source_channel="marketplace",
            from_status="draft",
            to_status="new",
            actor_name_snapshot="Marketplace",
            actor_role_snapshot="system",
            occurred_at_label="11/06/2026 08:05 UTC",
            notes="Pedido prioritario com pagamento PIX.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1002-dispatched"),
            order_id=orders["online_in_transit"].id,
            actor_user_id=seed_uuid("user-admin"),
            event_type="dispatch",
            source_channel="internal",
            from_status="ready",
            to_status="dispatched",
            actor_name_snapshot="Adriana Lima",
            actor_role_snapshot="admin",
            occurred_at_label="11/06/2026 08:48 UTC",
            notes="Rota 02 despachada.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1003-ready"),
            order_id=orders["online_pickup_ready"].id,
            actor_user_id=seed_uuid("user-pharmacist-support"),
            event_type="status_change",
            source_channel="internal",
            from_status="separating",
            to_status="ready",
            actor_name_snapshot="Dra. Paula Sena",
            actor_role_snapshot="pharmacist",
            occurred_at_label="11/06/2026 08:19 UTC",
            notes="Disponivel para retirada no locker 03.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1004-cancelled"),
            order_id=orders["online_cancelled_refunded"].id,
            actor_user_id=seed_uuid("user-admin"),
            event_type="cancellation",
            source_channel="internal",
            from_status="new",
            to_status="cancelled",
            actor_name_snapshot="Adriana Lima",
            actor_role_snapshot="admin",
            occurred_at_label="08/06/2026 19:32 UTC",
            notes="Estoque reservado liberado e PIX estornado.",
        ),
        OrderStatusEvent(
            id=seed_uuid("order-event-1005-awaiting-rx"),
            order_id=orders["online_prescription_pending"].id,
            actor_user_id=seed_uuid("user-pharmacist-lead"),
            event_type="prescription_review",
            source_channel="internal",
            from_status="new",
            to_status="new",
            actor_name_snapshot="Dra. Helena Rocha",
            actor_role_snapshot="pharmacist",
            occurred_at_label="11/06/2026 09:01 UTC",
            notes="Checklist iniciado; aguardando legibilidade da segunda pagina.",
        ),
    ]

    return {
        "orders": orders,
        "items": order_items,
        "fulfillments": fulfillments,
        "events": events,
    }


def build_logistics(users: dict[str, User], customers: dict[str, Customer], orders_data: dict[str, dict[str, object] | list[object]]) -> dict[str, list[object]]:
    """Build delivery routes and route stops around the pharmacy coordinates."""

    orders = orders_data["orders"]
    fulfillments = {
        fulfillment.order_id: fulfillment
        for fulfillment in orders_data["fulfillments"]
        if isinstance(fulfillment, OrderFulfillment)
    }

    route_completed = DeliveryRoute(
        id=seed_uuid("route-completed"),
        tenant_id=TENANT_ID,
        store_id=STORE_ID,
        driver_user_id=users["admin"].id,
        route_code="ROT-1001",
        route_status="completed",
        driver_name_snapshot="Adriana Lima",
        vehicle_label="Moto 01",
        origin_name=STORE_NAME,
        origin_address=STORE_ADDRESS,
        origin_latitude=STORE_LATITUDE,
        origin_longitude=STORE_LONGITUDE,
        stop_count=1,
        total_distance_km=money("1.80"),
        saved_distance_km=money("0.40"),
        estimated_duration_minutes=32,
        route_provider="seed-routing",
        route_polyline="enc:seed-rot-1001",
        planned_at_label="09/06/2026 14:40 UTC",
        dispatched_at_label="09/06/2026 14:47 UTC",
        completed_at_label="09/06/2026 15:18 UTC",
    )

    route_active = DeliveryRoute(
        id=seed_uuid("route-active"),
        tenant_id=TENANT_ID,
        store_id=STORE_ID,
        driver_user_id=users["admin"].id,
        route_code="ROT-1002",
        route_status="dispatched",
        driver_name_snapshot="Adriana Lima",
        vehicle_label="Moto 02",
        origin_name=STORE_NAME,
        origin_address=STORE_ADDRESS,
        origin_latitude=STORE_LATITUDE,
        origin_longitude=STORE_LONGITUDE,
        stop_count=2,
        total_distance_km=money("4.60"),
        saved_distance_km=money("0.90"),
        estimated_duration_minutes=54,
        route_provider="seed-routing",
        route_polyline="enc:seed-rot-1002",
        planned_at_label="11/06/2026 08:36 UTC",
        dispatched_at_label="11/06/2026 08:48 UTC",
        completed_at_label="",
    )

    stops = [
        DeliveryRouteStop(
            id=seed_uuid("route-stop-1001"),
            route_id=route_completed.id,
            order_id=orders["online_delivered"].id,
            order_fulfillment_id=fulfillments[orders["online_delivered"].id].id,
            stop_sequence=1,
            stop_status="delivered",
            customer_name_snapshot=customers["mariana"].full_name,
            address_line_snapshot=fulfillments[orders["online_delivered"].id].address_line,
            district_snapshot=fulfillments[orders["online_delivered"].id].district,
            postal_code_snapshot=fulfillments[orders["online_delivered"].id].postal_code,
            latitude=fulfillments[orders["online_delivered"].id].latitude,
            longitude=fulfillments[orders["online_delivered"].id].longitude,
            distance_from_origin_km=money("1.80"),
            estimated_arrival_label="09/06/2026 15:18 UTC",
            arrived_at_label="09/06/2026 15:08 UTC",
            delivered_at_label="09/06/2026 15:11 UTC",
            navigation_url="https://maps.google.com/?q=-15.9723010,-48.0311000",
        ),
        DeliveryRouteStop(
            id=seed_uuid("route-stop-1002"),
            route_id=route_active.id,
            order_id=orders["online_in_transit"].id,
            order_fulfillment_id=fulfillments[orders["online_in_transit"].id].id,
            stop_sequence=1,
            stop_status="en_route",
            customer_name_snapshot=customers["rafael"].full_name,
            address_line_snapshot=fulfillments[orders["online_in_transit"].id].address_line,
            district_snapshot=fulfillments[orders["online_in_transit"].id].district,
            postal_code_snapshot=fulfillments[orders["online_in_transit"].id].postal_code,
            latitude=fulfillments[orders["online_in_transit"].id].latitude,
            longitude=fulfillments[orders["online_in_transit"].id].longitude,
            distance_from_origin_km=money("2.35"),
            estimated_arrival_label="11/06/2026 09:20 UTC",
            arrived_at_label="",
            delivered_at_label="",
            navigation_url="https://maps.google.com/?q=-15.9748500,-48.0501000",
        ),
        DeliveryRouteStop(
            id=seed_uuid("route-stop-1005"),
            route_id=route_active.id,
            order_id=orders["online_prescription_pending"].id,
            order_fulfillment_id=fulfillments[orders["online_prescription_pending"].id].id,
            stop_sequence=2,
            stop_status="planned",
            customer_name_snapshot=customers["lucas"].full_name,
            address_line_snapshot=fulfillments[orders["online_prescription_pending"].id].address_line,
            district_snapshot=fulfillments[orders["online_prescription_pending"].id].district,
            postal_code_snapshot=fulfillments[orders["online_prescription_pending"].id].postal_code,
            latitude=fulfillments[orders["online_prescription_pending"].id].latitude,
            longitude=fulfillments[orders["online_prescription_pending"].id].longitude,
            distance_from_origin_km=money("1.95"),
            estimated_arrival_label="11/06/2026 10:05 UTC",
            arrived_at_label="",
            delivered_at_label="",
            navigation_url="https://maps.google.com/?q=-15.9819500,-48.0445000",
        ),
    ]

    return {
        "routes": [route_completed, route_active],
        "stops": stops,
    }


def build_pdv(users: dict[str, User], customers: dict[str, Customer], catalog: dict[str, dict[str, object]]) -> dict[str, dict[str, object] | list[object]]:
    """Build in-store PDV orders, finalized sales, and sales lines."""

    inventory = catalog["inventory"]
    listings = catalog["listings"]

    orders = {
        "queue_open": PdvOrder(
            id=seed_uuid("pdv-order-open"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            order_code="PV-2001",
            customer_id=customers["lucas"].id,
            pharmacist_user_id=users["pharmacist_support"].id,
            cashier_user_id=None,
            order_status="queued",
            service_role="pharmacist",
            customer_display_name=customers["lucas"].full_name,
            customer_document_snapshot=customers["lucas"].cpf,
            customer_phone_snapshot=customers["lucas"].phone,
            includes_controlled_items=False,
            include_cpf_on_invoice=True,
            discount_percent=money("0.00"),
            cashback_applied_amount=money("0.00"),
            subtotal_amount=money("79.80"),
            discount_amount=money("0.00"),
            total_amount=money("79.80"),
            queued_at_label="11/06/2026 08:42 UTC",
            claimed_at_label="",
            completed_at_label="",
            notes="Cliente aguardando montagem no balcão.",
        ),
        "completed_sale": PdvOrder(
            id=seed_uuid("pdv-order-completed"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            order_code="PV-2002",
            customer_id=customers["mariana"].id,
            pharmacist_user_id=users["pharmacist_support"].id,
            cashier_user_id=users["cashier_lead"].id,
            order_status="completed",
            service_role="cashier",
            customer_display_name=customers["mariana"].full_name,
            customer_document_snapshot=customers["mariana"].cpf,
            customer_phone_snapshot=customers["mariana"].phone,
            includes_controlled_items=False,
            include_cpf_on_invoice=True,
            discount_percent=money("5.00"),
            cashback_applied_amount=money("10.00"),
            subtotal_amount=money("94.80"),
            discount_amount=money("4.74"),
            total_amount=money("80.06"),
            queued_at_label="10/06/2026 17:05 UTC",
            claimed_at_label="10/06/2026 17:12 UTC",
            completed_at_label="10/06/2026 17:24 UTC",
            notes="Venda presencial concluida com resgate de cashback.",
        ),
        "refunded_sale": PdvOrder(
            id=seed_uuid("pdv-order-refunded"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            order_code="PV-2003",
            customer_id=customers["bianca"].id,
            pharmacist_user_id=users["pharmacist_support"].id,
            cashier_user_id=users["cashier_support"].id,
            order_status="refunded",
            service_role="cashier",
            customer_display_name=customers["bianca"].full_name,
            customer_document_snapshot=customers["bianca"].cpf,
            customer_phone_snapshot=customers["bianca"].phone,
            includes_controlled_items=False,
            include_cpf_on_invoice=True,
            discount_percent=money("0.00"),
            cashback_applied_amount=money("0.00"),
            subtotal_amount=money("16.90"),
            discount_amount=money("0.00"),
            total_amount=money("16.90"),
            queued_at_label="09/06/2026 10:05 UTC",
            claimed_at_label="09/06/2026 10:07 UTC",
            completed_at_label="09/06/2026 10:42 UTC",
            notes="Produto devolvido por avaria da embalagem.",
        ),
    }

    order_items = [
        PdvOrderItem(
            id=seed_uuid("pdv-order-item-open-1"),
            pdv_order_id=orders["queue_open"].id,
            inventory_item_id=inventory["clonazepam"].id,
            marketplace_listing_id=listings["clonazepam"].id,
            item_name_snapshot=str(inventory["clonazepam"].name),
            brand_name_snapshot=str(inventory["clonazepam"].brand_name),
            ean_code_snapshot=str(inventory["clonazepam"].ean_code),
            storage_location_snapshot=str(inventory["clonazepam"].storage_location),
            quantity=2,
            unit_price=money("19.90"),
            line_total=money("39.80"),
        ),
        PdvOrderItem(
            id=seed_uuid("pdv-order-item-open-2"),
            pdv_order_id=orders["queue_open"].id,
            inventory_item_id=inventory["dipyrone"].id,
            marketplace_listing_id=listings["dipyrone"].id,
            item_name_snapshot=str(inventory["dipyrone"].name),
            brand_name_snapshot=str(inventory["dipyrone"].brand_name),
            ean_code_snapshot=str(inventory["dipyrone"].ean_code),
            storage_location_snapshot=str(inventory["dipyrone"].storage_location),
            quantity=2,
            unit_price=money("14.90"),
            line_total=money("29.80"),
        ),
        PdvOrderItem(
            id=seed_uuid("pdv-order-item-completed-1"),
            pdv_order_id=orders["completed_sale"].id,
            inventory_item_id=inventory["vitamin_c"].id,
            marketplace_listing_id=listings["vitamin_c"].id,
            item_name_snapshot=str(inventory["vitamin_c"].name),
            brand_name_snapshot=str(inventory["vitamin_c"].brand_name),
            ean_code_snapshot=str(inventory["vitamin_c"].ean_code),
            storage_location_snapshot=str(inventory["vitamin_c"].storage_location),
            quantity=2,
            unit_price=money("24.50"),
            line_total=money("49.00"),
        ),
        PdvOrderItem(
            id=seed_uuid("pdv-order-item-completed-2"),
            pdv_order_id=orders["completed_sale"].id,
            inventory_item_id=inventory["dipyrone"].id,
            marketplace_listing_id=listings["dipyrone"].id,
            item_name_snapshot=str(inventory["dipyrone"].name),
            brand_name_snapshot=str(inventory["dipyrone"].brand_name),
            ean_code_snapshot=str(inventory["dipyrone"].ean_code),
            storage_location_snapshot=str(inventory["dipyrone"].storage_location),
            quantity=2,
            unit_price=money("14.90"),
            line_total=money("29.80"),
        ),
        PdvOrderItem(
            id=seed_uuid("pdv-order-item-refunded-1"),
            pdv_order_id=orders["refunded_sale"].id,
            inventory_item_id=inventory["simethicone"].id,
            marketplace_listing_id=listings["simethicone"].id,
            item_name_snapshot=str(inventory["simethicone"].name),
            brand_name_snapshot=str(inventory["simethicone"].brand_name),
            ean_code_snapshot=str(inventory["simethicone"].ean_code),
            storage_location_snapshot=str(inventory["simethicone"].storage_location),
            quantity=1,
            unit_price=money("16.90"),
            line_total=money("16.90"),
        ),
    ]

    sales = {
        "completed": PdvSale(
            id=seed_uuid("pdv-sale-completed"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            sale_code="PS-3001",
            pdv_order_id=orders["completed_sale"].id,
            customer_id=customers["mariana"].id,
            cashier_user_id=users["cashier_lead"].id,
            pharmacist_user_id=users["pharmacist_support"].id,
            payment_method="debit_card",
            payment_status="paid",
            sale_status="completed",
            include_cpf_on_invoice=True,
            customer_display_name=customers["mariana"].full_name,
            customer_document_snapshot=customers["mariana"].cpf,
            subtotal_amount=money("94.80"),
            discount_amount=money("4.74"),
            cashback_applied_amount=money("10.00"),
            cashback_earned_amount=money("4.00"),
            total_amount=money("80.06"),
            completed_at_label="10/06/2026 17:24 UTC",
        ),
        "refunded": PdvSale(
            id=seed_uuid("pdv-sale-refunded"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            sale_code="PS-3002",
            pdv_order_id=orders["refunded_sale"].id,
            customer_id=customers["bianca"].id,
            cashier_user_id=users["cashier_support"].id,
            pharmacist_user_id=users["pharmacist_support"].id,
            payment_method="pix",
            payment_status="refunded",
            sale_status="refunded",
            include_cpf_on_invoice=True,
            customer_display_name=customers["bianca"].full_name,
            customer_document_snapshot=customers["bianca"].cpf,
            subtotal_amount=money("16.90"),
            discount_amount=money("0.00"),
            cashback_applied_amount=money("0.00"),
            cashback_earned_amount=money("0.84"),
            total_amount=money("16.90"),
            completed_at_label="09/06/2026 10:42 UTC",
        ),
    }

    sale_items = [
        PdvSaleItem(
            id=seed_uuid("pdv-sale-item-3001-1"),
            pdv_sale_id=sales["completed"].id,
            inventory_item_id=inventory["vitamin_c"].id,
            item_name_snapshot=str(inventory["vitamin_c"].name),
            brand_name_snapshot=str(inventory["vitamin_c"].brand_name),
            storage_location_snapshot=str(inventory["vitamin_c"].storage_location),
            quantity=2,
            unit_price=money("24.50"),
            line_total=money("49.00"),
            is_controlled=False,
        ),
        PdvSaleItem(
            id=seed_uuid("pdv-sale-item-3001-2"),
            pdv_sale_id=sales["completed"].id,
            inventory_item_id=inventory["dipyrone"].id,
            item_name_snapshot=str(inventory["dipyrone"].name),
            brand_name_snapshot=str(inventory["dipyrone"].brand_name),
            storage_location_snapshot=str(inventory["dipyrone"].storage_location),
            quantity=2,
            unit_price=money("14.90"),
            line_total=money("29.80"),
            is_controlled=False,
        ),
        PdvSaleItem(
            id=seed_uuid("pdv-sale-item-3002-1"),
            pdv_sale_id=sales["refunded"].id,
            inventory_item_id=inventory["simethicone"].id,
            item_name_snapshot=str(inventory["simethicone"].name),
            brand_name_snapshot=str(inventory["simethicone"].brand_name),
            storage_location_snapshot=str(inventory["simethicone"].storage_location),
            quantity=1,
            unit_price=money("16.90"),
            line_total=money("16.90"),
            is_controlled=False,
        ),
    ]

    return {
        "orders": orders,
        "items": order_items,
        "sales": sales,
        "sale_items": sale_items,
    }


def build_fiscal_documents(
    users: dict[str, User],
    customers: dict[str, Customer],
    orders_data: dict[str, dict[str, object] | list[object]],
    pdv_data: dict[str, dict[str, object] | list[object]],
) -> list[FiscalDocument]:
    """Build fiscal documents for online and in-store paid transactions."""

    orders = orders_data["orders"]
    sales = pdv_data["sales"]

    return [
        FiscalDocument(
            id=seed_uuid("fiscal-online-1001"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            document_type="nfce",
            source_channel="marketplace",
            pdv_sale_id=None,
            order_id=orders["online_delivered"].id,
            issued_by_user_id=users["cashier_lead"].id,
            customer_id=customers["mariana"].id,
            document_number="51001",
            access_key="35260612345678000123550010000510011000051001",
            series_code="001",
            issue_datetime_label="09/06/2026 15:16 UTC",
            payment_method_snapshot="credit_card",
            recipient_name_snapshot=customers["mariana"].full_name,
            recipient_document_snapshot=customers["mariana"].cpf,
            gross_total_amount=money("83.24"),
            approximate_tax_amount=money("8.12"),
            authorized=True,
        ),
        FiscalDocument(
            id=seed_uuid("fiscal-pdv-3001"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            document_type="nfce",
            source_channel="pdv",
            pdv_sale_id=sales["completed"].id,
            order_id=None,
            issued_by_user_id=users["cashier_lead"].id,
            customer_id=customers["mariana"].id,
            document_number="51002",
            access_key="35260612345678000123550010000510021000051002",
            series_code="001",
            issue_datetime_label="10/06/2026 17:26 UTC",
            payment_method_snapshot="debit_card",
            recipient_name_snapshot=customers["mariana"].full_name,
            recipient_document_snapshot=customers["mariana"].cpf,
            gross_total_amount=money("80.06"),
            approximate_tax_amount=money("6.84"),
            authorized=True,
        ),
        FiscalDocument(
            id=seed_uuid("fiscal-pdv-3002"),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            document_type="nfce",
            source_channel="pdv",
            pdv_sale_id=sales["refunded"].id,
            order_id=None,
            issued_by_user_id=users["cashier_support"].id,
            customer_id=customers["bianca"].id,
            document_number="51003",
            access_key="35260612345678000123550010000510031000051003",
            series_code="001",
            issue_datetime_label="09/06/2026 10:44 UTC",
            payment_method_snapshot="pix",
            recipient_name_snapshot=customers["bianca"].full_name,
            recipient_document_snapshot=customers["bianca"].cpf,
            gross_total_amount=money("16.90"),
            approximate_tax_amount=money("1.42"),
            authorized=True,
        ),
    ]


def build_prescriptions(
    users: dict[str, User],
    orders_data: dict[str, dict[str, object] | list[object]],
    customers: dict[str, Customer],
    catalog: dict[str, dict[str, object]],
) -> dict[str, list[object]]:
    """Build prescription uploads, checks, items, and private file assets."""

    orders = orders_data["orders"]
    order_items = {item.id: item for item in orders_data["items"] if isinstance(item, OrderItem)}
    inventory = catalog["inventory"]
    listings = catalog["listings"]

    file_assets = [
        FileAsset(
            id=seed_uuid("file-rx-1005-page-1"),
            tenant_id=TENANT_ID,
            owner_user_id=users["customer_lucas"].id,
            original_name="receita-lucas-pagina-1.jpg",
            storage_key="seed/prescriptions/rx-1005-page-1.jpg",
            content_type="image/jpeg",
            size_bytes=284512,
            status=FileStatus.ACCEPTED.value,
        ),
        FileAsset(
            id=seed_uuid("file-rx-1005-page-2"),
            tenant_id=TENANT_ID,
            owner_user_id=users["customer_lucas"].id,
            original_name="receita-lucas-pagina-2.jpg",
            storage_key="seed/prescriptions/rx-1005-page-2.jpg",
            content_type="image/jpeg",
            size_bytes=265104,
            status=FileStatus.ACCEPTED.value,
        ),
        FileAsset(
            id=seed_uuid("file-chat-1005-photo"),
            tenant_id=TENANT_ID,
            owner_user_id=users["customer_lucas"].id,
            original_name="foto-da-caixinha.jpg",
            storage_key="seed/chat/1005-photo.jpg",
            content_type="image/jpeg",
            size_bytes=194208,
            status=FileStatus.ACCEPTED.value,
        ),
    ]

    prescriptions = [
        Prescription(
            id=seed_uuid("prescription-1005"),
            tenant_id=TENANT_ID,
            customer_id=customers["lucas"].id,
            order_id=orders["online_prescription_pending"].id,
            reviewed_by_user_id=users["pharmacist_lead"].id,
            prescription_code="RX-1005",
            source_channel="marketplace",
            status="pending",
            patient_name_snapshot=customers["lucas"].full_name,
            patient_document_snapshot=customers["lucas"].cpf,
            patient_age_years=39,
            patient_phone_snapshot=customers["lucas"].phone,
            doctor_name="Dra. Priscila Monteiro",
            doctor_license_number="CRM-DF 45871",
            prescription_type="Controle simples",
            issued_on_label="10/06/2026",
            remaining_validity_days=27,
            submitted_at_label="11/06/2026 08:55 UTC",
            reviewed_at_label="11/06/2026 09:01 UTC",
            pharmacist_notes="Segunda pagina com assinatura parcialmente encoberta.",
            rejection_reason="",
            has_controlled_medication=False,
            requires_retention=False,
        )
    ]

    prescription_files = [
        PrescriptionFile(
            id=seed_uuid("prescription-file-1005-1"),
            prescription_id=prescriptions[0].id,
            file_asset_id=file_assets[0].id,
            page_order=1,
            original_name_snapshot=file_assets[0].original_name,
            content_type_snapshot=file_assets[0].content_type,
            is_primary=True,
        ),
        PrescriptionFile(
            id=seed_uuid("prescription-file-1005-2"),
            prescription_id=prescriptions[0].id,
            file_asset_id=file_assets[1].id,
            page_order=2,
            original_name_snapshot=file_assets[1].original_name,
            content_type_snapshot=file_assets[1].content_type,
            is_primary=False,
        ),
    ]

    checks = [
        PrescriptionCheck(
            id=seed_uuid("prescription-check-1005-date"),
            prescription_id=prescriptions[0].id,
            check_key="valid_issue_date",
            check_label="Data de emissao dentro da validade",
            is_passed=True,
            note="Receita emitida no dia anterior.",
        ),
        PrescriptionCheck(
            id=seed_uuid("prescription-check-1005-signature"),
            prescription_id=prescriptions[0].id,
            check_key="doctor_signature",
            check_label="Assinatura e carimbo legiveis",
            is_passed=False,
            note="Assinatura da pagina 2 nao esta totalmente visivel.",
        ),
        PrescriptionCheck(
            id=seed_uuid("prescription-check-1005-item-match"),
            prescription_id=prescriptions[0].id,
            check_key="requested_item_match",
            check_label="Medicamento solicitado corresponde a receita",
            is_passed=True,
            note="Amoxicilina 500mg corresponde ao pedido.",
        ),
    ]

    items = [
        PrescriptionItem(
            id=seed_uuid("prescription-item-1005-amoxicillin"),
            prescription_id=prescriptions[0].id,
            order_item_id=seed_uuid("order-item-1005-amoxicillin"),
            inventory_item_id=inventory["amoxicillin"].id,
            marketplace_listing_id=listings["amoxicillin"].id,
            medication_name=str(inventory["amoxicillin"].name),
            dosage_instructions="1 capsula a cada 8 horas por 7 dias.",
            prescribed_quantity_label="1 caixa",
            matches_requested_item=True,
            pharmacist_note="Sem divergencias de dosagem.",
        )
    ]

    return {
        "file_assets": file_assets,
        "prescriptions": prescriptions,
        "prescription_files": prescription_files,
        "checks": checks,
        "items": items,
    }


def build_saved_and_subscriptions(customers: dict[str, Customer], catalog: dict[str, dict[str, object]]) -> dict[str, list[object]]:
    """Build saved products and recurring subscriptions for marketplace accounts."""

    inventory = catalog["inventory"]
    listings = catalog["listings"]

    saved_products = [
        SavedProduct(
            id=seed_uuid("saved-mariana-losartan"),
            tenant_id=TENANT_ID,
            customer_id=customers["mariana"].id,
            marketplace_listing_id=listings["losartan"].id,
            inventory_item_id=inventory["losartan"].id,
            saved_from_channel="marketplace",
            product_name_snapshot=str(listings["losartan"].title),
        ),
        SavedProduct(
            id=seed_uuid("saved-mariana-glycemia"),
            tenant_id=TENANT_ID,
            customer_id=customers["mariana"].id,
            marketplace_listing_id=listings["glycemia_strips"].id,
            inventory_item_id=inventory["glycemia_strips"].id,
            saved_from_channel="marketplace",
            product_name_snapshot=str(listings["glycemia_strips"].title),
        ),
        SavedProduct(
            id=seed_uuid("saved-camila-serum"),
            tenant_id=TENANT_ID,
            customer_id=customers["camila"].id,
            marketplace_listing_id=listings["serum"].id,
            inventory_item_id=inventory["serum"].id,
            saved_from_channel="marketplace",
            product_name_snapshot=str(listings["serum"].title),
        ),
        SavedProduct(
            id=seed_uuid("saved-bianca-diapers"),
            tenant_id=TENANT_ID,
            customer_id=customers["bianca"].id,
            marketplace_listing_id=listings["diapers"].id,
            inventory_item_id=inventory["diapers"].id,
            saved_from_channel="marketplace",
            product_name_snapshot=str(listings["diapers"].title),
        ),
    ]

    subscriptions = [
        Subscription(
            id=seed_uuid("subscription-mariana-losartan"),
            tenant_id=TENANT_ID,
            customer_id=customers["mariana"].id,
            marketplace_listing_id=listings["losartan"].id,
            inventory_item_id=inventory["losartan"].id,
            subscription_code="SUB-1001",
            subscription_status="active",
            product_name_snapshot=str(listings["losartan"].title),
            quantity=2,
            frequency_days=30,
            next_cycle_in_days=6,
            next_cycle_date_label="17/06/2026",
            started_at_label="15/03/2026",
            paused_at_label="",
            cancelled_at_label="",
            unit_price_snapshot=money("28.90"),
            discount_percent=money("15.00"),
            is_paused=False,
        ),
        Subscription(
            id=seed_uuid("subscription-lucas-amoxicillin"),
            tenant_id=TENANT_ID,
            customer_id=customers["lucas"].id,
            marketplace_listing_id=listings["amoxicillin"].id,
            inventory_item_id=inventory["amoxicillin"].id,
            subscription_code="SUB-1002",
            subscription_status="paused",
            product_name_snapshot=str(listings["amoxicillin"].title),
            quantity=1,
            frequency_days=45,
            next_cycle_in_days=18,
            next_cycle_date_label="29/06/2026",
            started_at_label="01/02/2026",
            paused_at_label="02/06/2026",
            cancelled_at_label="",
            unit_price_snapshot=money("33.50"),
            discount_percent=money("10.00"),
            is_paused=True,
        ),
        Subscription(
            id=seed_uuid("subscription-rafael-glycemia"),
            tenant_id=TENANT_ID,
            customer_id=customers["rafael"].id,
            marketplace_listing_id=listings["glycemia_strips"].id,
            inventory_item_id=inventory["glycemia_strips"].id,
            subscription_code="SUB-1003",
            subscription_status="active",
            product_name_snapshot=str(listings["glycemia_strips"].title),
            quantity=1,
            frequency_days=30,
            next_cycle_in_days=4,
            next_cycle_date_label="15/06/2026",
            started_at_label="20/01/2026",
            paused_at_label="",
            cancelled_at_label="",
            unit_price_snapshot=money("64.90"),
            discount_percent=money("12.00"),
            is_paused=False,
        ),
    ]

    return {
        "saved_products": saved_products,
        "subscriptions": subscriptions,
    }


def build_cashback(
    customers: dict[str, Customer],
    assets: dict[str, list[object]],
    orders_data: dict[str, dict[str, object] | list[object]],
    pdv_data: dict[str, dict[str, object] | list[object]],
    catalog: dict[str, dict[str, object]],
) -> dict[str, list[object]]:
    """Build cashback ledger movements and explainability lines."""

    wallets = {wallet.customer_id: wallet for wallet in assets["wallets"] if isinstance(wallet, CustomerCashbackWallet)}
    rules = catalog["rules"]
    inventory = catalog["inventory"]
    listings = catalog["listings"]
    orders = orders_data["orders"]
    sales = pdv_data["sales"]

    transactions = [
        CashbackTransaction(
            id=seed_uuid("cashback-mariana-online-earned"),
            tenant_id=TENANT_ID,
            customer_id=customers["mariana"].id,
            wallet_id=wallets[customers["mariana"].id].id,
            transaction_type="earn",
            transaction_status="available",
            source_channel="marketplace",
            source_reference="FA-1001",
            order_id=orders["online_delivered"].id,
            sale_reference="",
            gross_amount=money("4.82"),
            net_amount=money("4.82"),
            wallet_balance_after=money("38.40"),
            granted_at_label="09/06/2026 15:12 UTC",
            available_at_label="09/06/2026 15:12 UTC",
            expires_at_label="07/09/2026",
            notes="Cashback liberado apos entrega concluida.",
        ),
        CashbackTransaction(
            id=seed_uuid("cashback-mariana-pdv-redeem"),
            tenant_id=TENANT_ID,
            customer_id=customers["mariana"].id,
            wallet_id=wallets[customers["mariana"].id].id,
            transaction_type="redeem",
            transaction_status="consumed",
            source_channel="pdv",
            source_reference="PS-3001",
            order_id=None,
            sale_reference=sales["completed"].sale_code,
            gross_amount=money("10.00"),
            net_amount=money("10.00"),
            wallet_balance_after=money("28.40"),
            granted_at_label="10/06/2026 17:24 UTC",
            available_at_label="10/06/2026 17:24 UTC",
            expires_at_label="",
            notes="Resgate presencial aplicado na venda PDV.",
        ),
        CashbackTransaction(
            id=seed_uuid("cashback-mariana-pdv-earned"),
            tenant_id=TENANT_ID,
            customer_id=customers["mariana"].id,
            wallet_id=wallets[customers["mariana"].id].id,
            transaction_type="earn",
            transaction_status="available",
            source_channel="pdv",
            source_reference="PS-3001",
            order_id=None,
            sale_reference=sales["completed"].sale_code,
            gross_amount=money("4.00"),
            net_amount=money("4.00"),
            wallet_balance_after=money("32.40"),
            granted_at_label="10/06/2026 17:24 UTC",
            available_at_label="10/06/2026 17:24 UTC",
            expires_at_label="08/09/2026",
            notes="Cashback ganho em venda presencial.",
        ),
        CashbackTransaction(
            id=seed_uuid("cashback-rafael-online-pending"),
            tenant_id=TENANT_ID,
            customer_id=customers["rafael"].id,
            wallet_id=wallets[customers["rafael"].id].id,
            transaction_type="earn",
            transaction_status="pending",
            source_channel="marketplace",
            source_reference="FA-1002",
            order_id=orders["online_in_transit"].id,
            sale_reference="",
            gross_amount=money("7.51"),
            net_amount=money("7.51"),
            wallet_balance_after=money("26.30"),
            granted_at_label="11/06/2026 08:48 UTC",
            available_at_label="",
            expires_at_label="09/09/2026",
            notes="Cashback sera liberado apos comprovacao da entrega.",
        ),
        CashbackTransaction(
            id=seed_uuid("cashback-bianca-refund-reversal"),
            tenant_id=TENANT_ID,
            customer_id=customers["bianca"].id,
            wallet_id=wallets[customers["bianca"].id].id,
            transaction_type="reverse",
            transaction_status="reversed",
            source_channel="marketplace",
            source_reference="FA-1004",
            order_id=orders["online_cancelled_refunded"].id,
            sale_reference="",
            gross_amount=money("3.20"),
            net_amount=money("3.20"),
            wallet_balance_after=money("0.00"),
            granted_at_label="08/06/2026 19:33 UTC",
            available_at_label="08/06/2026 19:33 UTC",
            expires_at_label="",
            notes="Reversao de cashback aplicado em pedido cancelado.",
        ),
        CashbackTransaction(
            id=seed_uuid("cashback-bianca-pdv-refund"),
            tenant_id=TENANT_ID,
            customer_id=customers["bianca"].id,
            wallet_id=wallets[customers["bianca"].id].id,
            transaction_type="reverse",
            transaction_status="reversed",
            source_channel="pdv",
            source_reference="PS-3002",
            order_id=None,
            sale_reference=sales["refunded"].sale_code,
            gross_amount=money("0.84"),
            net_amount=money("0.84"),
            wallet_balance_after=money("0.00"),
            granted_at_label="09/06/2026 10:42 UTC",
            available_at_label="09/06/2026 10:42 UTC",
            expires_at_label="",
            notes="Cashback estornado por devolucao presencial.",
        ),
        CashbackTransaction(
            id=seed_uuid("cashback-camila-online-earned"),
            tenant_id=TENANT_ID,
            customer_id=customers["camila"].id,
            wallet_id=wallets[customers["camila"].id].id,
            transaction_type="earn",
            transaction_status="available",
            source_channel="marketplace",
            source_reference="FA-1003",
            order_id=orders["online_pickup_ready"].id,
            sale_reference="",
            gross_amount=money("4.80"),
            net_amount=money("4.80"),
            wallet_balance_after=money("4.80"),
            granted_at_label="11/06/2026 08:19 UTC",
            available_at_label="11/06/2026 08:19 UTC",
            expires_at_label="09/09/2026",
            notes="Cashback liberado em retirada preparada.",
        ),
    ]

    lines = [
        CashbackTransactionLine(
            id=seed_uuid("cashback-line-mariana-losartan"),
            transaction_id=transactions[0].id,
            cashback_rule_id=rules["losartan"].id,
            customer_id=customers["mariana"].id,
            inventory_item_id=inventory["losartan"].id,
            marketplace_listing_id=listings["losartan"].id,
            product_reference=str(listings["losartan"].title),
            quantity=2,
            base_amount=money("57.80"),
            cashback_percent=money("6.00"),
            cashback_amount=money("3.47"),
        ),
        CashbackTransactionLine(
            id=seed_uuid("cashback-line-mariana-vitamin-c"),
            transaction_id=transactions[0].id,
            cashback_rule_id=rules["vitamin_c"].id,
            customer_id=customers["mariana"].id,
            inventory_item_id=inventory["vitamin_c"].id,
            marketplace_listing_id=listings["vitamin_c"].id,
            product_reference=str(listings["vitamin_c"].title),
            quantity=1,
            base_amount=money("22.54"),
            cashback_percent=money("10.00"),
            cashback_amount=money("1.35"),
        ),
        CashbackTransactionLine(
            id=seed_uuid("cashback-line-rafael-glycemia"),
            transaction_id=transactions[3].id,
            cashback_rule_id=rules["glycemia_strips"].id,
            customer_id=customers["rafael"].id,
            inventory_item_id=inventory["glycemia_strips"].id,
            marketplace_listing_id=listings["glycemia_strips"].id,
            product_reference=str(listings["glycemia_strips"].title),
            quantity=1,
            base_amount=money("64.90"),
            cashback_percent=money("8.00"),
            cashback_amount=money("5.19"),
        ),
        CashbackTransactionLine(
            id=seed_uuid("cashback-line-rafael-losartan"),
            transaction_id=transactions[3].id,
            cashback_rule_id=rules["losartan"].id,
            customer_id=customers["rafael"].id,
            inventory_item_id=inventory["losartan"].id,
            marketplace_listing_id=listings["losartan"].id,
            product_reference=str(listings["losartan"].title),
            quantity=1,
            base_amount=money("28.90"),
            cashback_percent=money("6.00"),
            cashback_amount=money("2.32"),
        ),
        CashbackTransactionLine(
            id=seed_uuid("cashback-line-camila-serum"),
            transaction_id=transactions[6].id,
            cashback_rule_id=rules["serum"].id,
            customer_id=customers["camila"].id,
            inventory_item_id=inventory["serum"].id,
            marketplace_listing_id=listings["serum"].id,
            product_reference=str(listings["serum"].title),
            quantity=1,
            base_amount=money("83.16"),
            cashback_percent=money("9.00"),
            cashback_amount=money("4.80"),
        ),
    ]

    return {
        "transactions": transactions,
        "lines": lines,
    }


def build_chat(
    users: dict[str, User],
    customers: dict[str, Customer],
    orders_data: dict[str, dict[str, object] | list[object]],
    prescription_data: dict[str, list[object]],
) -> dict[str, list[object]]:
    """Build pharmacist support threads, messages, and message attachments."""

    orders = orders_data["orders"]
    file_assets = {asset.id: asset for asset in prescription_data["file_assets"] if isinstance(asset, FileAsset)}

    threads = [
        ChatThread(
            id=seed_uuid("thread-1005"),
            tenant_id=TENANT_ID,
            order_id=orders["online_prescription_pending"].id,
            customer_id=customers["lucas"].id,
            pharmacist_user_id=users["pharmacist_lead"].id,
            thread_code="CHAT-1005",
            source_channel="marketplace",
            thread_status="open",
            topic="Validacao de receita e orientacao de entrega",
            customer_name_snapshot=customers["lucas"].full_name,
            pharmacist_name_snapshot=users["pharmacist_lead"].full_name,
            order_code_snapshot=orders["online_prescription_pending"].order_code,
            last_message_preview="Enviei tambem a foto da caixinha para ajudar na conferencia.",
            last_message_at_label="11/06/2026 09:07 UTC",
            customer_unread_count=0,
            pharmacist_unread_count=1,
            is_active=True,
        )
    ]

    messages = [
        ChatMessage(
            id=seed_uuid("chat-message-1005-1"),
            thread_id=threads[0].id,
            sender_user_id=None,
            sender_customer_id=customers["lucas"].id,
            message_type="text",
            sender_role="customer",
            sender_name_snapshot=customers["lucas"].full_name,
            body_text="Bom dia, anexei a receita e posso enviar mais fotos se precisar.",
            sent_at_label="11/06/2026 08:56 UTC",
            customer_read=True,
            pharmacist_read=True,
            is_internal_note=False,
        ),
        ChatMessage(
            id=seed_uuid("chat-message-1005-2"),
            thread_id=threads[0].id,
            sender_user_id=users["pharmacist_lead"].id,
            sender_customer_id=None,
            message_type="text",
            sender_role="pharmacist",
            sender_name_snapshot=users["pharmacist_lead"].full_name,
            body_text="Estou conferindo. A segunda pagina ficou um pouco encoberta. Pode mandar outra foto?",
            sent_at_label="11/06/2026 09:02 UTC",
            customer_read=True,
            pharmacist_read=True,
            is_internal_note=False,
        ),
        ChatMessage(
            id=seed_uuid("chat-message-1005-3"),
            thread_id=threads[0].id,
            sender_user_id=None,
            sender_customer_id=customers["lucas"].id,
            message_type="image",
            sender_role="customer",
            sender_name_snapshot=customers["lucas"].full_name,
            body_text="Enviei tambem a foto da caixinha para ajudar na conferencia.",
            sent_at_label="11/06/2026 09:07 UTC",
            customer_read=True,
            pharmacist_read=False,
            is_internal_note=False,
        ),
        ChatMessage(
            id=seed_uuid("chat-message-1005-note"),
            thread_id=threads[0].id,
            sender_user_id=users["pharmacist_lead"].id,
            sender_customer_id=None,
            message_type="note",
            sender_role="pharmacist",
            sender_name_snapshot=users["pharmacist_lead"].full_name,
            body_text="Pendencia interna: solicitar nova foto legivel antes de liberar separacao.",
            sent_at_label="11/06/2026 09:08 UTC",
            customer_read=False,
            pharmacist_read=True,
            is_internal_note=True,
        ),
    ]

    attachments = [
        ChatMessageAttachment(
            id=seed_uuid("chat-attachment-1005-3"),
            message_id=messages[2].id,
            file_asset_id=seed_uuid("file-chat-1005-photo"),
            original_name_snapshot=file_assets[seed_uuid("file-chat-1005-photo")].original_name,
            content_type_snapshot=file_assets[seed_uuid("file-chat-1005-photo")].content_type,
        )
    ]

    return {
        "threads": threads,
        "messages": messages,
        "attachments": attachments,
    }


def build_audit_events(users: dict[str, User], orders_data: dict[str, dict[str, object] | list[object]]) -> list[AuditEvent]:
    """Build representative backend audit events for security and operations testing."""

    orders = orders_data["orders"]

    return [
        AuditEvent(
            id=seed_uuid("audit-login-admin"),
            tenant_id=TENANT_ID,
            actor_user_id=users["admin"].id,
            actor_role=users["admin"].role,
            access_scope=users["admin"].access_scope,
            request_id="req-seed-0001",
            source="backend",
            action="auth.login",
            event_type="authentication",
            outcome="success",
            http_method="POST",
            http_path="/api/v1/auth/login",
            status_code=200,
            ip_address="127.0.0.1",
            user_agent="seed-script/1.0",
            metadata_json=json_text({"email": users["admin"].email}),
            detail="Administrador autenticado com sucesso em ambiente local.",
        ),
        AuditEvent(
            id=seed_uuid("audit-review-prescription"),
            tenant_id=TENANT_ID,
            actor_user_id=users["pharmacist_lead"].id,
            actor_role=users["pharmacist_lead"].role,
            access_scope=users["pharmacist_lead"].access_scope,
            request_id="req-seed-0002",
            source="backend",
            action="prescription.review",
            event_type="clinical_review",
            outcome="success",
            http_method="POST",
            http_path="/api/v1/prescriptions/RX-1005/review",
            status_code=202,
            ip_address="127.0.0.1",
            user_agent="seed-script/1.0",
            metadata_json=json_text({"order_code": orders["online_prescription_pending"].order_code}),
            detail="Receita marcada como pendente por assinatura parcialmente encoberta.",
        ),
        AuditEvent(
            id=seed_uuid("audit-order-cancelled"),
            tenant_id=TENANT_ID,
            actor_user_id=users["admin"].id,
            actor_role=users["admin"].role,
            access_scope=users["admin"].access_scope,
            request_id="req-seed-0003",
            source="backend",
            action="order.cancel",
            event_type="order_management",
            outcome="success",
            http_method="POST",
            http_path="/api/v1/orders/FA-1004/cancel",
            status_code=200,
            ip_address="127.0.0.1",
            user_agent="seed-script/1.0",
            metadata_json=json_text({"reason": "driver_unavailable"}),
            detail="Pedido cancelado e marcado para estorno do pagamento e cashback.",
        ),
    ]


def build_refresh_tokens(users: dict[str, User]) -> list[RefreshToken]:
    """Build representative refresh token metadata for session and revocation tests."""

    return [
        RefreshToken(
            id=seed_uuid("refresh-admin-active"),
            tenant_id=TENANT_ID,
            user_id=users["admin"].id,
            token_id=seed_uuid("refresh-admin-active-token"),
            family_id=seed_uuid("refresh-admin-family"),
            token_hash=hash_refresh_token("seed-refresh-admin-active"),
            session_version=1,
            expires_at=SEED_NOW + timedelta(days=45),
            issued_for_remember_session=True,
            user_agent="seed-browser-admin",
            ip_address="127.0.0.1",
            replaced_by_token_id="",
            is_revoked=False,
            revoked_reason="",
            revoked_at=None,
            last_used_at=SEED_NOW - timedelta(hours=2),
        ),
        RefreshToken(
            id=seed_uuid("refresh-camila-revoked"),
            tenant_id=TENANT_ID,
            user_id=users["customer_camila"].id,
            token_id=seed_uuid("refresh-camila-token"),
            family_id=seed_uuid("refresh-camila-family"),
            token_hash=hash_refresh_token("seed-refresh-camila-revoked"),
            session_version=1,
            expires_at=SEED_NOW + timedelta(days=20),
            issued_for_remember_session=False,
            user_agent="seed-browser-marketplace",
            ip_address="127.0.0.1",
            replaced_by_token_id=seed_uuid("refresh-camila-token-new"),
            is_revoked=True,
            revoked_reason="user_logout",
            revoked_at=SEED_NOW - timedelta(days=1),
            last_used_at=SEED_NOW - timedelta(days=1, minutes=15),
        ),
    ]


# ============================================================================
# SEED FLOW
# ============================================================================


async def seed_database() -> None:
    """Execute the deterministic seed flow against the configured database."""

    password_hash = hash_password(DEFAULT_PASSWORD)
    users = build_users(password_hash)
    customers = build_customers()
    catalog = build_catalog()
    inventory_operations = build_inventory_operations(catalog)
    customer_assets = build_customer_assets(customers)
    services = build_services(users, customers)
    orders_data = build_orders(customers, customer_assets, catalog)
    logistics = build_logistics(users, customers, orders_data)
    pdv_data = build_pdv(users, customers, catalog)
    fiscal_documents = build_fiscal_documents(users, customers, orders_data, pdv_data)
    prescription_data = build_prescriptions(users, orders_data, customers, catalog)
    saved_and_subscriptions = build_saved_and_subscriptions(customers, catalog)
    cashback = build_cashback(customers, customer_assets, orders_data, pdv_data, catalog)
    chat = build_chat(users, customers, orders_data, prescription_data)
    audit_events = build_audit_events(users, orders_data)
    refresh_tokens = build_refresh_tokens(users)

    async with SessionFactory() as session:
        await upsert_many(session, list(users.values()))
        await upsert_many(session, list(customers.values()))
        await upsert_many(session, list(catalog["products"].values()))
        await upsert_many(session, inventory_operations["locations"])
        await upsert_many(session, list(catalog["inventory"].values()))
        await upsert_many(session, inventory_operations["movements"])
        await upsert_many(session, list(catalog["listings"].values()))
        await upsert_many(session, list(catalog["rules"].values()))
        await upsert_many(session, customer_assets["addresses"])
        await upsert_many(session, customer_assets["payment_methods"])
        await upsert_many(session, customer_assets["wallets"])
        await upsert_many(session, services["services"])
        await upsert_many(session, services["appointments"])
        await upsert_many(session, saved_and_subscriptions["saved_products"])
        await upsert_many(session, saved_and_subscriptions["subscriptions"])
        await upsert_many(session, list(orders_data["orders"].values()))
        await upsert_many(session, orders_data["items"])
        await upsert_many(session, orders_data["fulfillments"])
        await upsert_many(session, orders_data["events"])
        await upsert_many(session, logistics["routes"])
        await upsert_many(session, logistics["stops"])
        await upsert_many(session, list(pdv_data["orders"].values()))
        await upsert_many(session, pdv_data["items"])
        await upsert_many(session, list(pdv_data["sales"].values()))
        await upsert_many(session, pdv_data["sale_items"])
        await upsert_many(session, fiscal_documents)
        await upsert_many(session, prescription_data["file_assets"])
        await upsert_many(session, prescription_data["prescriptions"])
        await upsert_many(session, prescription_data["prescription_files"])
        await upsert_many(session, prescription_data["checks"])
        await upsert_many(session, prescription_data["items"])
        await upsert_many(session, cashback["transactions"])
        await upsert_many(session, cashback["lines"])
        await upsert_many(session, chat["threads"])
        await upsert_many(session, chat["messages"])
        await upsert_many(session, chat["attachments"])
        await upsert_many(session, audit_events)
        await upsert_many(session, refresh_tokens)
        await session.commit()

    print("Seed concluido com sucesso.")
    print("Tenant ID:", TENANT_ID)
    print("Store ID:", STORE_ID)
    print("Senha padrao para todos os usuarios:", DEFAULT_PASSWORD)
    print("Usuario admin:", users["admin"].email)
    print("Usuario farmaceutico com 2FA:", users["pharmacist_lead"].email)
    print("Usuario caixa:", users["cashier_lead"].email)
    print("Usuario cliente marketplace:", users["customer_mariana"].email)
    print("Usuario cliente marketplace com 2FA:", users["customer_camila"].email)
    print("Segredo TOTP para contas com 2FA:", MFA_SECRET)


def main() -> None:
    """Run the asynchronous seed flow."""

    reconcile_schema_for_seed()
    asyncio.run(seed_database())


if __name__ == "__main__":
    main()
