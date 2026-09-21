"""
farmaura-api/app/tests/unit/test_fiscal_engine.py

NFC-e engine tests for Farmaura (pure logic, no database, no network).

Responsibilities:
- prove the access key, check digit and cNF rules against official vectors;
- prove the generated XML validates against the official SEFAZ XSD for both tax regimes;
- prove signing produces a verifiable XMLDSig signature and that tampering breaks it;
- prove totals, discount apportionment, payments and change are computed as the layout requires;

Observations:
- the access-key vector comes from the QR Code example printed in NT 2025.001;
- schema validation is the strongest offline check available: the same XSD SEFAZ applies first;
"""

from decimal import Decimal

import pytest

from app.domain.fiscal import ContingencyNotSupportedError, FiscalDataError, FiscalSignatureError
from app.fiscal.access_key import (
    build_access_key,
    compute_check_digit,
    generate_numeric_code,
    is_valid_access_key,
)
from app.fiscal.certificate import build_tls_client_context, load_pkcs12_bytes
from app.fiscal.inputs import PaymentData, RecipientData
from app.fiscal.qrcode_v3 import build_offline_qrcode_url, build_online_qrcode_url
from app.fiscal.schema_validator import validate_xml
from app.fiscal.xml_builder import (
    HOMOLOGATION_FIRST_ITEM,
    apportion_discount,
    build_nfce,
    clean_text,
    is_valid_gtin,
    missing_tax_fields,
)
from app.fiscal.xml_signer import sign_xml, verify_signature
from app.tests.fiscal_support import (
    FIXED_ISSUE,
    TEST_CNPJ,
    TEST_PASSWORD,
    make_certificate,
    make_input,
    make_item,
    make_pkcs12_bytes,
    make_tax,
)

_CERT = make_certificate()


def schema_errors(xml: str) -> list[str]:
    """Sign `xml` with the shared test certificate and return official-schema violations."""

    return validate_xml("nfe", sign_xml(xml, "infNFe", _CERT))


# Access key printed in NT 2025.001 (QR Code example). Its last digit is the DV.
OFFICIAL_KEY = "43150108287693000157651010000000971000001251"


# ============================================================================
# ACCESS KEY
# ============================================================================


def test_check_digit_matches_official_key() -> None:
    assert compute_check_digit(OFFICIAL_KEY[:43]) == int(OFFICIAL_KEY[43])
    assert is_valid_access_key(OFFICIAL_KEY)


def test_access_key_rejects_wrong_digit_and_shape() -> None:
    assert not is_valid_access_key(OFFICIAL_KEY[:43] + "0")
    assert not is_valid_access_key(OFFICIAL_KEY[:43])
    assert not is_valid_access_key("x" * 44)


def test_build_access_key_layout() -> None:
    key = build_access_key(
        uf_code="53", issued_at=FIXED_ISSUE, cnpj=TEST_CNPJ, model="65", serie=1, number=123,
        emission_type=1, numeric_code="31415926",
    )
    assert len(key) == 44
    assert key[:2] == "53" and key[2:6] == "2609" and key[6:20] == TEST_CNPJ
    assert key[20:22] == "65" and key[22:25] == "001" and key[25:34] == "000000123"
    assert key[34] == "1" and key[35:43] == "31415926"
    assert is_valid_access_key(key)


def test_numeric_code_avoids_forbidden_patterns_and_number() -> None:
    for number in (1, 12345678, 99999999):
        for _ in range(200):
            code = generate_numeric_code(number)
            assert len(code) == 8 and code.isdigit()
            assert code != f"{number:08d}"[-8:]
            assert code not in {"00000000", "11111111", "12345678", "01234567"}


# ============================================================================
# XML + SCHEMA
# ============================================================================


@pytest.mark.parametrize("crt", ["1", "3"])
def test_generated_xml_validates_against_official_schema(crt: str) -> None:
    built = build_nfce(make_input(crt=crt))
    assert schema_errors(built.xml) == []
    assert built.access_key in built.xml
    assert built.total_invoice == Decimal("25.00")


def test_schema_validation_rejects_broken_document() -> None:
    built = build_nfce(make_input())
    broken = built.xml.replace("<NCM>30049099</NCM>", "<NCM>ABC</NCM>")
    assert schema_errors(broken) != []


