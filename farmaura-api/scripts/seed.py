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
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

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
from app.core.file_storage import write_private_file
from app.models.brand import Brand
from app.models.brand_supplier import BrandSupplier
from app.models.category import Category
from app.models.inventory_audit_entry import InventoryAuditEntry
from app.models.inventory_invoice_record import InventoryInvoiceRecord
from app.models.inventory_item import InventoryItem
from app.models.inventory_location import InventoryLocation
from app.models.inventory_lot_movement import InventoryLotMovement
from app.models.inventory_movement import InventoryMovement
from app.models.inventory_product import InventoryProduct
from app.models.inventory_stock_lot import InventoryStockLot
from app.models.marketplace_listing import MarketplaceListing
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.order_item import OrderItem
from app.models.order_status_event import OrderStatusEvent
from app.models.pdv_order import PdvOrder
from app.models.portal_setting import PortalSetting
from app.models.pdv_order_item import PdvOrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.models.prescription import Prescription
from app.models.prescription_check import PrescriptionCheck
from app.models.prescription_file import PrescriptionFile
from app.models.prescription_item import PrescriptionItem
from app.models.refresh_token import RefreshToken
from app.models.saved_product import SavedProduct
from app.models.store import Store
from app.models.subscription import Subscription
from app.models.supplier import Supplier
from app.models.therapeutic_class import TherapeuticClass
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
SECOND_STORE_ID = str(uuid5(NAMESPACE_URL, "https://farmaura.local/store/aguas-claras"))
SECOND_STORE_NAME = "Farmaura Águas Claras"
SECOND_STORE_ADDRESS = "Avenida Araucárias, Águas Claras, Brasília, Distrito Federal, 71916-540"
SECOND_STORE_LATITUDE = Decimal("-15.8378500")
SECOND_STORE_LONGITUDE = Decimal("-48.0261600")
DEFAULT_PASSWORD = "Farmaura@123"
MFA_SECRET = "JBSWY3DPEHPK3PXP"
SEED_NOW = datetime(2026, 6, 11, 9, 30, tzinfo=UTC)

# CNAEs (atividades) registrados para a farmácia. O ICMS de cada CNAE fica em
# 0.00% no seed de propósito — é uma alíquota efetiva que a contabilidade da
# farmácia deve preencher em Configurações, não um valor legal deduzido aqui.
CNAE_REGISTRY = [
    # farmaceuticos entra com ICMS-ST ligado: medicamentos operam sob substituicao
    # tributaria nacional (Convenio ICMS 76/94), ou seja, o distribuidor ja recolheu
    # o ICMS antes da farmacia revender — sem o flag, o Precificador cobraria o
    # imposto em dobro no calculo do Simples Nacional.
    {"code": "47.71-7-01", "description": "Comercio varejista de produtos farmaceuticos, sem manipulacao de formulas", "is_principal": True, "is_subject_to_icms_st": True},
    {"code": "47.89-0-05", "description": "Comercio varejista de produtos saneantes domissanitarios", "is_principal": False, "is_subject_to_icms_st": False},
    {"code": "47.72-5-00", "description": "Comercio varejista de cosmeticos, produtos de perfumaria e de higiene pessoal", "is_principal": False, "is_subject_to_icms_st": False},
    {"code": "47.29-6-99", "description": "Comercio varejista de produtos alimenticios em geral ou especializado em produtos alimenticios nao especificados anteriormente", "is_principal": False, "is_subject_to_icms_st": False},
    {"code": "47.73-3-00", "description": "Comercio varejista de artigos medicos e ortopedicos", "is_principal": False, "is_subject_to_icms_st": False},
    {"code": "47.21-1-04", "description": "Comercio varejista de doces, balas, bombons e semelhantes", "is_principal": False, "is_subject_to_icms_st": False},
    {"code": "47.23-7-00", "description": "Comercio varejista de bebidas", "is_principal": False, "is_subject_to_icms_st": False},
]

# CNAEs registrados sem correspondencia direta a nenhum produto do seed
# (ex.: doces, bebidas) ficam de fora do catalogo, mas continuam registrados
# em CNAE_REGISTRY para atribuicao manual via Precificador.


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


def build_seed_invoice_xml(
    *,
    reference_code: str,
    supplier_name: str,
    item_name: str,
    quantity: int,
    unit_cost: Decimal,
    product_total_amount: Decimal,
    invoice_total_amount: Decimal,
    issue_date: datetime,
) -> bytes:
    """Build a small, well-formed placeholder nota fiscal XML for seeded invoice records."""

    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<notaFiscalSeed>\n"
        f"  <numero>{reference_code}</numero>\n"
        f"  <dataEmissao>{issue_date.astimezone(UTC).strftime('%Y-%m-%d')}</dataEmissao>\n"
        f"  <fornecedor>{supplier_name}</fornecedor>\n"
        f"  <valorTotalNota>{invoice_total_amount}</valorTotalNota>\n"
        "  <item>\n"
        f"    <descricao>{item_name}</descricao>\n"
        f"    <quantidade>{quantity}</quantidade>\n"
        f"    <valorUnitario>{unit_cost}</valorUnitario>\n"
        f"    <valorTotalProduto>{product_total_amount}</valorTotalProduto>\n"
        "  </item>\n"
        "</notaFiscalSeed>\n"
    ).encode("utf-8")


# ============================================================================
# BUILDERS
# ============================================================================


def build_cnae_settings() -> PortalSetting:
    """Build the tenant's registered CNAEs portal setting, consumed by the Precificador's tax math."""

    return PortalSetting(
        id=seed_uuid("setting-cnae-settings"),
        tenant_id=TENANT_ID,
        portal_name="internal",
        setting_key="cnae_settings",
        value_json=json_text({
            "items": [
                {
                    "code": entry["code"],
                    "description": entry["description"],
                    "is_principal": entry["is_principal"],
                    "is_subject_to_icms_st": entry["is_subject_to_icms_st"],
                }
                for entry in CNAE_REGISTRY
            ],
            # Simples Nacional, Anexo I (comercio) — faturamento fictício para o
            # seed cair numa faixa nao trivial (Faixa 4) e o Precificador ja
            # nascer mostrando um calculo real, nao um estado vazio/zerado.
            "tax_regime": {
                "regime": "simples_nacional",
                "state_code": "DF",
                "trailing_12m_revenue": "1200000.00",
            },
        }),
    )


