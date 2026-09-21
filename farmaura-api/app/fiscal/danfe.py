"""
farmaura-api/app/fiscal/danfe.py

DANFE NFC-e rendering (thermal 80 mm PDF and print-ready HTML).

Responsibilities:
- read the fields a DANFE prints from the authorized `nfeProc` XML, never from the sale row;
- render a 80 mm PDF (reportlab) and an HTML page with `@page` print CSS for the browser;
- print the mandatory notices: homologation "sem valor fiscal" and contingency;

Observations:
- a DANFE is only produced for a document that carries a SEFAZ protocol; the caller enforces that;
- every value taken from XML is HTML-escaped before it reaches the HTML view;
- the QR Code text is exactly the `qrCode` tag of the authorized XML (version 3, no CSC);
- item details are printed because the DF consultation page may not be reachable at the counter;
"""

from __future__ import annotations

import html
import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import cast

from lxml import etree
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

from app.domain.fiscal import FiscalDataError
from app.fiscal.qrcode_v3 import render_qrcode_png, render_qrcode_svg
from app.fiscal.xml_signer import parse_xml

PAYMENT_LABELS = {
    "01": "Dinheiro", "02": "Cheque", "03": "Cartão de Crédito", "04": "Cartão de Débito", "05": "Crédito Loja",
    "10": "Vale Alimentação", "11": "Vale Refeição", "12": "Vale Presente", "13": "Vale Combustível",
    "15": "Boleto Bancário", "16": "Depósito Bancário", "17": "PIX", "18": "Transferência/Carteira Digital",
    "19": "Fidelidade/Cashback", "90": "Sem pagamento", "99": "Outros",
}
HOMOLOGATION_NOTICE = "EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL"
CONTINGENCY_NOTICE = "EMITIDA EM CONTINGÊNCIA"
PAGE_WIDTH = 80 * mm
MARGIN = 4 * mm


# ============================================================================
# DATA
# ============================================================================


@dataclass(frozen=True)
class DanfeItem:
    """One printed item line."""

    code: str
    description: str
    quantity: str
    unit: str
    unit_price: Decimal
    total: Decimal


@dataclass(frozen=True)
class DanfeData:
    """Everything printed on the DANFE, extracted from the authorized XML."""

    emitter_name: str
    emitter_cnpj: str
    emitter_ie: str
    emitter_address: str
    number: str
    serie: str
    issued_at: str
    access_key: str
    protocol: str
    authorized_at: str
    qr_url: str
    consultation_url: str
    total_products: Decimal
    total_discount: Decimal
    total_invoice: Decimal
    change: Decimal
    homologation: bool
    contingency: bool
    items: list[DanfeItem] = field(default_factory=list)
    payments: list[tuple[str, Decimal]] = field(default_factory=list)
    consumer_document: str = ""
    consumer_name: str = ""
    additional_info: str = ""

    @property
    def formatted_key(self) -> str:
        """Return the access key in blocks of four digits, as printed."""

        return " ".join(self.access_key[i : i + 4] for i in range(0, len(self.access_key), 4))


# ============================================================================
# PARSING
# ============================================================================


def _descendants(node: etree._Element, name: str) -> list[etree._Element]:
    return cast(list[etree._Element], node.xpath(f".//*[local-name()='{name}']"))


def _text(node: etree._Element | None, path: str) -> str:
    if node is None:
        return ""
    found = _descendants(node, path)
    return (found[0].text or "").strip() if found else ""


def _child(node: etree._Element, name: str) -> etree._Element | None:
    matches = _descendants(node, name)
    return matches[0] if matches else None


