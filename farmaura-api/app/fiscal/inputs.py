"""
farmaura-api/app/fiscal/inputs.py

Plain data structures the NFC-e engine consumes.

Responsibilities:
- describe the emitter, recipient, items, tax profiles and payments without any ORM dependency;
- keep the XML builder testable in isolation from the database;

Observations:
- every tax value here comes from a stored product fiscal profile or from configuration, never from a
  default invented by the engine: a missing value means the document cannot be emitted;
- money is always `Decimal`; the builder rounds half-up to 2 places where the layout demands it;
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True)
class EmitterData:
    """Company issuing the NFC-e (Farmaura's establishment)."""

    cnpj: str
    state_registration: str
    legal_name: str
    trade_name: str
    crt: str
    street: str
    number: str
    complement: str
    district: str
    city_code: str
    city_name: str
    zip_code: str
    phone: str = ""
    uf: str = "DF"


@dataclass(frozen=True)
class RecipientData:
    """Consumer identified on the note (optional on NFC-e)."""

    cpf: str
    name: str = ""


@dataclass(frozen=True)
class TaxProfile:
    """Tax classification of one product, copied from `product_fiscal_profiles`."""

    ncm: str
    cest: str
    cfop: str
    origin: str
    unit: str
    icms_cst: str = ""
    icms_csosn: str = ""
    icms_rate: Decimal | None = None
    pis_cst: str = ""
    pis_rate: Decimal | None = None
    cofins_cst: str = ""
    cofins_rate: Decimal | None = None
    cbenef: str = ""
    ibscbs_cst: str = ""
    ibscbs_cclasstrib: str = ""
    ibscbs_has_tax_group: bool = True
    ibs_uf_rate: Decimal | None = None
    ibs_mun_rate: Decimal | None = None
    cbs_rate: Decimal | None = None


@dataclass(frozen=True)
class ItemData:
    """One sold line."""

    code: str
    ean: str
    description: str
    quantity: Decimal
    unit_price: Decimal
    discount: Decimal
    tax: TaxProfile


@dataclass(frozen=True)
class PaymentData:
    """One payment line (`detPag`)."""

    tpag: str
    amount: Decimal
    card_integration: str = ""


@dataclass(frozen=True)
class NfceInput:
    """Everything required to build one NFC-e XML."""

    emitter: EmitterData
    tp_amb: str
    serie: int
    number: int
    numeric_code: str
    issued_at: datetime
    items: list[ItemData]
    payments: list[PaymentData]
    qrcode_base_url: str
    consultation_url: str
    recipient: RecipientData | None = None
    change_amount: Decimal = Decimal("0.00")
    additional_info: str = ""
    emission_type: int = 1
    contingency_at: datetime | None = None
    contingency_reason: str = ""
    process_version: str = "farmaura-api"
    nature_of_operation: str = "VENDA AO CONSUMIDOR"
    uf_code: str = "53"


@dataclass(frozen=True)
class BuiltNfce:
    """Result of building an unsigned NFC-e."""

    xml: str
    access_key: str
    total_products: Decimal
    total_discount: Decimal
    total_invoice: Decimal
    item_count: int
    warnings: list[str] = field(default_factory=list)