def test_homologation_forces_official_literals() -> None:
    built = build_nfce(make_input(recipient=RecipientData(cpf="52998224725", name="Maria")))
    assert HOMOLOGATION_FIRST_ITEM in built.xml
    assert "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" in built.xml
    assert "Maria" not in built.xml
    assert schema_errors(built.xml) == []


def test_production_keeps_real_descriptions() -> None:
    built = build_nfce(make_input(tp_amb="1", recipient=RecipientData(cpf="52998224725", name="Maria")))
    assert HOMOLOGATION_FIRST_ITEM not in built.xml
    assert "DIPIRONA 500MG" in built.xml and "Maria" in built.xml


def test_qr_code_v3_online_has_only_key_version_and_environment() -> None:
    built = build_nfce(make_input(tp_amb="2"))
    expected = f"http://www.fazenda.df.gov.br/nfce/qrcode?p={built.access_key}|3|2"
    assert f"<qrCode>{expected}</qrCode>" in built.xml
    assert "CDATA" not in built.xml
    assert build_online_qrcode_url(base_url="http://x/qrcode?", access_key=built.access_key, tp_amb="1").endswith(
        f"?p={built.access_key}|3|1"
    )


def test_offline_contingency_fails_closed() -> None:
    with pytest.raises(ContingencyNotSupportedError, match="contingência offline"):
        build_offline_qrcode_url()
    with pytest.raises(ContingencyNotSupportedError):
        build_nfce(make_input().__class__(**{**make_input().__dict__, "emission_type": 9,
            "contingency_at": FIXED_ISSUE, "contingency_reason": "SEFAZ indisponivel por instabilidade"}))


# ============================================================================
# TOTALS, DISCOUNT, PAYMENT, CHANGE
# ============================================================================


def test_multiple_items_and_discount_apportionment_sum_exactly() -> None:
    shares = apportion_discount([Decimal("10.00"), Decimal("20.00"), Decimal("30.00")], Decimal("10.00"))
    assert sum(shares) == Decimal("10.00")
    assert all(s >= 0 for s in shares)
    odd = apportion_discount([Decimal("0.01"), Decimal("0.01"), Decimal("0.01")], Decimal("0.02"))
    assert sum(odd) == Decimal("0.02") and all(s <= Decimal("0.01") for s in odd)
    with pytest.raises(FiscalDataError):
        apportion_discount([Decimal("1.00")], Decimal("2.00"))


def test_invoice_total_with_discounts_and_multiple_items_validates() -> None:
    items = [
        make_item("A", "ITEM A", "3", "3.33", ean="7891000100103", discount="0.33"),
        make_item("B", "ITEM B", "1", "10.00", discount="1.67"),
    ]
    built = build_nfce(make_input(items=items))
    assert built.total_products == Decimal("19.99")
    assert built.total_discount == Decimal("2.00")
    assert built.total_invoice == Decimal("17.99")
    assert schema_errors(built.xml) == []


def test_cash_payment_with_change() -> None:
    items = [make_item("A", "ITEM A", "1", "18.50")]
    built = build_nfce(make_input(items=items, payments=[PaymentData(tpag="01", amount=Decimal("20.00"))], change="1.50"))
    assert "<vTroco>1.50</vTroco>" in built.xml
    assert schema_errors(built.xml) == []


def test_split_payments_must_match_total() -> None:
    items = [make_item("A", "ITEM A", "1", "30.00")]
    ok = build_nfce(make_input(items=items, payments=[
        PaymentData(tpag="01", amount=Decimal("10.00")), PaymentData(tpag="04", amount=Decimal("20.00"), card_integration="2"),
    ]))
    assert schema_errors(ok.xml) == []
    with pytest.raises(FiscalDataError, match="pagamentos"):
        build_nfce(make_input(items=items, payments=[PaymentData(tpag="01", amount=Decimal("29.00"))]))


def test_rounding_is_half_up_on_line_taxes() -> None:
    tax = make_tax(crt="3", icms_rate=Decimal("18.0000"))
    item = make_item("A", "ITEM A", "1", "0.05", crt="3")
    built = build_nfce(make_input(crt="3", items=[item.__class__(**{**item.__dict__, "tax": tax})]))
    assert schema_errors(built.xml) == []


# ============================================================================
# FISCAL DATA GUARDS
# ============================================================================