def parse_danfe_data(authorized_xml: str) -> DanfeData:
    """Extract the DANFE fields from an authorized `nfeProc`; refuse documents without a protocol."""

    root = parse_xml(authorized_xml)
    protocol = _child(root, "infProt")
    inf = _child(root, "infNFe")
    if protocol is None or inf is None or not _text(protocol, "nProt"):
        raise FiscalDataError("O DANFE só pode ser gerado a partir de um documento autorizado com protocolo.")
    ide = _child(inf, "ide")
    emit = _child(inf, "emit")
    address = _child(emit, "enderEmit") if emit is not None else None
    dest = _child(inf, "dest")
    icms_tot = _child(inf, "ICMSTot")

    items: list[DanfeItem] = []
    for det in _descendants(inf, "det"):
        prod = _child(det, "prod")
        items.append(
            DanfeItem(
                code=_text(prod, "cProd"), description=_text(prod, "xProd"), quantity=_text(prod, "qCom"),
                unit=_text(prod, "uCom"), unit_price=Decimal(_text(prod, "vUnCom") or "0"),
                total=Decimal(_text(prod, "vProd") or "0") - Decimal(_text(prod, "vDesc") or "0"),
            )
        )
    payments = [
        (PAYMENT_LABELS.get(_text(p, "tPag"), "Outros"), Decimal(_text(p, "vPag") or "0"))
        for p in _descendants(inf, "detPag")
    ]
    street = ", ".join(x for x in (_text(address, "xLgr"), _text(address, "nro")) if x)
    place = " - ".join(x for x in (_text(address, "xBairro"), f"{_text(address, 'xMun')}/{_text(address, 'UF')}") if x)
    return DanfeData(
        emitter_name=_text(emit, "xNome"), emitter_cnpj=_text(emit, "CNPJ"), emitter_ie=_text(emit, "IE"),
        emitter_address=f"{street}, {place}".strip(", "), number=_text(ide, "nNF"), serie=_text(ide, "serie"),
        issued_at=_format_datetime(_text(ide, "dhEmi")), access_key=(inf.get("Id") or "")[3:],
        protocol=_text(protocol, "nProt"), authorized_at=_format_datetime(_text(protocol, "dhRecbto")),
        qr_url=_text(root, "qrCode"), consultation_url=_text(root, "urlChave"),
        total_products=Decimal(_text(icms_tot, "vProd") or "0"), total_discount=Decimal(_text(icms_tot, "vDesc") or "0"),
        total_invoice=Decimal(_text(icms_tot, "vNF") or "0"), change=Decimal(_text(inf, "vTroco") or "0"),
        homologation=_text(ide, "tpAmb") == "2", contingency=_text(ide, "tpEmis") == "9", items=items,
        payments=payments, consumer_document=_text(dest, "CPF") or _text(dest, "CNPJ"),
        consumer_name=_text(dest, "xNome"), additional_info=_text(inf, "infCpl"),
    )


def _format_datetime(value: str) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value).strftime("%d/%m/%Y %H:%M:%S")
    except ValueError:
        return value


def format_cnpj(value: str) -> str:
    """Format 14 digits as CNPJ."""

    digits = re.sub(r"\D", "", value)
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}" if len(digits) == 14 else value


def format_cpf(value: str) -> str:
    """Format 11 digits as CPF."""

    digits = re.sub(r"\D", "", value)
    return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}" if len(digits) == 11 else value


def brl(value: Decimal) -> str:
    """Format money in Brazilian style."""

    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _notices(data: DanfeData) -> list[str]:
    notices = []
    if data.homologation:
        notices.append(HOMOLOGATION_NOTICE)
    if data.contingency:
        notices.append(CONTINGENCY_NOTICE)
    return notices


# ============================================================================
# HTML
# ============================================================================

_HTML_CSS = """
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: #000; font: 11px/1.35 "Courier New", monospace; }
.danfe { width: 80mm; padding: 4mm; margin: 0 auto; }
.c { text-align: center; } .b { font-weight: 700; } .r { text-align: right; }
.sep { border-top: 1px dashed #000; margin: 3mm 0; }
.notice { border: 1px solid #000; padding: 2mm; text-align: center; font-weight: 700; margin: 2mm 0; }
.row { display: flex; justify-content: space-between; gap: 2mm; }
.item { margin-bottom: 1.5mm; word-break: break-word; }
.key { word-break: break-all; }
.qr { display: flex; justify-content: center; margin: 2mm 0; } .qr svg { width: 38mm; height: 38mm; }
@media screen { body { background: #eee; } .danfe { background: #fff; margin-top: 8px; } }
"""


def render_danfe_html(data: DanfeData) -> str:
    """Render the DANFE as a standalone, print-ready HTML document (80 mm)."""

    e = html.escape
    parts: list[str] = ['<div class="danfe">']
    parts.append(f'<div class="c b">{e(data.emitter_name)}</div>')
    parts.append(f'<div class="c">CNPJ {e(format_cnpj(data.emitter_cnpj))} &nbsp; IE {e(data.emitter_ie)}</div>')
    parts.append(f'<div class="c">{e(data.emitter_address)}</div>')
    parts.append('<div class="sep"></div>')
    parts.append('<div class="c b">DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>')
    for notice in _notices(data):
        parts.append(f'<div class="notice">{e(notice)}</div>')
    parts.append('<div class="sep"></div>')
    for item in data.items:
        parts.append(
            f'<div class="item">{e(item.code)} {e(item.description)}<div class="row"><span>'
            f'{e(item.quantity.rstrip("0").rstrip("."))} {e(item.unit)} x {e(brl(item.unit_price))}</span>'
            f'<span>{e(brl(item.total))}</span></div></div>'
        )
    parts.append('<div class="sep"></div>')
    parts.append(f'<div class="row"><span>Qtd. total de itens</span><span>{len(data.items)}</span></div>')
    parts.append(f'<div class="row"><span>Valor total R$</span><span>{e(brl(data.total_products))}</span></div>')
    if data.total_discount > 0:
        parts.append(f'<div class="row"><span>Descontos R$</span><span>-{e(brl(data.total_discount))}</span></div>')
    parts.append(f'<div class="row b"><span>Valor a pagar R$</span><span>{e(brl(data.total_invoice))}</span></div>')
    for label, amount in data.payments:
        parts.append(f'<div class="row"><span>{e(label)}</span><span>{e(brl(amount))}</span></div>')
    if data.change > 0:
        parts.append(f'<div class="row"><span>Troco R$</span><span>{e(brl(data.change))}</span></div>')
    parts.append('<div class="sep"></div>')
    parts.append(f'<div class="c">NFC-e nº {e(data.number)} Série {e(data.serie)} {e(data.issued_at)}</div>')
    parts.append(f'<div class="c">Consulte pela Chave de Acesso em<br>{e(data.consultation_url)}</div>')
    parts.append(f'<div class="c key b">{e(data.formatted_key)}</div>')
    if data.consumer_document:
        parts.append(f'<div class="c">CONSUMIDOR {e(format_cpf(data.consumer_document))}</div>')
    parts.append(f'<div class="qr">{render_qrcode_svg(data.qr_url)}</div>')
    parts.append(f'<div class="c">Protocolo de autorização: {e(data.protocol)}<br>Data de autorização: {e(data.authorized_at)}</div>')
    if data.additional_info:
        parts.append(f'<div class="c">{e(data.additional_info)}</div>')
    parts.append("</div>")
    return (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
        f"<title>NFC-e {e(data.number)}</title><style>{_HTML_CSS}</style></head><body>{''.join(parts)}</body></html>"
    )