def build_stores() -> dict[str, Store]:
    """Build the tenant's physical stores, including a second branch for multi-store testing."""

    return {
        "primary": Store(
            id=STORE_ID,
            tenant_id=TENANT_ID,
            code="ponte-alta-norte",
            name=STORE_NAME,
            address_line=STORE_ADDRESS,
            district="Ponte Alta Norte",
            city="Gama",
            state_code="DF",
            postal_code="72426-070",
            latitude=STORE_LATITUDE,
            longitude=STORE_LONGITUDE,
            phone="(61) 3555-0101",
            cnpj="12.345.678/0001-90",
            is_primary=True,
            is_active=True,
        ),
        "second": Store(
            id=SECOND_STORE_ID,
            tenant_id=TENANT_ID,
            code="aguas-claras",
            name=SECOND_STORE_NAME,
            address_line=SECOND_STORE_ADDRESS,
            district="Águas Claras",
            city="Brasília",
            state_code="DF",
            postal_code="71916-540",
            latitude=SECOND_STORE_LATITUDE,
            longitude=SECOND_STORE_LONGITUDE,
            phone="(61) 3555-0202",
            cnpj="12.345.678/0002-71",
            is_primary=False,
            is_active=True,
        ),
    }


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
            store_id=STORE_ID,
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
            store_id=SECOND_STORE_ID,
        ),
        "store_manager": User(
            id=seed_uuid("user-store-manager"),
            tenant_id=TENANT_ID,
            email="rafael.nunes@farmaura.com.br",
            password_hash=password_hash,
            full_name="Rafael Nunes",
            role=UserRole.MANAGER.value,
            access_scope=AccessScope.INTERNAL.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
            store_id=SECOND_STORE_ID,
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
            store_id=STORE_ID,
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
            store_id=SECOND_STORE_ID,
        ),
        "delivery_driver": User(
            id=seed_uuid("user-delivery-driver"),
            tenant_id=TENANT_ID,
            email="marcos.pereira@farmaura.com.br",
            password_hash=password_hash,
            full_name="Marcos Pereira",
            role=UserRole.DRIVER.value,
            access_scope=AccessScope.INTERNAL.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
            store_id=STORE_ID,
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

    customers: dict[str, Customer] = {
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
            member_since_label="março de 2024",
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
            member_since_label="janeiro de 2025",
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
            member_since_label="abril de 2026",
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
            member_since_label="setembro de 2023",
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
            member_since_label="fevereiro de 2022",
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

    # Additional CRM volume for a realistic single-day operation — generated from a
    # compact table instead of hand-written per customer, purely to keep this
    # maintainable at this volume. Every derived field is index-based (no RNG), so
    # reruns are stable and each customer's numbers stay internally consistent.
    bulk_customer_rows = [
        ("Fernanda", "Lima", "Feminino", "Aguas Claras"),
        ("Diego", "Costa", "Masculino", "Taguatinga Norte"),
        ("Juliana", "Pereira", "Feminino", "Guara"),
        ("Bruno", "Carvalho", "Masculino", "Ceilandia"),
        ("Patricia", "Gomes", "Feminino", "Samambaia"),
        ("Thiago", "Ribeiro", "Masculino", "Ponte Alta Norte"),
        ("Larissa", "Barbosa", "Feminino", "Aguas Claras"),
        ("Rodrigo", "Almeida", "Masculino", "Vicente Pires"),
        ("Aline", "Fernandes", "Feminino", "Taguatinga Sul"),
        ("Marcelo", "Teixeira", "Masculino", "Guara"),
        ("Vanessa", "Cardoso", "Feminino", "Ponte Alta Norte"),
        ("Felipe", "Nogueira", "Masculino", "Aguas Claras"),
        ("Renata", "Moreira", "Feminino", "Samambaia"),
        ("Gustavo", "Pinto", "Masculino", "Ceilandia"),
        ("Carolina", "Dias", "Feminino", "Taguatinga Norte"),
        ("Leandro", "Correia", "Masculino", "Vicente Pires"),
        ("Isabela", "Monteiro", "Feminino", "Ponte Alta Norte"),
        ("Vinicius", "Batista", "Masculino", "Aguas Claras"),
        ("Priscila", "Cavalcante", "Feminino", "Guara"),
        ("Eduardo", "Farias", "Masculino", "Taguatinga Sul"),
        ("Natalia", "Rocha", "Feminino", "Samambaia"),
        ("Otavio", "Vieira", "Masculino", "Ceilandia"),
        ("Tatiane", "Melo", "Feminino", "Ponte Alta Norte"),
        ("Andre", "Sales", "Masculino", "Aguas Claras"),
        ("Simone", "Aragao", "Feminino", "Vicente Pires"),
    ]
    favorite_item_pool = [
        "Paracetamol 750mg", "Vitamina D3", "Protetor Labial FPS 30", "Whey Protein Concentrado",
        "Fralda Infantil Premium", "Omega 3 1000mg", "Shampoo Anticaspa", "Alcool em Gel 70%",
    ]
    tier_cycle = ["Bronze", "Prata", "Ouro"]
    for row_index, (first_name, last_name, gender, district) in enumerate(bulk_customer_rows):
        key = f"bulk_customer_{row_index:02d}"
        full_name = first_name + " " + last_name
        tier = tier_cycle[row_index % len(tier_cycle)]
        is_recurring = row_index % 2 == 0
        orders_count = 1 + (row_index * 3) % 14
        average_ticket = Decimal("60.00") + Decimal(str((row_index * 17) % 180))
        total_spent = (average_ticket * orders_count).quantize(Decimal("0.01"))
        cashback_balance = (total_spent * Decimal("0.02")).quantize(Decimal("0.01"))
        birth_year = 1968 + (row_index * 3) % 38
        favorite_a = favorite_item_pool[row_index % len(favorite_item_pool)]
        favorite_b = favorite_item_pool[(row_index + 3) % len(favorite_item_pool)]
        customers[key] = Customer(
            id=seed_uuid("customer-" + key),
            tenant_id=TENANT_ID,
            external_code=f"CRM-{row_index + 6:04d}",
            full_name=full_name,
            email=f"{first_name.lower()}.{last_name.lower()}@cliente.farmaura.com.br",
            phone=f"+55 61 99{860 + row_index:03d}-{1000 + row_index * 7:04d}",
            cpf=f"{100 + row_index:03d}.{200 + row_index:03d}.{300 + row_index:03d}-{10 + row_index % 90:02d}",
            birth_date=f"{birth_year:04d}-{(row_index % 12) + 1:02d}-{(row_index % 27) + 1:02d}",
            gender=gender,
            avatar_url="",
            loyalty_tier=tier,
            is_recurring=is_recurring,
            two_factor_enabled=False,
            member_since_label=f"{['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][row_index % 12]} de {2022 + row_index % 4}",
            city_label="Brasilia",
            district_label=district,
            cashback_balance=money(str(cashback_balance)),
            orders_count=orders_count,
            total_spent=money(str(total_spent)),
            average_ticket=money(str(average_ticket)),
            last_purchase_days_ago=1 + (row_index * 2) % 25,
            purchase_frequency_days=14 + (row_index * 3) % 30,
            tenure_months=3 + (row_index * 5) % 48,
            active_subscriptions=["SUB-BULK-" + f"{row_index:03d}"] if row_index % 6 == 0 else [],
            favorite_items=[favorite_a, favorite_b],
            top_products_snapshot=[{"name": favorite_a, "count": 2 + row_index % 4}, {"name": favorite_b, "count": 1 + row_index % 3}],
            interest_tags=["marketplace", "entrega-rapida"] if row_index % 2 == 0 else ["retirada-loja", "bem-estar"],
            category_mix_snapshot=[{"category": "Medicamentos", "share": 55 + row_index % 20}, {"category": "Bem-estar", "share": 45 - row_index % 20}],
            monthly_orders_snapshot=[row_index % 3, (row_index + 1) % 3, (row_index + 2) % 3, row_index % 2, (row_index + 1) % 2, row_index % 4],
            marketing_program_preferences=[{"name": "Cashback Farmaura", "enabled": row_index % 3 != 0}],
            communication_channel_preferences=[{"channel": "whatsapp", "enabled": True}, {"channel": "email", "enabled": row_index % 2 == 0}],
            is_active=True,
        )

    return customers


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
            "therapeutic_class": "Anti-hipertensivo",
            "cnae": "47.71-7-01",
            "ean": "7896004700011",
            "location": "A1-01",
            "batch": "LOT-LOS-2608",
            "expiry": "08/2027",
            "quantity": 64,
            "minimum": 12,
            "low_stock_threshold": 12,
            "attention_stock_threshold": 24,
            "normal_stock_threshold": 40,
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
            "therapeutic_class": "Antibiótico",
            "cnae": "47.71-7-01",
            "ean": "7894916500028",
            "location": "A1-05",
            "batch": "LOT-AMO-2607",
            "expiry": "07/2027",
            "quantity": 29,
            "minimum": 8,
            "low_stock_threshold": 10,
            "attention_stock_threshold": 35,
            "normal_stock_threshold": 60,
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
            "therapeutic_class": "Ansiolítico",
            "cnae": "47.71-7-01",
            "ean": "7896422500037",
            "location": "CONTROL-02",
            "batch": "LOT-CLO-2610",
            "expiry": "10/2027",
            "quantity": 18,
            "minimum": 6,
            "low_stock_threshold": 20,
            "attention_stock_threshold": 35,
            "normal_stock_threshold": 50,
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
            "controlled_category": "black_stripe",
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
            "therapeutic_class": "Vitaminas e Suplementos",
            "cnae": "47.29-6-99",
            "ean": "7896112400045",
            "location": "B2-03",
            "batch": "LOT-VIT-2609",
            "expiry": "09/2027",
            "quantity": 51,
            "minimum": 10,
            "low_stock_threshold": 10,
            "attention_stock_threshold": 20,
            "normal_stock_threshold": 35,
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
            "therapeutic_class": "Dermocosmético",
            "cnae": "47.72-5-00",
            "ean": "7899706200052",
            "location": "C4-01",
            "batch": "LOT-SUN-2701",
            "expiry": "01/2028",
            "quantity": 0,
            "minimum": 6,
            "low_stock_threshold": 6,
            "attention_stock_threshold": 12,
            "normal_stock_threshold": 20,
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
            "therapeutic_class": "Cuidados Infantis",
            "cnae": "47.72-5-00",
            "ean": "7891023400064",
            "location": "D1-02",
            "batch": "LOT-DIA-2606",
            "expiry": "06/2028",
            "quantity": 31,
            "minimum": 8,
            "low_stock_threshold": 10,
            "attention_stock_threshold": 40,
            "normal_stock_threshold": 60,
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
            "therapeutic_class": "Analgésico e Antitérmico",
            "cnae": "47.71-7-01",
            "ean": "7896002300073",
            "location": "A2-07",
            "batch": "LOT-DIP-2608",
            "expiry": "08/2027",
            "quantity": 78,
            "minimum": 18,
            "low_stock_threshold": 15,
            "attention_stock_threshold": 30,
            "normal_stock_threshold": 50,
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
            "therapeutic_class": "Dermocosmético",
            "cnae": "47.72-5-00",
            "ean": "7896034500081",
            "location": "C4-09",
            "batch": "LOT-SER-2611",
            "expiry": "11/2027",
            "quantity": 19,
            "minimum": 5,
            "low_stock_threshold": 20,
            "attention_stock_threshold": 35,
            "normal_stock_threshold": 50,
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
            "therapeutic_class": "Diagnóstico e Monitoramento",
            "cnae": "47.73-3-00",
            "ean": "7896023400098",
            "location": "B3-01",
            "batch": "LOT-GLI-2609",
            "expiry": "09/2027",
            "quantity": 26,
            "minimum": 8,
            "low_stock_threshold": 8,
            "attention_stock_threshold": 16,
            "normal_stock_threshold": 22,
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
            "therapeutic_class": "Antiflatulento",
            "cnae": "47.71-7-01",
            "ean": "7896009100108",
            "location": "A3-02",
            "batch": "LOT-SIM-2702",
            "expiry": "02/2028",
            "quantity": 37,
            "minimum": 10,
            "low_stock_threshold": 10,
            "attention_stock_threshold": 20,
            "normal_stock_threshold": 30,
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

    # Additional catalog volume for a realistic single-day operation ("dia de
    # atendimento") — every entry here is OTC/non-controlled by design, so bulk
    # daily sales generated in build_daily_operations() never touch the
    # prescription-approval workflow. Fields are derived from a compact table
    # instead of hand-written per product, purely to keep this maintainable at
    # this volume; the derivation is deterministic (no RNG), so `quantity` here
    # is simply each item's opening stock for the day.
    bulk_product_rows = [
        ("paracetamol", "Paracetamol 750mg 20 comprimidos", "Medley", "Medicamentos", "Analgésico e Antitérmico", "9.90", "4.80", "47.71-7-01"),
        ("ibuprofen", "Ibuprofeno 400mg 20 comprimidos", "EMS", "Medicamentos", "Anti-inflamatório", "12.90", "6.30", "47.71-7-01"),
        ("loratadine", "Loratadina 10mg 12 comprimidos", "Neo Quimica", "Medicamentos", "Antialérgico", "11.50", "5.60", "47.71-7-01"),
        ("omeprazole", "Omeprazol 20mg 28 capsulas", "EMS", "Medicamentos", "Antiulceroso", "18.90", "9.40", "47.71-7-01"),
        ("vitamin_d3", "Vitamina D3 2000UI 60 capsulas", "Sundown", "Bem-estar", "Vitaminas e Suplementos", "34.90", "18.20", "47.29-6-99"),
        ("complex_b", "Complexo B 30 comprimidos", "Neo Quimica", "Bem-estar", "Vitaminas e Suplementos", "15.90", "7.80", "47.29-6-99"),
        ("saline", "Soro Fisiologico 0,9% 500ml", "Fresenius", "Medicamentos", "Soro e Hidratação", "8.50", "4.10", "47.71-7-01"),
        ("melatonin", "Melatonina 5mg 30 comprimidos", "Vitafor", "Bem-estar", "Indutor do Sono", "42.90", "23.50", "47.29-6-99"),
        ("cough_syrup", "Xarope Guaco Adulto 120ml", "Vick", "Medicamentos", "Antitussígeno e Expectorante", "22.90", "11.40", "47.71-7-01"),
        ("propolis", "Pastilha Propolis 24 unidades", "Farmavida", "Bem-estar", "Vitaminas e Suplementos", "13.90", "6.70", "47.29-6-99"),
        ("whey_protein", "Whey Protein Concentrado 900g", "Growth", "Bem-estar", "Vitaminas e Suplementos", "129.90", "78.00", "47.29-6-99"),
        ("collagen", "Colageno Hidrolisado 300g", "Vitafor", "Bem-estar", "Vitaminas e Suplementos", "79.90", "45.00", "47.29-6-99"),
        ("omega3", "Omega 3 1000mg 60 capsulas", "Sundown", "Bem-estar", "Vitaminas e Suplementos", "59.90", "32.00", "47.29-6-99"),
        ("magnesium", "Magnesio Dimalato 60 capsulas", "Vitafor", "Bem-estar", "Vitaminas e Suplementos", "44.90", "24.50", "47.29-6-99"),
        ("probiotic", "Probiotico 30 capsulas", "Floratil", "Bem-estar", "Vitaminas e Suplementos", "54.90", "29.80", "47.29-6-99"),
        ("facial_moisturizer", "Hidratante Facial Niacinamida 30g", "La Roche-Posay", "Perfumaria", "Dermocosmético", "79.90", "48.00", "47.72-5-00"),
        ("shampoo", "Shampoo Anticaspa 200ml", "Head e Shoulders", "Perfumaria", "Dermocosmético", "24.90", "13.50", "47.72-5-00"),
        ("intimate_soap", "Sabonete Liquido Intimo 200ml", "Cicatricure", "Perfumaria", "Higiene Íntima", "19.90", "10.20", "47.72-5-00"),
        ("night_cream", "Creme Antissinais Noturno 45g", "Vichy", "Perfumaria", "Dermocosmético", "129.90", "76.00", "47.72-5-00"),
        ("lip_balm", "Protetor Labial FPS 30 4g", "Nivea", "Perfumaria", "Dermocosmético", "14.90", "7.30", "47.72-5-00"),
        ("diapers_m", "Fralda Infantil Premium tamanho M 56 unidades", "Huggies", "Infantil", "Cuidados Infantis", "68.90", "41.00", "47.72-5-00"),
        ("baby_wipes", "Lenco Umedecido Infantil 192 unidades", "Pampers", "Infantil", "Cuidados Infantis", "29.90", "16.50", "47.72-5-00"),
        ("baby_vitamin", "Vitamina Infantil Gotas 30ml", "Protovit", "Infantil", "Vitaminas Infantis", "32.90", "17.00", "47.71-7-01"),
        ("diaper_rash_cream", "Pomada para Assadura 45g", "Bepantol Baby", "Infantil", "Cuidados Infantis", "26.90", "14.20", "47.71-7-01"),
        ("toothbrush", "Escova Dental Macia Kit 2 unidades", "Oral-B", "Higiene", "Higiene Bucal", "16.90", "8.10", "47.72-5-00"),
        ("dental_floss", "Fio Dental 50m", "Colgate", "Higiene", "Higiene Bucal", "9.90", "4.60", "47.72-5-00"),
        ("hand_sanitizer", "Alcool em Gel 70% 500ml", "Asseio", "Higiene", "Antisséptico", "12.90", "6.20", "47.89-0-05"),
        ("thermometer", "Termometro Digital", "G-Tech", "Higiene", "Equipamentos e Acessórios", "24.90", "13.80", "47.73-3-00"),
        ("face_mask", "Mascara Descartavel Tripla Camada 50 unidades", "Descarpack", "Higiene", "Equipamentos e Acessórios", "34.90", "19.50", "47.73-3-00"),
        ("adhesive_bandage", "Curativo Adesivo Caixa 100 unidades", "Band-Aid", "Higiene", "Primeiros Socorros", "18.90", "9.90", "47.73-3-00"),
    ]
    location_prefix_by_category = {
        "Medicamentos": "A", "Bem-estar": "B", "Perfumaria": "C", "Infantil": "D", "Higiene": "E",
    }
    expiry_cycle = ["06/2027", "07/2027", "08/2027", "09/2027", "10/2027", "11/2027", "12/2027", "01/2028", "02/2028", "03/2028"]
    location_index_by_category: dict[str, int] = {}
    for row_index, (key, name, brand, category, therapeutic_class, price_text, cost_text, cnae) in enumerate(bulk_product_rows):
        price = Decimal(price_text)
        cost = Decimal(cost_text)
        quantity = max(18, min(120, round(Decimal("500") / price)))
        low_threshold = max(4, round(quantity * Decimal("0.20")))
        attention_threshold = max(low_threshold + 2, round(quantity * Decimal("0.40")))
        normal_threshold = max(attention_threshold + 2, round(quantity * Decimal("0.65")))
        is_perfumaria = category == "Perfumaria"
        has_promo = row_index % 3 == 0
        promo_percent = Decimal("5.00") if has_promo else Decimal("0.00")
        published_price = (price * (Decimal("100.00") - promo_percent) / Decimal("100.00")).quantize(Decimal("0.01"))
        market_reference_price = (price * Decimal("1.18")).quantize(Decimal("0.01"))
        target_margin = ((price - cost) / price * Decimal("100.00")).quantize(Decimal("0.01"))
        cashback_percent = {"Medicamentos": "3.00", "Higiene": "5.00", "Infantil": "6.00"}.get(category, "9.00")
        cashback_min = "10.00" if category in ("Medicamentos", "Higiene") else "30.00"
        cashback_max = "8.00" if category in ("Medicamentos", "Higiene") else "18.00"
        location_index_by_category[category] = location_index_by_category.get(category, 0) + 1
        location = location_prefix_by_category[category] + "5-" + f"{location_index_by_category[category]:02d}"
        product_specs.append({
            "key": key,
            "sku": f"FA-PROD-{row_index + 11:03d}",
            "name": name,
            "description": name + " - uso conforme orientacao da embalagem.",
            "price": str(price),
            "requires_prescription": False,
            "brand": brand,
            "category": category,
            "therapeutic_class": therapeutic_class,
            "cnae": cnae,
            "ean": f"7896{row_index:09d}",
            "location": location,
            "batch": "LOT-" + key[:3].upper() + "-2606",
            "expiry": expiry_cycle[row_index % len(expiry_cycle)],
            "quantity": quantity,
            "minimum": max(4, round(quantity * Decimal("0.20"))),
            "low_stock_threshold": low_threshold,
            "attention_stock_threshold": attention_threshold,
            "normal_stock_threshold": normal_threshold,
            "acquisition_cost": str(cost),
            "market_reference_price": str(market_reference_price),
            "promo": str(promo_percent),
            "published_price": str(published_price),
            "commission": "8.50" if is_perfumaria else "7.50",
            "payment_fee": "2.69" if is_perfumaria else "2.49",
            "fixed_fee": "0.99" if is_perfumaria else "0.79",
            "target_margin": str(target_margin),
            "cashback_percent": cashback_percent,
            "cashback_min": cashback_min,
            "cashback_max": cashback_max,
        })

    brands: dict[str, Brand] = {}
    categories: dict[str, Category] = {}
    therapeutic_classes: dict[str, TherapeuticClass] = {}
    inventory_products: dict[str, InventoryProduct] = {}
    inventory: dict[str, InventoryItem] = {}
    listings: dict[str, MarketplaceListing] = {}
    rules: dict[str, CashbackRule] = {}

    for spec in product_specs:
        key = str(spec["key"])
        brand_name = str(spec["brand"])
        if brand_name not in brands:
            brands[brand_name] = Brand(
                id=seed_uuid("brand-" + brand_name),
                tenant_id=TENANT_ID,
                name=brand_name,
                description="",
                logo_url="",
                is_active=True,
            )
        category_name = str(spec["category"])
        if category_name not in categories:
            categories[category_name] = Category(
                id=seed_uuid("category-" + category_name),
                tenant_id=TENANT_ID,
                name=category_name,
                description="",
                is_active=True,
            )
        therapeutic_class_name = str(spec["therapeutic_class"])
        if therapeutic_class_name not in therapeutic_classes:
            therapeutic_classes[therapeutic_class_name] = TherapeuticClass(
                id=seed_uuid("therapeutic-class-" + therapeutic_class_name),
                tenant_id=TENANT_ID,
                name=therapeutic_class_name,
                description="",
                category_id=categories[category_name].id,
                is_active=True,
            )
        inventory_products[key] = InventoryProduct(
            id=seed_uuid("inventory-product-" + key),
            tenant_id=TENANT_ID,
            sku=str(spec["sku"]),
            ean_code=str(spec["ean"]),
            name=str(spec["name"]),
            brand_id=brands[brand_name].id,
            category_id=categories[category_name].id,
            therapeutic_class_id=therapeutic_classes[therapeutic_class_name].id,
            is_controlled=bool(spec.get("is_controlled", False)),
            controlled_category=str(spec.get("controlled_category", "none")),
            cnae_code=str(spec["cnae"]),
        )
        inventory[key] = InventoryItem(
            id=seed_uuid("inventory-" + key),
            tenant_id=TENANT_ID,
            store_id=STORE_ID,
            product=inventory_products[key],
            storage_location=str(spec["location"]),
            batch_code=str(spec["batch"]),
            expiry_label=str(spec["expiry"]),
            quantity=int(spec["quantity"]),
            minimum_quantity=int(spec["minimum"]),
            low_stock_threshold=int(spec["low_stock_threshold"]),
            attention_stock_threshold=int(spec["attention_stock_threshold"]),
            normal_stock_threshold=int(spec["normal_stock_threshold"]),
            sale_price=money(str(spec["price"])),
            acquisition_cost=money(str(spec["acquisition_cost"])),
            market_reference_price=money(str(spec["market_reference_price"])),
            promotional_discount_percent=money(str(spec["promo"])),
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

    second_store_specs = {
        "losartan": {"location": "B1-02", "batch": "LOT-LOS-2611-AC", "quantity": 22},
        "dipyrone": {"location": "A1-04", "batch": "LOT-DIP-2610-AC", "quantity": 40},
        "vitamin_c": {"location": "B2-05", "batch": "LOT-VIT-2701-AC", "quantity": 15},
    }
    specs_by_key = {str(spec["key"]): spec for spec in product_specs}
    for key, overrides in second_store_specs.items():
        spec = specs_by_key[key]
        second_key = key + "_aguas_claras"
        inventory[second_key] = InventoryItem(
            id=seed_uuid("inventory-" + second_key),
            tenant_id=TENANT_ID,
            store_id=SECOND_STORE_ID,
            product=inventory_products[key],
            storage_location=str(overrides["location"]),
            batch_code=str(overrides["batch"]),
            expiry_label=str(spec["expiry"]),
            quantity=int(overrides["quantity"]),
            minimum_quantity=int(spec["minimum"]),
            low_stock_threshold=int(spec["low_stock_threshold"]),
            attention_stock_threshold=int(spec["attention_stock_threshold"]),
            normal_stock_threshold=int(spec["normal_stock_threshold"]),
            sale_price=money(str(spec["price"])),
            acquisition_cost=money(str(spec["acquisition_cost"])),
            market_reference_price=money(str(spec["market_reference_price"])),
            promotional_discount_percent=money(str(spec["promo"])),
            is_active=True,
        )

    # Give every remaining product an independent Store 2 (Aguas Claras) row too —
    # previously only 3 of 10 products existed in Store 2 at all, which made the
    # admin store switcher and store-scoped RLS hard to demo. Location/batch codes
    # get an "-AC" suffix so they never collide with a Store 1 code, and Store 2's
    # opening quantity is a smaller fraction of Store 1's (a real second branch
    # rarely carries identical stock levels to the flagship store).
    for key, spec in specs_by_key.items():
        second_key = key + "_aguas_claras"
        if second_key in inventory:
            continue
        base_quantity = int(spec["quantity"])
        second_quantity = max(6, round(base_quantity * 0.55))
        inventory[second_key] = InventoryItem(
            id=seed_uuid("inventory-" + second_key),
            tenant_id=TENANT_ID,
            store_id=SECOND_STORE_ID,
            product=inventory_products[key],
            storage_location=str(spec["location"]) + "-AC",
            batch_code=str(spec["batch"]) + "-AC",
            expiry_label=str(spec["expiry"]),
            quantity=second_quantity,
            minimum_quantity=int(spec["minimum"]),
            low_stock_threshold=int(spec["low_stock_threshold"]),
            attention_stock_threshold=int(spec["attention_stock_threshold"]),
            normal_stock_threshold=int(spec["normal_stock_threshold"]),
            sale_price=money(str(spec["price"])),
            acquisition_cost=money(str(spec["acquisition_cost"])),
            market_reference_price=money(str(spec["market_reference_price"])),
            promotional_discount_percent=money(str(spec["promo"])),
            is_active=True,
        )

    return {
        "brands": brands,
        "categories": categories,
        "therapeutic_classes": therapeutic_classes,
        "inventory_products": inventory_products,
        "inventory": inventory,
        "listings": listings,
        "rules": rules,
        "bulk_product_keys": [row[0] for row in bulk_product_rows],
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

    # One address, wallet, and (usually) one payment method per bulk customer —
    # mirrors the curated pattern above but generated to match build_customers()'s
    # bulk_customer_NN keys.
    bulk_card_brands = ["Visa", "Mastercard", "Elo", "Hipercard"]
    for row_index, key in enumerate(sorted(k for k in customers if k.startswith("bulk_customer_"))):
        customer = customers[key]
        postal_code = f"7{1000 + (row_index * 37) % 9000:04d}-{100 + row_index % 900:03d}"
        addresses.append(
            CustomerAddress(
                id=seed_uuid("address-" + key),
                customer_id=customer.id,
                label="Casa",
                postal_code=postal_code,
                street_line=f"Rua {10 + row_index}, Quadra {1 + row_index % 30}, Casa {100 + row_index}",
                district=customer.district_label,
                city="Brasilia",
                state_code="DF",
                complement="",
                reference_note="",
                recipient_name=customer.full_name,
                recipient_phone=customer.phone,
                is_primary=True,
                is_active=True,
            )
        )
        wallets.append(
            CustomerCashbackWallet(
                id=seed_uuid("wallet-" + key),
                customer_id=customer.id,
                available_balance=customer.cashback_balance,
                pending_balance=money("0.00"),
                redeemed_total=money("0.00"),
                expired_total=money("0.00"),
                lifetime_earned_total=customer.cashback_balance,
            )
        )
        if row_index % 3 != 0:
            brand = bulk_card_brands[row_index % len(bulk_card_brands)]
            payment_methods.append(
                CustomerPaymentMethod(
                    id=seed_uuid("payment-" + key),
                    customer_id=customer.id,
                    provider_name="seed-gateway",
                    provider_token="tok_seed_" + key,
                    brand_name=brand,
                    last_four_digits=f"{1000 + row_index * 3 % 9000:04d}"[-4:],
                    holder_name=customer.full_name,
                    expiration_month=f"{1 + row_index % 12:02d}",
                    expiration_year=str(2027 + row_index % 4),
                    is_primary=True,
                    is_active=True,
                )
            )

    return {
        "addresses": addresses,
        "payment_methods": payment_methods,
        "wallets": wallets,
    }


def build_suppliers() -> dict[str, Supplier]:
    """Build the deterministic supplier registry used by seeded stock lots and brand links."""

    return {
        "central": Supplier(
            id=seed_uuid("supplier-central"),
            tenant_id=TENANT_ID,
            legal_name="Distribuidora Central de Medicamentos Ltda",
            trade_name="Central Med",
            cnpj="12345678000199",
            email="comercial@centralmed.com.br",
            phone="6132223344",
            website="https://centralmed.com.br",
            category="Distribuidora",
            contact_person_name="Roberto Alves",
            uf="DF",
            city="Brasília",
            address_line="SIA Trecho 3, Brasília, DF",
            lead_time_days=5,
            minimum_order_amount=Decimal("300.00"),
            freight_policy="CIF",
            payment_terms="30/60/90 dias",
            notes="Fornecedor principal para reposição semanal.",
            is_active=True,
        ),
        "farmalink": Supplier(
            id=seed_uuid("supplier-farmalink"),
            tenant_id=TENANT_ID,
            legal_name="Farmalink Distribuidora Nacional Ltda",
            trade_name="Farmalink",
            cnpj="23456789000188",
            email="vendas@farmalink.com.br",
            phone="1140028922",
            website="https://farmalink.com.br",
            category="Distribuidora",
            contact_person_name="Juliana Prado",
            uf="SP",
            city="São Paulo",
            address_line="Av. das Nações Unidas, 12000, São Paulo, SP",
            lead_time_days=3,
            minimum_order_amount=Decimal("500.00"),
            freight_policy="FOB",
            payment_terms="28 dias",
            notes="Distribuidor nacional com portfólio amplo, usado como segunda fonte de várias marcas.",
            is_active=True,
        ),
        "belezapura": Supplier(
            id=seed_uuid("supplier-belezapura"),
            tenant_id=TENANT_ID,
            legal_name="Beleza Pura Higiene e Perfumaria Ltda",
            trade_name="Beleza Pura",
            cnpj="34567890000177",
            email="comercial@belezapura.com.br",
            phone="4732014455",
            website="https://belezapura.com.br",
            category="Distribuidora especializada",
            contact_person_name="Marcos Vinícius",
            uf="SC",
            city="Blumenau",
            address_line="Rua XV de Novembro, 850, Blumenau, SC",
            lead_time_days=7,
            minimum_order_amount=Decimal("400.00"),
            freight_policy="CIF",
            payment_terms="30/45 dias",
            notes="Especializado em perfumaria, dermocosméticos e itens infantis.",
            is_active=True,
        ),
    }


def build_brand_suppliers(catalog: dict[str, dict[str, object]], suppliers: dict[str, Supplier]) -> list[BrandSupplier]:
    """Link each brand to the supplier(s) that distribute it.

    Derived from the categories a brand's products belong to, so a brand whose
    products span more than one category resolves to more than one supplier —
    demonstrating that the Marcas screen supports a brand having several
    suppliers, instead of leaving every brand pointing at a single one.
    """

    category_supplier_keys = {
        "Medicamentos": ["central", "farmalink"],
        "Bem-estar": ["farmalink", "belezapura"],
        "Perfumaria": ["belezapura", "farmalink"],
        "Infantil": ["belezapura"],
        "Higiene": ["farmalink"],
    }

    brand_name_by_id = {brand.id: name for name, brand in catalog["brands"].items()}
    category_name_by_id = {category.id: name for name, category in catalog["categories"].items()}

    brand_category_names: dict[str, set[str]] = {}
    for product in catalog["inventory_products"].values():
        brand_name = brand_name_by_id.get(product.brand_id)
        category_name = category_name_by_id.get(product.category_id)
        if not brand_name or not category_name:
            continue
        brand_category_names.setdefault(brand_name, set()).add(category_name)

    links: list[BrandSupplier] = []
    for brand_name, category_names in brand_category_names.items():
        supplier_keys: list[str] = []
        for category_name in sorted(category_names):
            for supplier_key in category_supplier_keys.get(category_name, ["central"]):
                if supplier_key not in supplier_keys:
                    supplier_keys.append(supplier_key)
        brand_id = catalog["brands"][brand_name].id
        for supplier_key in supplier_keys:
            links.append(
                BrandSupplier(
                    id=seed_uuid("brand-supplier-" + brand_name + "-" + supplier_key),
                    tenant_id=TENANT_ID,
                    brand_id=brand_id,
                    supplier_id=suppliers[supplier_key].id,
                )
            )
    return links


def parse_expiry_label_to_date(expiry_label: str) -> date | None:
    """Convert a 'MM/AAAA' expiry label into the last calendar day of that month."""

    parts = expiry_label.split("/")
    if len(parts) != 2:
        return None
    try:
        month = int(parts[0])
        year = int(parts[1])
    except ValueError:
        return None
    next_month = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    return next_month - timedelta(days=1)


def build_inventory_operations(
    catalog: dict[str, dict[str, object]],
    suppliers: dict[str, Supplier],
    users: dict[str, User],
    daily_sold: dict[str, int] | None = None,
) -> dict[str, list[object]]:
    """Build storage locations, stock lots, movement history, and audit trail entries from seeded inventory.

    `daily_sold` (item key -> quantity sold "today" by build_daily_operations) only
    ever contains bulk-product keys, never the curated ones with their own
    purchase_history_by_key narrative below — see build_daily_operations for why.
    By the time this runs, item.quantity already reflects the post-sales total, so
    for any key present here the "opening stock this morning" movement is
    reconstructed as item.quantity + daily_sold[key], followed by one exit
    movement bringing it back down to item.quantity.
    """

    daily_sold = daily_sold or {}

    inventory = catalog["inventory"]
    locations_by_code: dict[str, InventoryLocation] = {}
    movements: list[InventoryMovement] = []
    stock_lots: list[InventoryStockLot] = []
    lot_movements: list[InventoryLotMovement] = []
    audit_entries: list[InventoryAuditEntry] = []
    invoice_records: list[InventoryInvoiceRecord] = []
    invoice_files: list[tuple[str, bytes]] = []
    default_supplier = suppliers["central"]

    # A handful of the "entry" restock events below carry a real NF- reference
    # code — these are the ones that get a matching InventoryInvoiceRecord (and
    # a placeholder XML file on disk), demonstrating the nota-fiscal-per-product
    # history the pricing screen's admin-only "Anexar nota fiscal" modal reads.
    invoice_extra_amount_by_reference: dict[str, Decimal] = {
        "NF-2026-3412": Decimal("142.30"),
    }

    # Demonstrates the same batch split across estoque, showroom gôndola, and
    # multiple prateleiras at once — the exact scenario the traceability
    # screens are built to surface.
    shelf_splits_by_key: dict[str, list[dict[str, object]]] = {
        "amoxicillin": [
            {
                "location_key": "balcao-01",
                "code": "BALCAO-01",
                "name": "Prateleira balcão 1",
                "zone": "Balcão",
                "location_type": "prateleira",
                "description": "Seeded shelf location demonstrating a batch split across the store.",
                "quantity": 5,
                "received_offset_days": 2,
            },
            {
                "location_key": "balcao-02",
                "code": "BALCAO-02",
                "name": "Prateleira balcão 2",
                "zone": "Balcão",
                "location_type": "prateleira",
                "description": "Seeded secondary shelf location for the same batch.",
                "quantity": 4,
                "received_offset_days": 3,
            },
            {
                "location_key": "showroom-gondola-01",
                "code": "SHOWROOM-GOND-01",
                "name": "Gôndola showroom 1",
                "zone": "Show room",
                "location_type": "gondola",
                "description": "Seeded showroom gôndola location demonstrating a batch split across the store.",
                "quantity": 8,
                "received_offset_days": 4,
            },
        ],
    }

    # Gives a handful of high-turnover items a real purchase/repurchase/sale
    # history (multiple InventoryMovement entries, staggered over the last
    # ~90 days, from different suppliers-facing staff) instead of a single
    # "initial stock" event — this is the timeline the audit trail screen is
    # meant to surface. Every item's final resulting_quantity below must
    # equal the item's seeded `quantity` in product_specs.
    purchase_history_by_key: dict[str, list[dict[str, object]]] = {
        "losartan": [
            {"movement_type": "initial", "delta": 40, "reason": "Seeded initial stock", "note": "Initial stock registration created by deterministic seed.", "reference_code": "SEED-INITIAL", "unit_cost": Decimal("15.80"), "days_ago": 90, "user_key": "user-pharmacist-lead"},
            {"movement_type": "entry", "delta": 30, "reason": "Reposição de estoque - compra recorrente", "note": "Recompra junto ao fornecedor habitual para repor o giro do mês.", "reference_code": "NF-2026-3412", "unit_cost": Decimal("16.00"), "days_ago": 35, "user_key": "user-pharmacist-lead"},
            {"movement_type": "exit", "delta": -6, "reason": "pdv_sale", "note": "Venda registrada no PDV.", "reference_code": "PV-8B21F0A4", "unit_cost": Decimal("16.00"), "days_ago": 6, "user_key": "user-cashier-lead"},
        ],
        "vitamin_c": [
            {"movement_type": "initial", "delta": 30, "reason": "Seeded initial stock", "note": "Initial stock registration created by deterministic seed.", "reference_code": "SEED-INITIAL", "unit_cost": Decimal("12.50"), "days_ago": 75, "user_key": "user-pharmacist-support"},
            {"movement_type": "entry", "delta": 25, "reason": "Reposição de estoque - compra recorrente", "note": "Recompra para atender a alta procura sazonal.", "reference_code": "NF-2026-3455", "unit_cost": Decimal("13.20"), "days_ago": 20, "user_key": "user-pharmacist-support"},
            {"movement_type": "exit", "delta": -4, "reason": "pdv_sale", "note": "Venda registrada no PDV.", "reference_code": "PV-5C9E3D17", "unit_cost": Decimal("13.20"), "days_ago": 3, "user_key": "user-cashier-support"},
        ],
        "dipyrone": [
            {"movement_type": "initial", "delta": 50, "reason": "Seeded initial stock", "note": "Initial stock registration created by deterministic seed.", "reference_code": "SEED-INITIAL", "unit_cost": Decimal("7.80"), "days_ago": 80, "user_key": "user-pharmacist-lead"},
            {"movement_type": "entry", "delta": 40, "reason": "Reposição de estoque - compra recorrente", "note": "Recompra para manter o giro de item de alta saída.", "reference_code": "NF-2026-3399", "unit_cost": Decimal("8.10"), "days_ago": 40, "user_key": "user-pharmacist-lead"},
            {"movement_type": "exit", "delta": -12, "reason": "pdv_sale", "note": "Venda registrada no PDV.", "reference_code": "PV-A47C1E92", "unit_cost": Decimal("8.10"), "days_ago": 12, "user_key": "user-cashier-lead"},
        ],
        "simethicone": [
            {"movement_type": "initial", "delta": 20, "reason": "Seeded initial stock", "note": "Initial stock registration created by deterministic seed.", "reference_code": "SEED-INITIAL", "unit_cost": Decimal("8.70"), "days_ago": 70, "user_key": "user-pharmacist-support"},
            {"movement_type": "entry", "delta": 20, "reason": "Reposição de estoque - compra recorrente", "note": "Recompra programada junto ao fornecedor.", "reference_code": "NF-2026-3444", "unit_cost": Decimal("9.10"), "days_ago": 18, "user_key": "user-pharmacist-support"},
            {"movement_type": "exit", "delta": -3, "reason": "pdv_sale", "note": "Venda registrada no PDV.", "reference_code": "PV-2F6B88D0", "unit_cost": Decimal("9.10"), "days_ago": 5, "user_key": "user-cashier-support"},
        ],
        "sunscreen": [
            {"movement_type": "initial", "delta": 15, "reason": "Seeded initial stock", "note": "Initial stock registration created by deterministic seed.", "reference_code": "SEED-INITIAL", "unit_cost": Decimal("39.80"), "days_ago": 60, "user_key": "user-pharmacist-lead"},
            {"movement_type": "exit", "delta": -15, "reason": "Ruptura de estoque - alta demanda no período", "note": "Produto esgotado após pico de vendas; reposição pendente junto ao fornecedor.", "reference_code": "AJUSTE-RUPTURA", "unit_cost": Decimal("39.80"), "days_ago": 4, "user_key": "user-pharmacist-lead"},
        ],
    }

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
                location_type="caixa" if item.storage_location.lower().startswith("cofre") else "estoque",
                is_controlled_only=item.storage_location.lower().startswith("cofre"),
                is_active=True,
            )

        history = purchase_history_by_key.get(key)
        if history:
            running_quantity = 0
            for index, event in enumerate(history):
                event_delta = int(event["delta"])
                quantity_before = running_quantity
                running_quantity += event_delta
                # Reuse the original "initial" movement id for the first event so
                # re-running the seed updates that row in place instead of leaving
                # a stale single-event duplicate behind (session.merge never deletes).
                movement_id = (
                    seed_uuid("inventory-movement-initial-" + key)
                    if index == 0
                    else seed_uuid("inventory-movement-" + key + "-" + str(index))
                )
                movements.append(
                    InventoryMovement(
                        id=movement_id,
                        tenant_id=item.tenant_id,
                        store_id=item.store_id,
                        inventory_item_id=item.id,
                        performed_by_user_id=seed_uuid(str(event["user_key"])),
                        movement_type=str(event["movement_type"]),
                        quantity_delta=event_delta,
                        quantity_before=quantity_before,
                        resulting_quantity=running_quantity,
                        reason=str(event["reason"]),
                        note=str(event["note"]),
                        reference_code=str(event["reference_code"]),
                        from_location_code=item.storage_location if event_delta < 0 else "",
                        to_location_code=item.storage_location,
                        unit_cost_snapshot=Decimal(str(event["unit_cost"])),
                        created_at=SEED_NOW - timedelta(days=int(event["days_ago"])),
                    )
                )

                reference_code = str(event["reference_code"])
                if str(event["movement_type"]) == "entry" and reference_code.startswith("NF-"):
                    unit_cost = Decimal(str(event["unit_cost"]))
                    product_total_amount = (unit_cost * event_delta).quantize(Decimal("0.01"))
                    invoice_total_amount = product_total_amount + invoice_extra_amount_by_reference.get(
                        reference_code, Decimal("0.00")
                    )
                    issue_date = SEED_NOW - timedelta(days=int(event["days_ago"]))
                    storage_key = "seed/invoices/" + key + "/" + reference_code + ".xml"
                    file_content = build_seed_invoice_xml(
                        reference_code=reference_code,
                        supplier_name=default_supplier.trade_name or default_supplier.legal_name,
                        item_name=item.name,
                        quantity=event_delta,
                        unit_cost=unit_cost,
                        product_total_amount=product_total_amount,
                        invoice_total_amount=invoice_total_amount,
                        issue_date=issue_date,
                    )
                    invoice_records.append(
                        InventoryInvoiceRecord(
                            id=seed_uuid("inventory-invoice-" + key + "-" + reference_code),
                            tenant_id=item.tenant_id,
                            store_id=item.store_id,
                            inventory_item_id=item.id,
                            uploaded_by_user_id=seed_uuid(str(event["user_key"])),
                            invoice_total_amount=invoice_total_amount,
                            product_total_amount=product_total_amount,
                            quantity=event_delta,
                            unit_cost=unit_cost,
                            file_name=reference_code + ".xml",
                            content_type="text/xml",
                            size_bytes=len(file_content),
                            storage_key=storage_key,
                            note="Nota fiscal seedada para " + item.name + " · " + str(event["reason"]),
                            created_at=issue_date,
                        )
                    )
                    invoice_files.append((storage_key, file_content))
            assert running_quantity == item.quantity, (
                "Seeded purchase history for '" + key + "' must end at the item's seeded quantity."
            )
        else:
            sold_today = daily_sold.get(key, 0)
            opening_quantity = item.quantity + sold_today
            movements.append(
                InventoryMovement(
                    id=seed_uuid("inventory-movement-initial-" + key),
                    tenant_id=item.tenant_id,
                    store_id=item.store_id,
                    inventory_item_id=item.id,
                    performed_by_user_id=seed_uuid("user-pharmacist-lead"),
                    movement_type="initial",
                    quantity_delta=opening_quantity,
                    quantity_before=0,
                    resulting_quantity=opening_quantity,
                    reason="Seeded initial stock",
                    note="Initial stock registration created by deterministic seed.",
                    reference_code="SEED-INITIAL",
                    from_location_code="",
                    to_location_code=item.storage_location,
                    unit_cost_snapshot=item.acquisition_cost,
                    created_at=SEED_NOW - timedelta(days=90),
                )
            )
            if sold_today > 0:
                movements.append(
                    InventoryMovement(
                        id=seed_uuid("inventory-movement-daily-exit-" + key),
                        tenant_id=item.tenant_id,
                        store_id=item.store_id,
                        inventory_item_id=item.id,
                        performed_by_user_id=seed_uuid("user-pharmacist-lead"),
                        movement_type="exit",
                        quantity_delta=-sold_today,
                        quantity_before=opening_quantity,
                        resulting_quantity=item.quantity,
                        reason="Vendas do dia",
                        note="Saidas geradas pelo seed para simular as vendas de PDV e pedidos online de hoje.",
                        reference_code="SEED-DAILY-SALES",
                        from_location_code=item.storage_location,
                        to_location_code=item.storage_location,
                        unit_cost_snapshot=item.acquisition_cost,
                        created_at=SEED_NOW,
                    )
                )

        origin_location = locations_by_code[item.storage_location]
        expiry_date = parse_expiry_label_to_date(item.expiry_label)
        shelf_splits = shelf_splits_by_key.get(key, [])
        total_shelf_split_quantity = sum(int(split["quantity"]) for split in shelf_splits)
        stock_location_quantity = item.quantity - total_shelf_split_quantity

        stock_lot = InventoryStockLot(
            id=seed_uuid("stock-lot-" + key),
            tenant_id=item.tenant_id,
            store_id=item.store_id,
            inventory_item_id=item.id,
            location_id=origin_location.id,
            supplier_id=default_supplier.id,
            batch_code=item.batch_code or "SEM-LOTE",
            expiry_date=expiry_date,
            quantity=stock_location_quantity,
            status="available",
            unit_cost_snapshot=item.acquisition_cost,
            received_at=SEED_NOW - timedelta(days=14),
            reference_code="SEED-INITIAL",
        )
        stock_lots.append(stock_lot)
        lot_movements.append(
            InventoryLotMovement(
                id=seed_uuid("lot-movement-receipt-" + key),
                tenant_id=item.tenant_id,
                store_id=item.store_id,
                inventory_item_id=item.id,
                stock_lot_id=stock_lot.id,
                performed_by_user_id=seed_uuid("user-pharmacist-lead"),
                movement_type="receipt",
                quantity_delta=item.quantity,
                quantity_before=0,
                resulting_quantity=item.quantity,
                to_location_id=origin_location.id,
                batch_code=stock_lot.batch_code,
                expiry_date=expiry_date,
                reason="Seeded initial stock",
                note="Initial stock registration created by deterministic seed.",
                reference_code="SEED-INITIAL",
                source_type="manual",
                unit_cost_snapshot=item.acquisition_cost,
            )
        )

        running_origin_quantity = item.quantity
        for split in shelf_splits:
            split_quantity = int(split["quantity"])
            location_key = str(split["location_key"])
            split_location = locations_by_code.get(str(split["code"]))
            if split_location is None:
                split_location = InventoryLocation(
                    id=seed_uuid("inventory-location-" + location_key),
                    tenant_id=item.tenant_id,
                    store_id=item.store_id,
                    code=str(split["code"]),
                    name=str(split["name"]),
                    zone=str(split["zone"]),
                    description=str(split["description"]),
                    temperature_range="Ambient",
                    location_type=str(split["location_type"]),
                    is_controlled_only=False,
                    is_active=True,
                )
                locations_by_code[split_location.code] = split_location

            split_quantity_before = running_origin_quantity
            running_origin_quantity -= split_quantity

            split_lot = InventoryStockLot(
                id=seed_uuid("stock-lot-" + key + "-" + location_key),
                tenant_id=item.tenant_id,
                store_id=item.store_id,
                inventory_item_id=item.id,
                location_id=split_location.id,
                supplier_id=default_supplier.id,
                batch_code=stock_lot.batch_code,
                expiry_date=expiry_date,
                quantity=split_quantity,
                status="available",
                unit_cost_snapshot=item.acquisition_cost,
                received_at=SEED_NOW - timedelta(days=int(split["received_offset_days"])),
                reference_code="SEED-SHELF-SPLIT",
            )
            stock_lots.append(split_lot)
            lot_movements.append(
                InventoryLotMovement(
                    id=seed_uuid("lot-movement-transfer-out-" + key + "-" + location_key),
                    tenant_id=item.tenant_id,
                    store_id=item.store_id,
                    inventory_item_id=item.id,
                    stock_lot_id=stock_lot.id,
                    performed_by_user_id=seed_uuid("user-pharmacist-lead"),
                    movement_type="transfer_out",
                    quantity_delta=-split_quantity,
                    quantity_before=split_quantity_before,
                    resulting_quantity=running_origin_quantity,
                    from_location_id=origin_location.id,
                    to_location_id=split_location.id,
                    batch_code=stock_lot.batch_code,
                    expiry_date=expiry_date,
                    reason="Reposição de " + str(split["zone"]).lower(),
                    note="Transferência criada pelo seed determinístico para demonstrar rastreabilidade por local.",
                    reference_code="SEED-SHELF-SPLIT",
                    source_type="manual",
                    unit_cost_snapshot=item.acquisition_cost,
                )
            )
            lot_movements.append(
                InventoryLotMovement(
                    id=seed_uuid("lot-movement-transfer-in-" + key + "-" + location_key),
                    tenant_id=item.tenant_id,
                    store_id=item.store_id,
                    inventory_item_id=item.id,
                    stock_lot_id=split_lot.id,
                    performed_by_user_id=seed_uuid("user-pharmacist-lead"),
                    movement_type="transfer_in",
                    quantity_delta=split_quantity,
                    quantity_before=0,
                    resulting_quantity=split_quantity,
                    from_location_id=origin_location.id,
                    to_location_id=split_location.id,
                    batch_code=stock_lot.batch_code,
                    expiry_date=expiry_date,
                    reason="Reposição de " + str(split["zone"]).lower(),
                    note="Transferência criada pelo seed determinístico para demonstrar rastreabilidade por local.",
                    reference_code="SEED-SHELF-SPLIT",
                    source_type="manual",
                    unit_cost_snapshot=item.acquisition_cost,
                )
            )

    # A handful of realistic field-level edits over time, for the audit
    # trail admin screen — the "quem mudou o quê, quando" complement to the
    # quantity-only purchase/sale history built above.
    def audit_actor(user_key: str) -> dict[str, str]:
        actor = users[user_key]
        return {
            "actor_user_id": actor.id,
            "actor_name": actor.full_name,
            "actor_email": actor.email,
            "actor_role": actor.role,
        }

    def audit_entry(
        *,
        entry_id: str,
        item_key: str,
        action: str,
        changes: list[dict[str, str]],
        user_key: str,
        days_ago: int,
        ip_address: str,
    ) -> InventoryAuditEntry:
        item = inventory[item_key]
        return InventoryAuditEntry(
            id=seed_uuid("inventory-audit-" + entry_id),
            tenant_id=item.tenant_id,
            store_id=item.store_id,
            entity_type="item",
            entity_id=item.id,
            entity_label=item.name,
            action=action,
            changes_json=json_text(changes),
            ip_address=ip_address,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Farmaura-Console/1.0",
            created_at=SEED_NOW - timedelta(days=days_ago),
            **audit_actor(user_key),
        )

    audit_entries.extend([
        audit_entry(
            entry_id="serum-create",
            item_key="serum",
            action="create",
            changes=[
                {"field": "name", "old": "", "new": "Serum facial vitamina C 30ml"},
                {"field": "category_name", "old": "", "new": "Perfumaria"},
                {"field": "sale_price", "old": "", "new": "89.90"},
                {"field": "acquisition_cost", "old": "", "new": "58.40"},
            ],
            user_key="admin",
            days_ago=91,
            ip_address="172.18.0.10",
        ),
        audit_entry(
            entry_id="losartan-price",
            item_key="losartan",
            action="update",
            changes=[{"field": "sale_price", "old": "27.50", "new": "28.90"}],
            user_key="pharmacist_lead",
            days_ago=34,
            ip_address="172.18.0.12",
        ),
        audit_entry(
            entry_id="vitamin-c-thresholds",
            item_key="vitamin_c",
            action="update",
            changes=[
                {"field": "low_stock_threshold", "old": "8", "new": "10"},
                {"field": "attention_stock_threshold", "old": "15", "new": "20"},
                {"field": "normal_stock_threshold", "old": "25", "new": "35"},
            ],
            user_key="pharmacist_support",
            days_ago=19,
            ip_address="172.18.0.34",
        ),
        audit_entry(
            entry_id="clonazepam-control",
            item_key="clonazepam",
            action="update",
            changes=[{"field": "controlled_category", "old": "tarja_vermelha", "new": "tarja_preta"}],
            user_key="admin",
            days_ago=50,
            ip_address="172.18.0.10",
        ),
        audit_entry(
            entry_id="sunscreen-marketplace",
            item_key="sunscreen",
            action="update",
            changes=[{"field": "is_marketplace_visible", "old": "true", "new": "false"}],
            user_key="admin",
            days_ago=4,
            ip_address="172.18.0.10",
        ),
        audit_entry(
            entry_id="dipyrone-brand",
            item_key="dipyrone",
            action="update",
            changes=[{"field": "brand_name", "old": "Novalgina Genérico", "new": "Novalgina"}],
            user_key="pharmacist_lead",
            days_ago=60,
            ip_address="172.18.0.12",
        ),
        audit_entry(
            entry_id="simethicone-price",
            item_key="simethicone",
            action="update",
            changes=[{"field": "sale_price", "old": "15.90", "new": "16.90"}],
            user_key="pharmacist_support",
            days_ago=17,
            ip_address="172.18.0.34",
        ),
        audit_entry(
            entry_id="amoxicillin-thresholds",
            item_key="amoxicillin",
            action="update",
            changes=[
                {"field": "low_stock_threshold", "old": "0", "new": "10"},
                {"field": "attention_stock_threshold", "old": "0", "new": "35"},
                {"field": "normal_stock_threshold", "old": "0", "new": "60"},
            ],
            user_key="admin",
            days_ago=85,
            ip_address="172.18.0.10",
        ),
    ])

    return {
        "locations": list(locations_by_code.values()),
        "movements": movements,
        "stock_lots": stock_lots,
        "lot_movements": lot_movements,
        "audit_entries": audit_entries,
        "invoice_records": invoice_records,
        "invoice_files": invoice_files,
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
        driver_user_id=users["delivery_driver"].id,
        route_code="ROT-1001",
        route_status="completed",
        driver_name_snapshot="Marcos Pereira",
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
        driver_user_id=users["delivery_driver"].id,
        route_code="ROT-1002",
        route_status="dispatched",
        driver_name_snapshot="Marcos Pereira",
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


def build_daily_operations(
    users: dict[str, User],
    customers: dict[str, Customer],
    catalog: dict[str, dict[str, object]],
    assets: dict[str, list[object]],
) -> dict[str, object]:
    """Build a full day's worth of PDV sales, online orders, deliveries, fiscal
    documents, cashback, and support chat threads, layered on top of the 30 bulk
    catalog products only (never the 10 curated ones) so the curated purchase
    history, shelf-split, and audit-trail narratives in build_inventory_operations
    stay completely untouched. Returns the generated records plus a `sold_today`
    map (inventory item key -> quantity sold) consumed by build_inventory_operations
    to reconcile each bulk item's opening stock and movement history.
    """

    inventory = catalog["inventory"]
    listings = catalog["listings"]
    bulk_keys: list[str] = catalog["bulk_product_keys"]  # type: ignore[assignment]

    addresses_by_customer: dict[str, CustomerAddress] = {}
    for address in assets["addresses"]:
        if isinstance(address, CustomerAddress) and address.customer_id not in addresses_by_customer:
            addresses_by_customer[address.customer_id] = address

    bulk_customer_keys = sorted(key for key in customers if key.startswith("bulk_customer_"))
    day_start = datetime(2026, 6, 11, 0, 0, tzinfo=UTC)

    store_configs = [
        {
            "suffix": "", "store_id": STORE_ID, "store_name": STORE_NAME, "store_address": STORE_ADDRESS,
            "latitude": STORE_LATITUDE, "longitude": STORE_LONGITUDE,
            "cashier_key": "cashier_lead", "pharmacist_key": "pharmacist_lead", "code_base": 100,
        },
        {
            "suffix": "_aguas_claras", "store_id": SECOND_STORE_ID, "store_name": SECOND_STORE_NAME, "store_address": SECOND_STORE_ADDRESS,
            "latitude": SECOND_STORE_LATITUDE, "longitude": SECOND_STORE_LONGITUDE,
            "cashier_key": "cashier_support", "pharmacist_key": "pharmacist_support", "code_base": 200,
        },
    ]

    remaining_stock: dict[str, int] = {}
    for key in bulk_keys:
        remaining_stock[key] = int(inventory[key].quantity)
        remaining_stock[key + "_aguas_claras"] = int(inventory[key + "_aguas_claras"].quantity)
    sold_today: dict[str, int] = {}

    def take_stock(item_key: str, desired: int) -> int:
        """Decrement the working stock counter and record the sale, returning the actual quantity taken."""

        available = remaining_stock.get(item_key, 0)
        quantity = min(desired, available)
        if quantity <= 0:
            return 0
        remaining_stock[item_key] -= quantity
        sold_today[item_key] = sold_today.get(item_key, 0) + quantity
        return quantity

    pdv_orders: list[PdvOrder] = []
    pdv_order_items: list[PdvOrderItem] = []
    pdv_sales: list[PdvSale] = []
    pdv_sale_items: list[PdvSaleItem] = []
    online_orders: list[Order] = []
    online_items: list[OrderItem] = []
    online_fulfillments: list[OrderFulfillment] = []
    online_events: list[OrderStatusEvent] = []
    routes: list[DeliveryRoute] = []
    stops: list[DeliveryRouteStop] = []
    fiscal_documents: list[FiscalDocument] = []
    cashback_transactions: list[CashbackTransaction] = []
    chat_threads: list[ChatThread] = []
    chat_messages: list[ChatMessage] = []

    payment_method_cycle = ["pix", "credit_card", "debit_card", "cash"]

    # ---- PDV sales: ~20 per store spread across the day ----
    pdv_counter = 0
    for store in store_configs:
        cashier = users[str(store["cashier_key"])]
        pharmacist = users[str(store["pharmacist_key"])]
        for local_index in range(20):
            i = pdv_counter
            pdv_counter += 1
            hour = 8 + (i * 37) % 11
            minute = (i * 13) % 60
            timestamp = day_start + timedelta(hours=hour, minutes=minute)

            status_roll = local_index % 10
            order_status = "queued" if status_roll < 2 else ("refunded" if status_roll < 4 else "completed")
            is_walkin = local_index % 5 == 4
            customer = None if is_walkin else customers[bulk_customer_keys[i % len(bulk_customer_keys)]]

            item_count = 1 + i % 2
            base_keys = [bulk_keys[(i + n) % len(bulk_keys)] for n in range(item_count)]
            base_keys = list(dict.fromkeys(base_keys))

            subtotal = Decimal("0.00")
            line_defs: list[tuple[str, str, int, Decimal, Decimal]] = []
            for base_key in base_keys:
                item_key = base_key + str(store["suffix"])
                quantity = take_stock(item_key, 1 + i % 2)
                if quantity <= 0:
                    continue
                unit_price = inventory[item_key].sale_price
                line_total = (unit_price * quantity).quantize(Decimal("0.01"))
                subtotal += line_total
                line_defs.append((base_key, item_key, quantity, unit_price, line_total))
            if not line_defs:
                continue

            discount_percent = Decimal("5.00") if i % 8 == 0 else Decimal("0.00")
            discount_amount = (subtotal * discount_percent / Decimal("100.00")).quantize(Decimal("0.01"))
            total = subtotal - discount_amount
            order_code = f"PV-{int(store['code_base']) + 1000 + i:04d}"
            sale_code = f"PS-{int(store['code_base']) + 2000 + i:04d}"
            order_id = seed_uuid("bulk-pdv-order-" + str(i))

            pdv_orders.append(PdvOrder(
                id=order_id,
                tenant_id=TENANT_ID,
                store_id=str(store["store_id"]),
                order_code=order_code,
                customer_id=customer.id if customer else None,
                pharmacist_user_id=pharmacist.id,
                cashier_user_id=None if order_status == "queued" else cashier.id,
                order_status=order_status,
                service_role="cashier",
                customer_display_name=customer.full_name if customer else "Cliente balcao",
                customer_document_snapshot=customer.cpf if customer else "",
                customer_phone_snapshot=customer.phone if customer else "",
                includes_controlled_items=False,
                include_cpf_on_invoice=bool(customer),
                discount_percent=money(str(discount_percent)),
                cashback_applied_amount=money("0.00"),
                subtotal_amount=money(str(subtotal)),
                discount_amount=money(str(discount_amount)),
                total_amount=money(str(total)),
                queued_at_label=label(timestamp),
                claimed_at_label="" if order_status == "queued" else label(timestamp + timedelta(minutes=2)),
                completed_at_label="" if order_status == "queued" else label(timestamp + timedelta(minutes=9)),
                notes="Venda gerada pelo seed para simular o movimento do dia.",
            ))
            for base_key, item_key, quantity, unit_price, line_total in line_defs:
                item = inventory[item_key]
                pdv_order_items.append(PdvOrderItem(
                    id=seed_uuid("bulk-pdv-order-item-" + str(i) + "-" + item_key),
                    pdv_order_id=order_id,
                    inventory_item_id=item.id,
                    marketplace_listing_id=listings[base_key].id,
                    item_name_snapshot=str(item.name),
                    brand_name_snapshot=str(item.brand_name),
                    ean_code_snapshot=str(item.ean_code),
                    storage_location_snapshot=str(item.storage_location),
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                ))

            if order_status in ("completed", "refunded"):
                sale_status = order_status
                payment_status = "paid" if order_status == "completed" else "refunded"
                cashback_earned = (total * Decimal("0.03")).quantize(Decimal("0.01")) if customer and order_status == "completed" else Decimal("0.00")
                sale_id = seed_uuid("bulk-pdv-sale-" + str(i))
                pdv_sales.append(PdvSale(
                    id=sale_id,
                    tenant_id=TENANT_ID,
                    store_id=str(store["store_id"]),
                    sale_code=sale_code,
                    pdv_order_id=order_id,
                    customer_id=customer.id if customer else None,
                    cashier_user_id=cashier.id,
                    pharmacist_user_id=pharmacist.id,
                    payment_method=payment_method_cycle[i % len(payment_method_cycle)],
                    payment_status=payment_status,
                    sale_status=sale_status,
                    include_cpf_on_invoice=bool(customer),
                    customer_display_name=customer.full_name if customer else "Cliente balcao",
                    customer_document_snapshot=customer.cpf if customer else "",
                    subtotal_amount=money(str(subtotal)),
                    discount_amount=money(str(discount_amount)),
                    cashback_applied_amount=money("0.00"),
                    cashback_earned_amount=money(str(cashback_earned)),
                    total_amount=money(str(total)),
                    completed_at_label=label(timestamp + timedelta(minutes=9)),
                ))
                for base_key, item_key, quantity, unit_price, line_total in line_defs:
                    item = inventory[item_key]
                    pdv_sale_items.append(PdvSaleItem(
                        id=seed_uuid("bulk-pdv-sale-item-" + str(i) + "-" + item_key),
                        pdv_sale_id=sale_id,
                        inventory_item_id=item.id,
                        item_name_snapshot=str(item.name),
                        brand_name_snapshot=str(item.brand_name),
                        storage_location_snapshot=str(item.storage_location),
                        quantity=quantity,
                        unit_price=unit_price,
                        line_total=line_total,
                        is_controlled=False,
                    ))
                fiscal_documents.append(FiscalDocument(
                    id=seed_uuid("bulk-fiscal-pdv-" + str(i)),
                    tenant_id=TENANT_ID,
                    store_id=str(store["store_id"]),
                    document_type="nfce",
                    source_channel="pdv",
                    pdv_sale_id=sale_id,
                    order_id=None,
                    issued_by_user_id=cashier.id,
                    customer_id=customer.id if customer else None,
                    document_number=str(52000 + i),
                    access_key=f"3526061234567800012355001000052{2000 + i:04d}1000{52000 + i}",
                    series_code="001",
                    issue_datetime_label=label(timestamp + timedelta(minutes=9)),
                    payment_method_snapshot=payment_method_cycle[i % len(payment_method_cycle)],
                    recipient_name_snapshot=customer.full_name if customer else "Consumidor",
                    recipient_document_snapshot=customer.cpf if customer else "",
                    gross_total_amount=money(str(total)),
                    approximate_tax_amount=money(str((total * Decimal("0.085")).quantize(Decimal("0.01")))),
                    authorized=order_status == "completed",
                ))
                if customer and order_status == "completed" and cashback_earned > Decimal("0.00"):
                    cashback_transactions.append(CashbackTransaction(
                        id=seed_uuid("bulk-cashback-pdv-" + str(i)),
                        tenant_id=TENANT_ID,
                        customer_id=customer.id,
                        wallet_id=seed_uuid("wallet-" + bulk_customer_keys[i % len(bulk_customer_keys)]),
                        transaction_type="earn",
                        transaction_status="available",
                        source_channel="pdv",
                        source_reference=sale_code,
                        order_id=None,
                        sale_reference=sale_code,
                        gross_amount=money(str(cashback_earned)),
                        net_amount=money(str(cashback_earned)),
                        wallet_balance_after=customer.cashback_balance,
                        granted_at_label=label(timestamp + timedelta(minutes=9)),
                        available_at_label=label(timestamp + timedelta(minutes=9)),
                        expires_at_label="09/09/2026",
                        notes="Cashback ganho em venda presencial gerada pelo seed diario.",
                    ))

    # ---- Online marketplace orders: 25 across both stores, realistic status mix ----
    status_plan = (
        ["delivered"] * 8
        + ["dispatched"] * 5
        + ["ready"] * 4
        + ["separating"] * 4
        + ["new"] * 2
        + ["cancelled"] * 2
    )
    delivered_or_dispatched_orders_by_store: dict[str, list[tuple[Order, OrderFulfillment]]] = {STORE_ID: [], SECOND_STORE_ID: []}
    for i, order_status in enumerate(status_plan):
        store = store_configs[i % 2]
        store_id = str(store["store_id"])
        hour = 7 + (i * 41) % 12
        minute = (i * 19) % 60
        placed_at = day_start + timedelta(hours=hour, minutes=minute)
        customer = customers[bulk_customer_keys[(i * 3 + 1) % len(bulk_customer_keys)]]
        address = addresses_by_customer.get(customer.id)

        item_count = 1 + i % 2
        base_keys = list(dict.fromkeys(bulk_keys[(i * 2 + n) % len(bulk_keys)] for n in range(item_count)))
        subtotal = Decimal("0.00")
        line_defs: list[tuple[str, str, int, Decimal, Decimal]] = []
        for base_key in base_keys:
            item_key = base_key + str(store["suffix"])
            quantity = take_stock(item_key, 1 + i % 2)
            if quantity <= 0:
                continue
            unit_price = listings[base_key].published_price
            line_total = (unit_price * quantity).quantize(Decimal("0.01"))
            subtotal += line_total
            line_defs.append((base_key, item_key, quantity, unit_price, line_total))
        if not line_defs:
            continue

        is_pickup = order_status == "ready" and i % 2 == 0
        fulfillment_type = "pickup" if is_pickup else "delivery"
        delivery_fee = Decimal("0.00") if fulfillment_type == "pickup" else Decimal("9.90")
        discount_amount = (subtotal * Decimal("0.03")).quantize(Decimal("0.01")) if i % 5 == 0 else Decimal("0.00")
        total = subtotal + delivery_fee - discount_amount
        cashback_earned = (total * Decimal("0.04")).quantize(Decimal("0.01")) if order_status not in ("cancelled",) else Decimal("0.00")
        order_code = f"FA-{1100 + i:04d}"
        order_id = seed_uuid("bulk-order-" + str(i))
        payment_method = payment_method_cycle[i % len(payment_method_cycle)]

        status_value = {
            "delivered": OrderStatus.DELIVERED.value,
            "dispatched": OrderStatus.DISPATCHED.value,
            "ready": OrderStatus.READY.value,
            "separating": OrderStatus.SEPARATING.value,
            "new": OrderStatus.NEW.value,
            "cancelled": OrderStatus.CANCELLED.value,
        }[order_status]

        online_orders.append(Order(
            id=order_id,
            tenant_id=TENANT_ID,
            store_id=store_id,
            customer_id=customer.id,
            selected_address_id=address.id if (address and fulfillment_type == "delivery") else None,
            selected_payment_method_id=None,
            order_code=order_code,
            channel="app" if i % 2 == 0 else "web",
            status=status_value,
            fulfillment_type=fulfillment_type,
            priority="normal",
            payment_method_label=payment_method,
            payment_status="refunded" if order_status == "cancelled" else "paid",
            customer_display_name=customer.full_name,
            customer_document_snapshot=customer.cpf,
            customer_phone_snapshot=customer.phone,
            customer_email_snapshot=customer.email,
            requires_prescription_review=False,
            prescription_status="none",
            subtotal_amount=money(str(subtotal)),
            delivery_fee_amount=money(str(delivery_fee)),
            discount_amount=money(str(discount_amount)),
            cashback_applied_amount=money("0.00"),
            cashback_earned_amount=money(str(cashback_earned)),
            total_amount=money(str(total)),
            placed_at_label=label(placed_at),
            estimated_ready_at_label=label(placed_at + timedelta(minutes=25)),
            estimated_delivery_at_label="" if fulfillment_type == "pickup" else label(placed_at + timedelta(minutes=55)),
            completed_at_label=label(placed_at + timedelta(minutes=60)) if order_status in ("delivered", "cancelled") else "",
            marketplace_note="",
            internal_note="Pedido gerado pelo seed para simular o movimento do dia.",
            is_active=order_status != "cancelled",
        ))
        for base_key, item_key, quantity, unit_price, line_total in line_defs:
            item = inventory[item_key]
            listing = listings[base_key]
            online_items.append(OrderItem(
                id=seed_uuid("bulk-order-item-" + str(i) + "-" + item_key),
                order_id=order_id,
                inventory_item_id=item.id,
                marketplace_listing_id=listing.id,
                item_sku=str(listing.listing_sku),
                item_name_snapshot=str(listing.title),
                brand_name_snapshot=str(listing.brand_name),
                category_name_snapshot=str(listing.category_name),
                ean_code_snapshot=str(listing.ean_code),
                storage_location_snapshot=str(item.storage_location),
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
                requires_prescription_upload=False,
                prescription_status="none",
                picked_for_fulfillment=order_status in ("ready", "dispatched", "delivered"),
                picked_at_label=label(placed_at + timedelta(minutes=18)) if order_status in ("ready", "dispatched", "delivered") else "",
            ))

        recipient_lat = Decimal(str(store["latitude"])) + Decimal(str(round(0.004 * ((i % 9) - 4), 4)))
        recipient_lng = Decimal(str(store["longitude"])) + Decimal(str(round(0.004 * ((i % 7) - 3), 4)))
        fulfillment = OrderFulfillment(
            id=seed_uuid("bulk-fulfillment-" + str(i)),
            order_id=order_id,
            fulfillment_type=fulfillment_type,
            store_label=str(store["store_name"]),
            pickup_code=f"PICK-{4000 + i:04d}" if fulfillment_type == "pickup" else "",
            recipient_name=customer.full_name,
            recipient_document_snapshot=customer.cpf,
            recipient_phone=customer.phone,
            address_line=(address.street_line if (address and fulfillment_type == "delivery") else str(store["store_address"])),
            district=(address.district if (address and fulfillment_type == "delivery") else "Sede"),
            city=(address.city if (address and fulfillment_type == "delivery") else "Brasilia"),
            state_code=(address.state_code if (address and fulfillment_type == "delivery") else "DF"),
            postal_code=(address.postal_code if (address and fulfillment_type == "delivery") else ""),
            reference_note=(address.reference_note if (address and fulfillment_type == "delivery") else ""),
            latitude=recipient_lat,
            longitude=recipient_lng,
            route_distance_km=money(str(Decimal("1.20") + Decimal(str(i % 10)) * Decimal("0.35"))),
            route_sequence=(i % 4) + 1 if order_status in ("dispatched", "delivered") else 0,
            sla_target_minutes=90,
            eta_label="Entregue" if order_status == "delivered" else ("A caminho" if order_status == "dispatched" else "Em preparo"),
            ready_at_label=label(placed_at + timedelta(minutes=25)) if order_status != "new" else "",
            dispatched_at_label=label(placed_at + timedelta(minutes=35)) if order_status in ("dispatched", "delivered") else "",
            delivered_at_label=label(placed_at + timedelta(minutes=60)) if order_status == "delivered" else "",
            picked_up_at_label=label(placed_at + timedelta(minutes=30)) if fulfillment_type == "pickup" and order_status == "delivered" else "",
            driver_name=("Rota Farmaura " + str(store["code_base"])) if order_status in ("dispatched", "delivered") else "",
            driver_phone="+55 61 98800-" + f"{2000 + i:04d}" if order_status in ("dispatched", "delivered") else "",
        )
        online_fulfillments.append(fulfillment)

        online_events.append(OrderStatusEvent(
            id=seed_uuid("bulk-order-event-" + str(i) + "-created"),
            order_id=order_id,
            actor_user_id=None,
            event_type="created",
            source_channel="marketplace",
            from_status="draft",
            to_status="new",
            actor_name_snapshot="Marketplace",
            actor_role_snapshot="system",
            occurred_at_label=label(placed_at),
            notes="Pedido recebido pelo checkout.",
        ))
        if order_status != "new":
            pharmacist = users[str(store["pharmacist_key"])]
            online_events.append(OrderStatusEvent(
                id=seed_uuid("bulk-order-event-" + str(i) + "-final"),
                order_id=order_id,
                actor_user_id=pharmacist.id if order_status != "cancelled" else None,
                event_type="status_change" if order_status != "cancelled" else "cancelled",
                source_channel="internal",
                from_status="new",
                to_status=status_value,
                actor_name_snapshot=pharmacist.full_name if order_status != "cancelled" else "Marketplace",
                actor_role_snapshot="pharmacist" if order_status != "cancelled" else "system",
                occurred_at_label=label(placed_at + timedelta(minutes=30)),
                notes="Atualizacao gerada pelo seed para simular o movimento do dia.",
            ))

        if order_status in ("delivered", "dispatched"):
            delivered_or_dispatched_orders_by_store[store_id].append((online_orders[-1], fulfillment))

        fiscal_documents.append(FiscalDocument(
            id=seed_uuid("bulk-fiscal-order-" + str(i)),
            tenant_id=TENANT_ID,
            store_id=store_id,
            document_type="nfce",
            source_channel="marketplace",
            pdv_sale_id=None,
            order_id=order_id,
            issued_by_user_id=users[str(store["cashier_key"])].id,
            customer_id=customer.id,
            document_number=str(53000 + i),
            access_key=f"3526061234567800012355001000053{3000 + i:04d}1000{53000 + i}",
            series_code="001",
            issue_datetime_label=label(placed_at + timedelta(minutes=20)),
            payment_method_snapshot=payment_method,
            recipient_name_snapshot=customer.full_name,
            recipient_document_snapshot=customer.cpf,
            gross_total_amount=money(str(total)),
            approximate_tax_amount=money(str((total * Decimal("0.085")).quantize(Decimal("0.01")))),
            authorized=order_status != "cancelled",
        ))

        if cashback_earned > Decimal("0.00"):
            cashback_transactions.append(CashbackTransaction(
                id=seed_uuid("bulk-cashback-order-" + str(i)),
                tenant_id=TENANT_ID,
                customer_id=customer.id,
                wallet_id=seed_uuid("wallet-" + bulk_customer_keys[(i * 3 + 1) % len(bulk_customer_keys)]),
                transaction_type="earn",
                transaction_status="available" if order_status == "delivered" else "pending",
                source_channel="marketplace",
                source_reference=order_code,
                order_id=order_id,
                sale_reference="",
                gross_amount=money(str(cashback_earned)),
                net_amount=money(str(cashback_earned)),
                wallet_balance_after=customer.cashback_balance,
                granted_at_label=label(placed_at + timedelta(minutes=30)),
                available_at_label=label(placed_at + timedelta(minutes=60)) if order_status == "delivered" else "",
                expires_at_label="09/09/2026",
                notes="Cashback gerado pelo seed diario.",
            ))

        if i % 3 == 0 and len(chat_threads) < 10:
            thread_id = seed_uuid("bulk-thread-" + str(i))
            chat_threads.append(ChatThread(
                id=thread_id,
                tenant_id=TENANT_ID,
                order_id=order_id,
                customer_id=customer.id,
                pharmacist_user_id=users[str(store["pharmacist_key"])].id,
                thread_code="CHAT-" + order_code,
                source_channel="marketplace",
                thread_status="open" if order_status in ("new", "separating", "dispatched") else "closed",
                topic="Duvida sobre o pedido " + order_code,
                customer_name_snapshot=customer.full_name,
                pharmacist_name_snapshot=users[str(store["pharmacist_key"])].full_name,
                order_code_snapshot=order_code,
                last_message_preview="Obrigado pela atualizacao!",
                last_message_at_label=label(placed_at + timedelta(minutes=40)),
                customer_unread_count=0,
                pharmacist_unread_count=0,
                is_active=True,
            ))
            chat_messages.append(ChatMessage(
                id=seed_uuid("bulk-chat-message-" + str(i) + "-1"),
                thread_id=thread_id,
                sender_user_id=None,
                sender_customer_id=customer.id,
                message_type="text",
                sender_role="customer",
                sender_name_snapshot=customer.full_name,
                body_text="Oi, qual a previsao para o pedido " + order_code + "?",
                sent_at_label=label(placed_at + timedelta(minutes=35)),
                customer_read=True,
                pharmacist_read=True,
                is_internal_note=False,
            ))
            chat_messages.append(ChatMessage(
                id=seed_uuid("bulk-chat-message-" + str(i) + "-2"),
                thread_id=thread_id,
                sender_user_id=users[str(store["pharmacist_key"])].id,
                sender_customer_id=None,
                message_type="text",
                sender_role="pharmacist",
                sender_name_snapshot=users[str(store["pharmacist_key"])].full_name,
                body_text="Ola! " + ("Seu pedido ja foi entregue." if order_status == "delivered" else "Estamos preparando seu pedido com carinho."),
                sent_at_label=label(placed_at + timedelta(minutes=40)),
                customer_read=True,
                pharmacist_read=True,
                is_internal_note=False,
            ))

    # ---- Delivery routes: one route per store covering its dispatched/delivered bulk orders ----
    for store in store_configs:
        store_id = str(store["store_id"])
        store_orders = delivered_or_dispatched_orders_by_store[store_id]
        if not store_orders:
            continue
        route_id = seed_uuid("bulk-route-" + store_id)
        route_status = "completed" if all(order.status == OrderStatus.DELIVERED.value for order, _ in store_orders) else "dispatched"
        routes.append(DeliveryRoute(
            id=route_id,
            tenant_id=TENANT_ID,
            store_id=store_id,
            driver_user_id=users["delivery_driver"].id,
            route_code="ROT-" + str(int(store["code_base"]) + 1),
            route_status=route_status,
            driver_name_snapshot=users["delivery_driver"].full_name,
            vehicle_label="Moto 0" + ("1" if store_id == STORE_ID else "2"),
            origin_name=str(store["store_name"]),
            origin_address=str(store["store_address"]),
            origin_latitude=store["latitude"],
            origin_longitude=store["longitude"],
            stop_count=len(store_orders),
            total_distance_km=money(str(Decimal("1.50") * len(store_orders))),
            saved_distance_km=money("0.80"),
            estimated_duration_minutes=25 * len(store_orders),
            route_provider="seed-routing",
            route_polyline="enc:seed-" + route_id[:8],
            planned_at_label=label(day_start + timedelta(hours=8)),
            dispatched_at_label=label(day_start + timedelta(hours=8, minutes=30)),
            completed_at_label=label(day_start + timedelta(hours=13)) if route_status == "completed" else "",
        ))
        for stop_sequence, (order, fulfillment) in enumerate(store_orders, start=1):
            delivered = order.status == OrderStatus.DELIVERED.value
            stops.append(DeliveryRouteStop(
                id=seed_uuid("bulk-route-stop-" + order.id),
                route_id=route_id,
                order_id=order.id,
                order_fulfillment_id=fulfillment.id,
                stop_sequence=stop_sequence,
                stop_status="delivered" if delivered else "en_route",
                customer_name_snapshot=str(order.customer_display_name),
                address_line_snapshot=str(fulfillment.address_line),
                district_snapshot=str(fulfillment.district),
                postal_code_snapshot=str(fulfillment.postal_code),
                latitude=fulfillment.latitude,
                longitude=fulfillment.longitude,
                distance_from_origin_km=fulfillment.route_distance_km,
                estimated_arrival_label=str(fulfillment.eta_label),
                arrived_at_label=str(fulfillment.delivered_at_label) if delivered else "",
                delivered_at_label=str(fulfillment.delivered_at_label) if delivered else "",
                navigation_url=f"https://maps.google.com/?q={fulfillment.latitude},{fulfillment.longitude}",
            ))

    return {
        "pdv_orders": pdv_orders,
        "pdv_order_items": pdv_order_items,
        "pdv_sales": pdv_sales,
        "pdv_sale_items": pdv_sale_items,
        "online_orders": online_orders,
        "online_items": online_items,
        "online_fulfillments": online_fulfillments,
        "online_events": online_events,
        "routes": routes,
        "stops": stops,
        "fiscal_documents": fiscal_documents,
        "cashback_transactions": cashback_transactions,
        "chat_threads": chat_threads,
        "chat_messages": chat_messages,
        "sold_today": sold_today,
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


async def seed_database(session_factory: async_sessionmaker[AsyncSession] | None = None) -> None:
    """Execute the deterministic seed flow against the configured database.

    Accepts an optional session_factory so bootstrap_database.py can run the
    seed over the admin database connection instead of the app's own
    restricted runtime-role SessionFactory, since seeding writes across every
    tenant with no per-request RLS context.
    """

    factory = session_factory or SessionFactory
    password_hash = hash_password(DEFAULT_PASSWORD)
    cnae_settings = build_cnae_settings()
    stores = build_stores()
    users = build_users(password_hash)
    customers = build_customers()
    catalog = build_catalog()
    suppliers = build_suppliers()
    brand_suppliers = build_brand_suppliers(catalog, suppliers)
    customer_assets = build_customer_assets(customers)
    daily = build_daily_operations(users, customers, catalog, customer_assets)
    inventory_operations = build_inventory_operations(catalog, suppliers, users, daily_sold=daily["sold_today"])
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

    async with factory() as session:
        await upsert_many(session, [cnae_settings])
        await upsert_many(session, list(stores.values()))
        await upsert_many(session, list(users.values()))
        await upsert_many(session, list(customers.values()))
        await upsert_many(session, list(suppliers.values()))
        await upsert_many(session, inventory_operations["locations"])
        await upsert_many(session, list(catalog["brands"].values()))
        await upsert_many(session, brand_suppliers)
        await upsert_many(session, list(catalog["categories"].values()))
        await upsert_many(session, list(catalog["therapeutic_classes"].values()))
        await upsert_many(session, list(catalog["inventory_products"].values()))
        await upsert_many(session, list(catalog["inventory"].values()))
        await upsert_many(session, inventory_operations["movements"])
        await upsert_many(session, inventory_operations["stock_lots"])
        await upsert_many(session, inventory_operations["lot_movements"])
        await upsert_many(session, inventory_operations["audit_entries"])
        await upsert_many(session, inventory_operations["invoice_records"])
        await upsert_many(session, list(catalog["listings"].values()))
        await upsert_many(session, list(catalog["rules"].values()))
        await upsert_many(session, customer_assets["addresses"])
        await upsert_many(session, customer_assets["payment_methods"])
        await upsert_many(session, customer_assets["wallets"])
        await upsert_many(session, services["services"])
        await upsert_many(session, services["appointments"])
        await upsert_many(session, saved_and_subscriptions["saved_products"])
        await upsert_many(session, saved_and_subscriptions["subscriptions"])
        await upsert_many(session, list(orders_data["orders"].values()) + daily["online_orders"])
        await upsert_many(session, orders_data["items"] + daily["online_items"])
        await upsert_many(session, orders_data["fulfillments"] + daily["online_fulfillments"])
        await upsert_many(session, orders_data["events"] + daily["online_events"])
        await upsert_many(session, logistics["routes"] + daily["routes"])
        await upsert_many(session, logistics["stops"] + daily["stops"])
        await upsert_many(session, list(pdv_data["orders"].values()) + daily["pdv_orders"])
        await upsert_many(session, pdv_data["items"] + daily["pdv_order_items"])
        await upsert_many(session, list(pdv_data["sales"].values()) + daily["pdv_sales"])
        await upsert_many(session, pdv_data["sale_items"] + daily["pdv_sale_items"])
        await upsert_many(session, fiscal_documents + daily["fiscal_documents"])
        await upsert_many(session, prescription_data["file_assets"])
        await upsert_many(session, prescription_data["prescriptions"])
        await upsert_many(session, prescription_data["prescription_files"])
        await upsert_many(session, prescription_data["checks"])
        await upsert_many(session, prescription_data["items"])
        await upsert_many(session, cashback["transactions"] + daily["cashback_transactions"])
        await upsert_many(session, cashback["lines"])
        await upsert_many(session, chat["threads"] + daily["chat_threads"])
        await upsert_many(session, chat["messages"] + daily["chat_messages"])
        await upsert_many(session, chat["attachments"])
        await upsert_many(session, audit_events)
        await upsert_many(session, refresh_tokens)
        await session.commit()

    settings = get_settings()
    for storage_key, file_content in inventory_operations["invoice_files"]:
        await write_private_file(settings=settings, storage_key=storage_key, content=file_content)

    print("Seed concluido com sucesso.")
    print("Tenant ID:", TENANT_ID)
    print("Store ID:", STORE_ID)
    print("Segunda loja (Aguas Claras) ID:", SECOND_STORE_ID)
    print("Senha padrao para todos os usuarios:", DEFAULT_PASSWORD)
    print("Usuario admin:", users["admin"].email)
    print("Usuario farmaceutico com 2FA:", users["pharmacist_lead"].email)
    print("Usuario gerente (loja Aguas Claras):", users["store_manager"].email)
    print("Usuario caixa:", users["cashier_lead"].email)
    print("Usuario cliente marketplace:", users["customer_mariana"].email)
    print("Usuario cliente marketplace com 2FA:", users["customer_camila"].email)
    print("Segredo TOTP para contas com 2FA:", MFA_SECRET)
    print("Produtos unicos cadastrados:", len(catalog["inventory_products"]))
    print("Itens de estoque (todas as lojas):", len(catalog["inventory"]))
    print("Clientes cadastrados:", len(customers))
    print("Vendas PDV geradas para hoje:", len(daily["pdv_orders"]))
    print("Pedidos online gerados para hoje:", len(daily["online_orders"]))
    print("Rotas de entrega geradas para hoje:", len(daily["routes"]))


def main() -> None:
    """Run the asynchronous seed flow."""

    reconcile_schema_for_seed()
    asyncio.run(seed_database())


if __name__ == "__main__":
    main()