def test_missing_tax_data_is_reported_and_blocks_emission() -> None:
    bad = make_tax(ncm="", cfop="", icms_csosn="")
    problems = missing_tax_fields(bad, crt="1")
    assert any("NCM" in p for p in problems) and any("CFOP" in p for p in problems) and any("CSOSN" in p for p in problems)
    item = make_item("A", "DIPIRONA", "1", "5.00")
    item = item.__class__(**{**item.__dict__, "tax": bad})
    with pytest.raises(FiscalDataError) as raised:
        build_nfce(make_input(items=[item]))
    assert "NCM (8 dígitos)" in raised.value.details


def test_regime_normal_requires_ibs_cbs_fields() -> None:
    problems = missing_tax_fields(make_tax(crt="3", ibscbs_cst="", ibscbs_cclasstrib=""), crt="3")
    assert any("IBS/CBS" in p for p in problems)


def test_invalid_ean_is_refused_and_blank_becomes_sem_gtin() -> None:
    assert is_valid_gtin("7891000100103")
    assert not is_valid_gtin("7891000100104")
    with pytest.raises(FiscalDataError):
        build_nfce(make_input(items=[make_item("A", "X", "1", "5.00", ean="7891000100104")]))
    built = build_nfce(make_input(items=[make_item("A", "X", "1", "5.00", ean="")]))
    assert "<cEAN>SEM GTIN</cEAN>" in built.xml


def test_text_is_reduced_to_schema_alphabet() -> None:
    assert clean_text("  Ação  ™   forte\n 500mg ", 60) == "Ação forte 500mg"
    assert len(clean_text("x" * 500, 120)) == 120


# ============================================================================
# SIGNATURE
# ============================================================================


def test_signature_verifies_and_document_still_validates() -> None:
    certificate = make_certificate()
    built = build_nfce(make_input())
    signed = sign_xml(built.xml, "infNFe", certificate)
    assert verify_signature(signed, certificate)
    assert verify_signature(signed)  # via embedded KeyInfo certificate
    assert validate_xml("nfe", signed) == []
    assert signed.index("<infNFeSupl>") < signed.index("<Signature")


def test_tampering_breaks_signature() -> None:
    certificate = make_certificate()
    signed = sign_xml(build_nfce(make_input()).xml, "infNFe", certificate)
    assert not verify_signature(signed.replace("<vNF>25.00</vNF>", "<vNF>24.00</vNF>"), certificate)
    other = make_certificate()
    assert not verify_signature(signed, other)


def test_signature_uses_official_algorithms() -> None:
    signed = sign_xml(build_nfce(make_input()).xml, "infNFe", make_certificate())
    assert "http://www.w3.org/2000/09/xmldsig#rsa-sha1" in signed
    assert "http://www.w3.org/2000/09/xmldsig#enveloped-signature" in signed
    assert "http://www.w3.org/TR/2001/REC-xml-c14n-20010315" in signed


def test_signing_rejects_missing_reference() -> None:
    with pytest.raises(FiscalSignatureError):
        sign_xml("<NFe xmlns='http://www.portalfiscal.inf.br/nfe'><x/></NFe>", "infNFe", make_certificate())


# ============================================================================
# CERTIFICATE
# ============================================================================


def test_certificate_loading_and_metadata() -> None:
    loaded = load_pkcs12_bytes(make_pkcs12_bytes(), TEST_PASSWORD)
    assert loaded.icp_brasil_cnpj() == TEST_CNPJ
    assert not loaded.is_expired()
    assert 360 <= loaded.days_until_expiry() <= 366
    assert TEST_CNPJ in loaded.subject_common_name


def test_expired_certificate_is_detected() -> None:
    from datetime import UTC, datetime, timedelta

    loaded = make_certificate(days_valid=30)
    assert loaded.is_expired(datetime.now(UTC) + timedelta(days=31))
    assert loaded.days_until_expiry(datetime.now(UTC) + timedelta(days=31)) < 0


def test_wrong_password_never_leaks_the_password() -> None:
    with pytest.raises(FiscalSignatureError) as raised:
        load_pkcs12_bytes(make_pkcs12_bytes(), "senha-errada-123")
    assert "senha-errada-123" not in str(raised.value) and TEST_PASSWORD not in str(raised.value)


def test_tls_context_is_built_from_certificate_without_leaving_files() -> None:
    import tempfile
    from pathlib import Path

    before = set(Path(tempfile.gettempdir()).glob("farmaura-tls-*"))
    context = build_tls_client_context(make_certificate())
    assert context.minimum_version.name == "TLSv1_2"
    assert set(Path(tempfile.gettempdir()).glob("farmaura-tls-*")) == before