# ============================================================================
# PDF (thermal 80 mm)
# ============================================================================


def render_danfe_pdf(data: DanfeData) -> bytes:
    """Render the DANFE as a single-page 80 mm-wide PDF whose height fits the content."""

    font, bold, size, leading = "Helvetica", "Helvetica-Bold", 7.5, 9.5
    width = PAGE_WIDTH - 2 * MARGIN
    rows: list[tuple[str, str, str]] = []  # (kind, left, right)

    def text(value: str, style: str = "n", align: str = "l") -> None:
        face = bold if style == "b" else font
        for line in simpleSplit(value, face, size, width) or [""]:
            rows.append((f"{style}{align}", line, ""))

    def pair(left: str, right: str, style: str = "n") -> None:
        rows.append((f"{style}p", left, right))

    text(data.emitter_name, "b", "c")
    text(f"CNPJ {format_cnpj(data.emitter_cnpj)}  IE {data.emitter_ie}", "n", "c")
    text(data.emitter_address, "n", "c")
    rows.append(("sep", "", ""))
    text("DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", "b", "c")
    for notice in _notices(data):
        text(notice, "b", "c")
    rows.append(("sep", "", ""))
    for item in data.items:
        text(f"{item.code} {item.description}")
        pair(f"{item.quantity.rstrip('0').rstrip('.')} {item.unit} x {brl(item.unit_price)}", brl(item.total))
    rows.append(("sep", "", ""))
    pair("Qtd. total de itens", str(len(data.items)))
    pair("Valor total R$", brl(data.total_products))
    if data.total_discount > 0:
        pair("Descontos R$", "-" + brl(data.total_discount))
    pair("Valor a pagar R$", brl(data.total_invoice), "b")
    for label, amount in data.payments:
        pair(label, brl(amount))
    if data.change > 0:
        pair("Troco R$", brl(data.change))
    rows.append(("sep", "", ""))
    text(f"NFC-e nº {data.number} Série {data.serie} {data.issued_at}", "n", "c")
    text("Consulte pela Chave de Acesso em", "n", "c")
    text(data.consultation_url, "n", "c")
    text(data.formatted_key, "b", "c")
    if data.consumer_document:
        text(f"CONSUMIDOR {format_cpf(data.consumer_document)}", "n", "c")
    qr_size = 38 * mm
    rows.append(("qr", "", ""))
    text(f"Protocolo de autorização: {data.protocol}", "n", "c")
    text(f"Data de autorização: {data.authorized_at}", "n", "c")
    if data.additional_info:
        text(data.additional_info, "n", "c")

    height = 2 * MARGIN + sum(qr_size + 4 * mm if r[0] == "qr" else 4 * mm if r[0] == "sep" else leading for r in rows)
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(PAGE_WIDTH, height))
    pdf.setTitle(f"NFC-e {data.number}")
    y = height - MARGIN
    for kind, left, right in rows:
        if kind == "sep":
            y -= 2 * mm
            pdf.setDash(1, 2)
            pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
            pdf.setDash()
            y -= 2 * mm
            continue
        if kind == "qr":
            image = ImageReader(io.BytesIO(render_qrcode_png(data.qr_url)))
            pdf.drawImage(image, (PAGE_WIDTH - qr_size) / 2, y - qr_size, qr_size, qr_size)
            y -= qr_size + 4 * mm
            continue
        y -= leading
        pdf.setFont(bold if kind[0] == "b" else font, size)
        if kind[1] == "p":
            pdf.drawString(MARGIN, y + 2, left)
            pdf.drawRightString(PAGE_WIDTH - MARGIN, y + 2, right)
        elif kind[1] == "c":
            pdf.drawCentredString(PAGE_WIDTH / 2, y + 2, left)
        else:
            pdf.drawString(MARGIN, y + 2, left)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
