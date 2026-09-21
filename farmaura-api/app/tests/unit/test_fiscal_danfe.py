"""
farmaura-api/app/tests/unit/test_fiscal_danfe.py

DANFE NFC-e rendering tests for Farmaura.

Responsibilities:
- prove the DANFE is read from the authorized XML and refused when there is no protocol;
- prove the mandatory notices (homologation, contingency) and the QR Code are printed;
- prove hostile text coming from the XML can never become active HTML;
- prove the PDF is a single 80 mm page containing the protocol and access key;

Observations:
- the authorized XML is built like production: signed NFe + protocol inside `nfeProc`;
"""

import io
from decimal import Decimal

import pytest
from pypdf import PdfReader

from app.domain.fiscal import FiscalDataError
from app.fiscal import sefaz_messages as msg
from app.fiscal.danfe import (
    PAGE_WIDTH,
    format_cnpj,
    format_cpf,
    parse_danfe_data,
    render_danfe_html,
    render_danfe_pdf,
)
from app.fiscal.inputs import PaymentData, RecipientData
from app.fiscal.xml_builder import build_nfce
from app.fiscal.xml_signer import sign_xml
from app.tests.fiscal_support import make_certificate, make_input, make_item

CERT = make_certificate()


def authorized_xml(*, tp_amb: str = "1", items=None, payments=None, change: str = "0.00", recipient=None) -> tuple[str, str]:
    built = build_nfce(make_input(tp_amb=tp_amb, items=items, payments=payments, change=change, recipient=recipient))
    signed = sign_xml(built.xml, "infNFe", CERT)
    protocol = (
        f'<protNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infProt><tpAmb>{tp_amb}</tpAmb>'
        f"<verAplic>SVRS</verAplic><chNFe>{built.access_key}</chNFe><dhRecbto>2026-09-20T14:30:05-03:00</dhRecbto>"
        "<nProt>153260000000123</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>"
        "</infProt></protNFe>"
    )
    return msg.build_authorized_document(signed_nfe_xml=signed, protocol_xml=protocol), built.access_key


def test_danfe_data_comes_from_authorized_xml() -> None:
    xml, key = authorized_xml(recipient=RecipientData(cpf="52998224725", name="Maria Silva"))
    data = parse_danfe_data(xml)
    assert data.access_key == key and data.protocol == "153260000000123"
    assert data.number == "1" and data.serie == "1"
    assert data.total_invoice == Decimal("25.00") and len(data.items) == 1
    assert data.payments == [("PIX", Decimal("25.00"))]
    assert data.consumer_document == "52998224725"
    assert data.authorized_at == "20/09/2026 14:30:05"
    assert data.qr_url.endswith(f"?p={key}|3|1")


def test_danfe_refuses_documents_without_protocol() -> None:
    built = build_nfce(make_input())
    signed = sign_xml(built.xml, "infNFe", CERT)
    with pytest.raises(FiscalDataError):
        parse_danfe_data(signed)


def test_homologation_notice_is_printed_only_in_homologation() -> None:
    homolog = render_danfe_html(parse_danfe_data(authorized_xml(tp_amb="2")[0]))
    production = render_danfe_html(parse_danfe_data(authorized_xml(tp_amb="1")[0]))
    assert "SEM VALOR FISCAL" in homolog
    assert "SEM VALOR FISCAL" not in production.replace("NOTA FISCAL EMITIDA", "")


def test_html_has_print_css_qr_key_protocol_and_change() -> None:
    items = [make_item("A", "ITEM A", "1", "18.50")]
    xml, key = authorized_xml(items=items, payments=[PaymentData(tpag="01", amount=Decimal("20.00"))], change="1.50")
    page = render_danfe_html(parse_danfe_data(xml))
    assert "@page { size: 80mm auto; margin: 0; }" in page
    assert "<svg" in page and "153260000000123" in page
    assert " ".join(key[i : i + 4] for i in range(0, 44, 4)) in page
    assert "Troco R$" in page and "1,50" in page and "Dinheiro" in page
    assert 'name="robots" content="noindex"' in page


def test_hostile_product_name_cannot_become_html() -> None:
    hostile = make_item("A", '<script>alert(1)</script><img src=x onerror=alert(2)>', "1", "9.90")
    page = render_danfe_html(parse_danfe_data(authorized_xml(tp_amb="1", items=[hostile])[0]))
    assert "<script>" not in page and "<img" not in page
    assert "&lt;script&gt;" in page


def test_pdf_is_single_80mm_page_with_protocol_and_key() -> None:
    xml, key = authorized_xml()
    pdf = render_danfe_pdf(parse_danfe_data(xml))
    assert pdf.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) == 1
    assert abs(float(reader.pages[0].mediabox.width) - PAGE_WIDTH) < 0.5
    text = reader.pages[0].extract_text().replace("\n", " ")
    assert "153260000000123" in text
    assert key[:4] in text and "DANFE NFC-e" in text


def test_pdf_grows_with_many_items() -> None:
    few = render_danfe_pdf(parse_danfe_data(authorized_xml()[0]))
    many_items = [make_item(f"S{i}", f"PRODUTO NUMERO {i}", "1", "1.00", ean="7891000100103") for i in range(40)]
    many = render_danfe_pdf(parse_danfe_data(authorized_xml(items=many_items)[0]))
    assert float(PdfReader(io.BytesIO(many)).pages[0].mediabox.height) > float(PdfReader(io.BytesIO(few)).pages[0].mediabox.height)


def test_document_formatters() -> None:
    assert format_cnpj("11222333000181") == "11.222.333/0001-81"
    assert format_cpf("52998224725") == "529.982.247-25"
