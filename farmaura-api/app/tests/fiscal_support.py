"""
farmaura-api/app/tests/fiscal_support.py

Shared builders for the fiscal (NFC-e) test suites.

Responsibilities:
- create a throwaway A1 certificate (PKCS#12) carrying an ICP-Brasil CNPJ, so signing is tested for real;
- provide valid emitter, tax profile, item and payment fixtures for both tax regimes;

Observations:
- nothing here is a real CNPJ, certificate or CSC: the CNPJ below is a well-formed test value only;
- the certificate is generated per test session and never written to the repository;
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID, ObjectIdentifier

from app.fiscal.certificate import LoadedCertificate, load_pkcs12_bytes
from app.fiscal.inputs import (
    EmitterData,
    ItemData,
    NfceInput,
    PaymentData,
    RecipientData,
    TaxProfile,
)

TEST_CNPJ = "11222333000181"
TEST_PASSWORD = "senha-de-teste"
BRASILIA = timezone(timedelta(hours=-3))
FIXED_ISSUE = datetime(2026, 9, 20, 14, 30, 0, tzinfo=BRASILIA)


def make_certificate(*, days_valid: int = 365, cnpj: str = TEST_CNPJ) -> LoadedCertificate:
    """Return a freshly generated A1-like certificate."""

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, f"EMPRESA TESTE LTDA:{cnpj}"), x509.NameAttribute(NameOID.COUNTRY_NAME, "BR")]
    )
    now = datetime.now(UTC)
    der_cnpj = bytes([0x13, len(cnpj)]) + cnpj.encode("ascii")  # PrintableString
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        # A generous 10-year back-date, not "yesterday": test_fiscal_flow.py checks this
        # certificate against a FIXED simulated Clock (2026-09-20), not real wall-clock time —
        # "yesterday" relative to the real now() stopped covering that fixed date once real time
        # caught up to and passed it, making every authorization-flow test fail with "certificado
        # ... está expirado" for reasons that had nothing to do with the code under test.
        .not_valid_before(now - timedelta(days=3650))
        .not_valid_after(now + timedelta(days=days_valid))
        .add_extension(
            x509.SubjectAlternativeName([x509.OtherName(ObjectIdentifier("2.16.76.1.3.3"), der_cnpj)]),
            critical=False,
        )
    )
    certificate = builder.sign(key, hashes.SHA256())
    bundle = pkcs12.serialize_key_and_certificates(
        b"teste", key, certificate, None, serialization.BestAvailableEncryption(TEST_PASSWORD.encode())
    )
    return load_pkcs12_bytes(bundle, TEST_PASSWORD)


def make_pkcs12_bytes(*, days_valid: int = 365) -> bytes:
    """Return raw PKCS#12 bytes protected with `TEST_PASSWORD`."""

    loaded = make_certificate(days_valid=days_valid)
    return pkcs12.serialize_key_and_certificates(
        b"teste", loaded.private_key, loaded.certificate, None,
        serialization.BestAvailableEncryption(TEST_PASSWORD.encode()),
    )


def make_emitter(*, crt: str = "1") -> EmitterData:
    """Return a complete DF emitter."""

    return EmitterData(
        cnpj=TEST_CNPJ, state_registration="0712345600123", legal_name="FARMAURA COMERCIO DE MEDICAMENTOS LTDA",
        trade_name="FARMAURA", crt=crt, street="SCS QUADRA 6", number="100", complement="LOJA 2",
        district="ASA SUL", city_code="5300108", city_name="BRASILIA", zip_code="70306-915", phone="6133334444",
    )


def make_tax(*, crt: str = "1", **overrides: object) -> TaxProfile:
    """Return a supported tax profile for the regime (test values, not real tax advice)."""

    base: dict[str, object] = {
        "ncm": "30049099", "cest": "1300100", "cfop": "5102", "origin": "0", "unit": "UN",
        "pis_cst": "01", "pis_rate": Decimal("0.6500"), "cofins_cst": "01", "cofins_rate": Decimal("3.0000"),
    }
    if crt == "3":
        base |= {
            "icms_cst": "00", "icms_rate": Decimal("18.0000"),
            "ibscbs_cst": "000", "ibscbs_cclasstrib": "000001",
            "ibs_uf_rate": Decimal("0.1000"), "ibs_mun_rate": Decimal("0.0000"), "cbs_rate": Decimal("0.9000"),
        }
    else:
        base |= {"icms_csosn": "102", "pis_cst": "49", "cofins_cst": "49", "pis_rate": Decimal("0"), "cofins_rate": Decimal("0")}
    base.update(overrides)
    return TaxProfile(**base)  # type: ignore[arg-type]


def make_item(code: str, name: str, quantity: str, price: str, *, crt: str = "1", ean: str = "", discount: str = "0.00") -> ItemData:
    """Return one sold line."""

    return ItemData(
        code=code, ean=ean, description=name, quantity=Decimal(quantity), unit_price=Decimal(price),
        discount=Decimal(discount), tax=make_tax(crt=crt),
    )


def make_input(
    *,
    crt: str = "1",
    tp_amb: str = "2",
    number: int = 1,
    items: list[ItemData] | None = None,
    payments: list[PaymentData] | None = None,
    recipient: RecipientData | None = None,
    change: str = "0.00",
    numeric_code: str = "31415926",
) -> NfceInput:
    """Return a complete, schema-valid NFC-e input."""

    lines = items or [make_item("SKU-1", "DIPIRONA 500MG 10 COMPRIMIDOS", "2", "12.50", crt=crt, ean="7891000100103")]
    total = sum((i.quantity * i.unit_price - i.discount for i in lines), Decimal("0.00"))
    pays = payments or [PaymentData(tpag="17", amount=total)]
    return NfceInput(
        emitter=make_emitter(crt=crt), tp_amb=tp_amb, serie=1, number=number, numeric_code=numeric_code,
        issued_at=FIXED_ISSUE, items=lines, payments=pays,
        qrcode_base_url="http://www.fazenda.df.gov.br/nfce/qrcode",
        consultation_url="http://www.fazenda.df.gov.br/nfce/consulta",
        recipient=recipient, change_amount=Decimal(change), additional_info="Venda PDV TESTE",
    )
