"""
farmaura-api/app/fiscal/xml_builder.py

NFC-e (model 65) XML builder, leiaute 4.00.

Responsibilities:
- turn an `NfceInput` into an unsigned `<NFe>` document with `infNFeSupl` (QR Code v3 + consultation URL);
- compute item and invoice totals with the layout's rounding, including discount apportionment;
- emit ICMS, PIS, COFINS and IBS/CBS groups strictly from the stored product tax profile;

Observations:
- the builder never picks a tax treatment: an unsupported or incomplete profile raises `FiscalDataError`
  listing what is missing, and nothing is emitted;
- the IBS/CBS base follows NT 2025.002 v1.51 rule UB16-10: vProd + vFrete + vSeg + vOutro + vII - vDesc -
  vPIS - vCOFINS - vICMS - vFCP (freight/insurance/other are always zero on this PDV flow);
- homologation (`tpAmb=2`) forces the literal first-item description and recipient name required by MOC rules
  I04-10 and E04-20; those texts are the ones SEFAZ compares against, so they must not be reworded;
- free text is reduced to the Latin-1 subset the schema accepts and trimmed to the layout's length limits;
"""

from __future__ import annotations

import re
import unicodedata
from decimal import ROUND_HALF_UP, Decimal
from typing import Final

from lxml import etree

from app.domain.fiscal import FiscalDataError
from app.fiscal.access_key import build_access_key
from app.fiscal.inputs import BuiltNfce, ItemData, NfceInput, TaxProfile
from app.fiscal.qrcode_v3 import build_online_qrcode_url

NFE_NS: Final = "http://www.portalfiscal.inf.br/nfe"
LAYOUT_VERSION: Final = "4.00"
HOMOLOGATION_FIRST_ITEM: Final = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
HOMOLOGATION_RECIPIENT_NAME: Final = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"

_ICMS_SN_102 = frozenset({"102", "103", "300", "400"})
_ICMS_SN_500 = frozenset({"500"})
_ICMS_NORMAL_00 = frozenset({"00"})
_ICMS_NORMAL_40 = frozenset({"40", "41", "50"})
_ICMS_NORMAL_60 = frozenset({"60"})
_PIS_COFINS_ALIQUOTA = frozenset({"01", "02"})
_PIS_COFINS_NOT_TAXED = frozenset({"04", "05", "06", "07", "08", "09"})
_PIS_COFINS_OUTRAS = frozenset({"49"} | {f"{n:02d}" for n in range(50, 100)})
_ZERO = Decimal("0.00")


# ============================================================================
# FORMATTING HELPERS
# ============================================================================


def money(value: Decimal) -> Decimal:
    """Round to 2 places, half-up (the rounding SEFAZ totals expect)."""

    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def fmt2(value: Decimal) -> str:
    """Format a monetary value with exactly 2 decimals."""

    return f"{money(value):.2f}"


def fmt4(value: Decimal) -> str:
    """Format a quantity or percentage with exactly 4 decimals."""

    return f"{value.quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP):.4f}"


_WHITESPACE = re.compile(r"\s+")


def clean_text(value: str, max_length: int, *, min_length: int = 1) -> str:
    """Reduce free text to what the NF-e schema accepts (Latin-1, no edge/inner runs of blanks)."""

    normalized = unicodedata.normalize("NFC", value or "")
    kept = "".join(ch for ch in normalized if ord(ch) <= 0xFF and (ch.isprintable() or ch.isspace()))
    collapsed = _WHITESPACE.sub(" ", kept).strip()[:max_length].strip()
    if len(collapsed) < min_length:
        return ""
    return collapsed


def is_valid_gtin(value: str) -> bool:
    """Return whether `value` is a GTIN-8/12/13/14 with a correct check digit."""

    if not value.isdigit() or len(value) not in (8, 12, 13, 14):
        return False
    body, check = value[:-1], int(value[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def _sub(parent: etree._Element, tag: str, text: str | None = None) -> etree._Element:
    element = etree.SubElement(parent, f"{{{NFE_NS}}}{tag}")
    if text is not None:
        element.text = text
    return element


# ============================================================================
# DISCOUNT APPORTIONMENT
# ============================================================================


def apportion_discount(line_totals: list[Decimal], total_discount: Decimal) -> list[Decimal]:
    """Split a sale-level discount over the lines proportionally, fixing cents on the last line.

    The sum of the returned values always equals `total_discount` and no line receives more than its
    own total.
    """

    if total_discount <= 0 or not line_totals:
        return [_ZERO for _ in line_totals]
    gross = sum(line_totals, _ZERO)
    if total_discount > gross:
        raise FiscalDataError("O desconto informado é maior que o valor dos itens.")
    shares: list[Decimal] = []
    for total in line_totals:
        shares.append(money(total_discount * total / gross))
    shares[-1] = money(total_discount - sum(shares[:-1], _ZERO))
    # Cent drift can push the last share past its line; walk it back onto lines with room.
    for index in range(len(shares) - 1, -1, -1):
        overflow = shares[index] - line_totals[index]
        if overflow > 0:
            shares[index] -= overflow
            target = index - 1 if index > 0 else len(shares) - 1
            shares[target] += overflow
    return shares


# ============================================================================
# PROFILE VALIDATION
# ============================================================================


def missing_tax_fields(tax: TaxProfile, *, crt: str) -> list[str]:
    """Return the fiscal fields absent or unsupported for one product, in operator language."""

    problems: list[str] = []
    if not re.fullmatch(r"\d{8}", tax.ncm or ""):
        problems.append("NCM (8 dígitos)")
    if not re.fullmatch(r"\d{4}", tax.cfop or ""):
        problems.append("CFOP (4 dígitos)")
    if tax.origin not in {str(n) for n in range(9)}:
        problems.append("Origem da mercadoria (0 a 8)")
    if not (tax.unit or "").strip():
        problems.append("Unidade comercial")
    if tax.cest and not re.fullmatch(r"\d{7}", tax.cest):
        problems.append("CEST (7 dígitos)")

    if crt in {"1", "2", "4"}:
        if tax.icms_csosn not in _ICMS_SN_102 | _ICMS_SN_500:
            problems.append("CSOSN (suportados: 102, 103, 300, 400, 500)")
    else:
        if tax.icms_cst not in _ICMS_NORMAL_00 | _ICMS_NORMAL_40 | _ICMS_NORMAL_60:
            problems.append("CST do ICMS (suportados: 00, 40, 41, 50, 60)")
        if tax.icms_cst in _ICMS_NORMAL_00 and tax.icms_rate is None:
            problems.append("Alíquota de ICMS")

    for label, cst, rate in (("PIS", tax.pis_cst, tax.pis_rate), ("COFINS", tax.cofins_cst, tax.cofins_rate)):
        if cst not in _PIS_COFINS_ALIQUOTA | _PIS_COFINS_NOT_TAXED | _PIS_COFINS_OUTRAS:
            problems.append(f"CST do {label}")
        elif cst in _PIS_COFINS_ALIQUOTA and rate is None:
            problems.append(f"Alíquota de {label}")

    if crt == "3":
        if not re.fullmatch(r"\d{3}", tax.ibscbs_cst or ""):
            problems.append("CST do IBS/CBS (3 dígitos)")
        if not re.fullmatch(r"\d{6}", tax.ibscbs_cclasstrib or ""):
            problems.append("cClassTrib do IBS/CBS (6 dígitos)")
        if tax.ibscbs_has_tax_group and None in (tax.ibs_uf_rate, tax.ibs_mun_rate, tax.cbs_rate):
            problems.append("Alíquotas de IBS (UF e município) e CBS")
    return problems


# ============================================================================
# BUILDER
# ============================================================================


def build_nfce(data: NfceInput) -> BuiltNfce:
    """Build the unsigned NFC-e XML for `data`; raise `FiscalDataError` when it cannot be valid."""

    _assert_input(data)
    emitter = data.emitter
    issued_text = data.issued_at.isoformat(timespec="seconds")
    access_key = build_access_key(
        uf_code=data.uf_code,
        issued_at=data.issued_at,
        cnpj=emitter.cnpj,
        model="65",
        serie=data.serie,
        number=data.number,
        emission_type=data.emission_type,
        numeric_code=data.numeric_code,
    )

    nfe = etree.Element(f"{{{NFE_NS}}}NFe", nsmap={None: NFE_NS})  # type: ignore[dict-item]
    inf = _sub(nfe, "infNFe")
    inf.set("versao", LAYOUT_VERSION)
    inf.set("Id", f"NFe{access_key}")

    # --- ide ---------------------------------------------------------
    ide = _sub(inf, "ide")
    _sub(ide, "cUF", data.uf_code)
    _sub(ide, "cNF", data.numeric_code)
    _sub(ide, "natOp", clean_text(data.nature_of_operation, 60))
    _sub(ide, "mod", "65")
    _sub(ide, "serie", str(data.serie))
    _sub(ide, "nNF", str(data.number))
    _sub(ide, "dhEmi", issued_text)
    _sub(ide, "tpNF", "1")
    _sub(ide, "idDest", "1")
    _sub(ide, "cMunFG", emitter.city_code)
    _sub(ide, "tpImp", "4")
    _sub(ide, "tpEmis", str(data.emission_type))
    _sub(ide, "cDV", access_key[-1])
    _sub(ide, "tpAmb", data.tp_amb)
    _sub(ide, "finNFe", "1")
    _sub(ide, "indFinal", "1")
    _sub(ide, "indPres", "1")
    _sub(ide, "procEmi", "0")
    _sub(ide, "verProc", clean_text(data.process_version, 20))
    if data.emission_type == 9:
        if data.contingency_at is None or len(data.contingency_reason.strip()) < 15:
            raise FiscalDataError("Contingência exige data/hora de entrada e justificativa (mín. 15 caracteres).")
        _sub(ide, "dhCont", data.contingency_at.isoformat(timespec="seconds"))
        _sub(ide, "xJust", clean_text(data.contingency_reason, 256, min_length=15))

    # --- emit --------------------------------------------------------
    emit = _sub(inf, "emit")
    _sub(emit, "CNPJ", emitter.cnpj)
    _sub(emit, "xNome", clean_text(emitter.legal_name, 60, min_length=2))
    if emitter.trade_name:
        _sub(emit, "xFant", clean_text(emitter.trade_name, 60, min_length=1))
    address = _sub(emit, "enderEmit")
    _sub(address, "xLgr", clean_text(emitter.street, 60, min_length=2))
    _sub(address, "nro", clean_text(emitter.number, 60))
    if emitter.complement:
        _sub(address, "xCpl", clean_text(emitter.complement, 60))
    _sub(address, "xBairro", clean_text(emitter.district, 60, min_length=2))
    _sub(address, "cMun", emitter.city_code)
    _sub(address, "xMun", clean_text(emitter.city_name, 60, min_length=2))
    _sub(address, "UF", emitter.uf)
    _sub(address, "CEP", re.sub(r"\D", "", emitter.zip_code))
    phone = re.sub(r"\D", "", emitter.phone)
    if 6 <= len(phone) <= 14:
        _sub(address, "fone", phone)
    _sub(emit, "IE", re.sub(r"\D", "", emitter.state_registration))
    _sub(emit, "CRT", emitter.crt)

    # --- dest (optional) ---------------------------------------------
    if data.recipient is not None:
        dest = _sub(inf, "dest")
        _sub(dest, "CPF", data.recipient.cpf)
        recipient_name = HOMOLOGATION_RECIPIENT_NAME if data.tp_amb == "2" else clean_text(data.recipient.name, 60, min_length=2)
        if recipient_name:
            _sub(dest, "xNome", recipient_name)
        _sub(dest, "indIEDest", "9")

    # --- det ---------------------------------------------------------
    totals = _Totals()
    for index, item in enumerate(data.items, start=1):
        _append_item(inf, item, index=index, emitter_crt=emitter.crt, tp_amb=data.tp_amb, totals=totals)

    # --- total -------------------------------------------------------
    total = _sub(inf, "total")
    icms_tot = _sub(total, "ICMSTot")
    for tag, value in (
        ("vBC", totals.icms_base), ("vICMS", totals.icms), ("vICMSDeson", _ZERO), ("vFCP", _ZERO),
        ("vBCST", _ZERO), ("vST", _ZERO), ("vFCPST", _ZERO), ("vFCPSTRet", _ZERO),
        ("vProd", totals.products), ("vFrete", _ZERO), ("vSeg", _ZERO), ("vDesc", totals.discount),
        ("vII", _ZERO), ("vIPI", _ZERO), ("vIPIDevol", _ZERO), ("vPIS", totals.pis),
        ("vCOFINS", totals.cofins), ("vOutro", _ZERO),
    ):
        _sub(icms_tot, tag, fmt2(value))
    invoice_total = money(totals.products - totals.discount)
    _sub(icms_tot, "vNF", fmt2(invoice_total))
    if totals.has_ibs_cbs:
        _append_ibs_cbs_totals(total, totals)

    # --- transp / pag ------------------------------------------------
    transp = _sub(inf, "transp")
    _sub(transp, "modFrete", "9")
    pag = _sub(inf, "pag")
    paid = _ZERO
    for payment in data.payments:
        det_pag = _sub(pag, "detPag")
        _sub(det_pag, "tPag", payment.tpag)
        _sub(det_pag, "vPag", fmt2(payment.amount))
        if payment.card_integration:
            card = _sub(det_pag, "card")
            _sub(card, "tpIntegra", payment.card_integration)
        paid += money(payment.amount)
    change = money(data.change_amount)
    if change > 0:
        _sub(pag, "vTroco", fmt2(change))
    if money(paid - change) != invoice_total:
        raise FiscalDataError(
            "A soma dos pagamentos menos o troco difere do valor total da nota.",
            details=[f"pagamentos={fmt2(paid)} troco={fmt2(change)} total={fmt2(invoice_total)}"],
        )

    additional = clean_text(data.additional_info, 5000)
    if additional:
        info = _sub(inf, "infAdic")
        _sub(info, "infCpl", additional)

    # --- infNFeSupl (QR Code v3) --------------------------------------
    supl = _sub(nfe, "infNFeSupl")
    if data.emission_type == 9:
        from app.fiscal.qrcode_v3 import build_offline_qrcode_url

        build_offline_qrcode_url()  # fails closed until the official signature formula is implemented
    _sub(supl, "qrCode", build_online_qrcode_url(base_url=data.qrcode_base_url, access_key=access_key, tp_amb=data.tp_amb))
    _sub(supl, "urlChave", data.consultation_url)

    xml = etree.tostring(nfe, encoding="unicode")
    return BuiltNfce(
        xml=xml,
        access_key=access_key,
        total_products=totals.products,
        total_discount=totals.discount,
        total_invoice=invoice_total,
        item_count=len(data.items),
    )


# ============================================================================
# INTERNALS
# ============================================================================


class _Totals:
    """Running invoice totals."""

    def __init__(self) -> None:
        self.products = _ZERO
        self.discount = _ZERO
        self.icms_base = _ZERO
        self.icms = _ZERO
        self.pis = _ZERO
        self.cofins = _ZERO
        self.has_ibs_cbs = False
        self.ibs_cbs_base = _ZERO
        self.ibs_uf = _ZERO
        self.ibs_mun = _ZERO
        self.cbs = _ZERO


def _assert_input(data: NfceInput) -> None:
    problems: list[str] = []
    if not data.items:
        problems.append("A venda não possui itens.")
    if not data.payments:
        problems.append("A venda não possui forma de pagamento.")
    if data.tp_amb not in {"1", "2"}:
        problems.append("Ambiente inválido.")
    if len(data.emitter.cnpj) != 14:
        problems.append("CNPJ do emitente inválido.")
    if data.issued_at.tzinfo is None:
        problems.append("A data de emissão precisa ter fuso horário.")
    if problems:
        raise FiscalDataError("Dados insuficientes para montar a NFC-e.", details=problems)


def _append_item(
    inf: etree._Element,
    item: ItemData,
    *,
    index: int,
    emitter_crt: str,
    tp_amb: str,
    totals: _Totals,
) -> None:
    problems = missing_tax_fields(item.tax, crt=emitter_crt)
    if problems:
        raise FiscalDataError(f"Dados fiscais ausentes ou não suportados: {item.description}", details=problems)

    gross = money(item.quantity * item.unit_price)
    discount = money(item.discount)
    net = money(gross - discount)
    description = HOMOLOGATION_FIRST_ITEM if (tp_amb == "2" and index == 1) else clean_text(item.description, 120)
    if not description:
        raise FiscalDataError("Item sem descrição.", details=[f"item {index}"])
    ean = item.ean.strip()
    if ean and not is_valid_gtin(ean):
        raise FiscalDataError(f"EAN/GTIN inválido: {item.description}", details=[f"EAN informado: {ean}"])
    commercial_ean = ean or "SEM GTIN"

    det = _sub(inf, "det")
    det.set("nItem", str(index))
    prod = _sub(det, "prod")
    _sub(prod, "cProd", clean_text(item.code, 60))
    _sub(prod, "cEAN", commercial_ean)
    _sub(prod, "xProd", description)
    _sub(prod, "NCM", item.tax.ncm)
    if item.tax.cest:
        _sub(prod, "CEST", item.tax.cest)
    if item.tax.cbenef:
        _sub(prod, "cBenef", item.tax.cbenef)
    _sub(prod, "CFOP", item.tax.cfop)
    _sub(prod, "uCom", clean_text(item.tax.unit, 6))
    _sub(prod, "qCom", fmt4(item.quantity))
    _sub(prod, "vUnCom", f"{item.unit_price:.2f}")
    _sub(prod, "vProd", fmt2(gross))
    _sub(prod, "cEANTrib", commercial_ean)
    _sub(prod, "uTrib", clean_text(item.tax.unit, 6))
    _sub(prod, "qTrib", fmt4(item.quantity))
    _sub(prod, "vUnTrib", f"{item.unit_price:.2f}")
    if discount > 0:
        _sub(prod, "vDesc", fmt2(discount))
    _sub(prod, "indTot", "1")

    imposto = _sub(det, "imposto")
    icms_value, icms_base = _append_icms(imposto, item.tax, net=net)
    pis_value = _append_pis_cofins(imposto, "PIS", item.tax.pis_cst, item.tax.pis_rate, net=net)
    cofins_value = _append_pis_cofins(imposto, "COFINS", item.tax.cofins_cst, item.tax.cofins_rate, net=net)
    if emitter_crt == "3":
        _append_ibs_cbs_item(
            imposto, item.tax, gross=gross, discount=discount, pis=pis_value, cofins=cofins_value,
            icms=icms_value, totals=totals,
        )

    totals.products += gross
    totals.discount += discount
    totals.icms_base += icms_base
    totals.icms += icms_value
    totals.pis += pis_value
    totals.cofins += cofins_value


def _append_icms(imposto: etree._Element, tax: TaxProfile, *, net: Decimal) -> tuple[Decimal, Decimal]:
    icms = _sub(imposto, "ICMS")
    if tax.icms_csosn in _ICMS_SN_102:
        group = _sub(icms, "ICMSSN102")
        _sub(group, "orig", tax.origin)
        _sub(group, "CSOSN", tax.icms_csosn)
        return _ZERO, _ZERO
    if tax.icms_csosn in _ICMS_SN_500:
        group = _sub(icms, "ICMSSN500")
        _sub(group, "orig", tax.origin)
        _sub(group, "CSOSN", tax.icms_csosn)
        return _ZERO, _ZERO
    if tax.icms_cst in _ICMS_NORMAL_00:
        rate = tax.icms_rate or _ZERO
        value = money(net * rate / 100)
        group = _sub(icms, "ICMS00")
        _sub(group, "orig", tax.origin)
        _sub(group, "CST", "00")
        _sub(group, "modBC", "3")
        _sub(group, "vBC", fmt2(net))
        _sub(group, "pICMS", fmt4(rate))
        _sub(group, "vICMS", fmt2(value))
        return value, net
    if tax.icms_cst in _ICMS_NORMAL_40:
        group = _sub(icms, "ICMS40")
        _sub(group, "orig", tax.origin)
        _sub(group, "CST", tax.icms_cst)
        return _ZERO, _ZERO
    group = _sub(icms, "ICMS60")
    _sub(group, "orig", tax.origin)
    _sub(group, "CST", "60")
    return _ZERO, _ZERO


def _append_pis_cofins(
    imposto: etree._Element, kind: str, cst: str, rate: Decimal | None, *, net: Decimal,
) -> Decimal:
    wrapper = _sub(imposto, kind)
    rate_tag = "pPIS" if kind == "PIS" else "pCOFINS"
    value_tag = "vPIS" if kind == "PIS" else "vCOFINS"
    if cst in _PIS_COFINS_ALIQUOTA:
        percentage = rate or _ZERO
        value = money(net * percentage / 100)
        group = _sub(wrapper, f"{kind}Aliq")
        _sub(group, "CST", cst)
        _sub(group, "vBC", fmt2(net))
        _sub(group, rate_tag, fmt4(percentage))
        _sub(group, value_tag, fmt2(value))
        return value
    if cst in _PIS_COFINS_NOT_TAXED:
        group = _sub(wrapper, f"{kind}NT")
        _sub(group, "CST", cst)
        return _ZERO
    percentage = rate or _ZERO
    value = money(net * percentage / 100)
    group = _sub(wrapper, f"{kind}Outr")
    _sub(group, "CST", cst)
    _sub(group, "vBC", fmt2(net))
    _sub(group, rate_tag, fmt4(percentage))
    _sub(group, value_tag, fmt2(value))
    return value


def _append_ibs_cbs_item(
    imposto: etree._Element,
    tax: TaxProfile,
    *,
    gross: Decimal,
    discount: Decimal,
    pis: Decimal,
    cofins: Decimal,
    icms: Decimal,
    totals: _Totals,
) -> None:
    group = _sub(imposto, "IBSCBS")
    _sub(group, "CST", tax.ibscbs_cst)
    _sub(group, "cClassTrib", tax.ibscbs_cclasstrib)
    if not tax.ibscbs_has_tax_group:
        return
    base = money(gross - discount - pis - cofins - icms)
    ibs_uf_rate, ibs_mun_rate, cbs_rate = tax.ibs_uf_rate or _ZERO, tax.ibs_mun_rate or _ZERO, tax.cbs_rate or _ZERO
    v_ibs_uf = money(base * ibs_uf_rate / 100)
    v_ibs_mun = money(base * ibs_mun_rate / 100)
    v_cbs = money(base * cbs_rate / 100)
    detail = _sub(group, "gIBSCBS")
    _sub(detail, "vBC", fmt2(base))
    uf = _sub(detail, "gIBSUF")
    _sub(uf, "pIBSUF", fmt4(ibs_uf_rate))
    _sub(uf, "vIBSUF", fmt2(v_ibs_uf))
    mun = _sub(detail, "gIBSMun")
    _sub(mun, "pIBSMun", fmt4(ibs_mun_rate))
    _sub(mun, "vIBSMun", fmt2(v_ibs_mun))
    _sub(detail, "vIBS", fmt2(v_ibs_uf + v_ibs_mun))
    cbs = _sub(detail, "gCBS")
    _sub(cbs, "pCBS", fmt4(cbs_rate))
    _sub(cbs, "vCBS", fmt2(v_cbs))
    totals.has_ibs_cbs = True
    totals.ibs_cbs_base += base
    totals.ibs_uf += v_ibs_uf
    totals.ibs_mun += v_ibs_mun
    totals.cbs += v_cbs


def _append_ibs_cbs_totals(total: etree._Element, totals: _Totals) -> None:
    group = _sub(total, "IBSCBSTot")
    _sub(group, "vBCIBSCBS", fmt2(totals.ibs_cbs_base))
    ibs = _sub(group, "gIBS")
    uf = _sub(ibs, "gIBSUF")
    _sub(uf, "vDif", fmt2(_ZERO))
    _sub(uf, "vDevTrib", fmt2(_ZERO))
    _sub(uf, "vIBSUF", fmt2(totals.ibs_uf))
    mun = _sub(ibs, "gIBSMun")
    _sub(mun, "vDif", fmt2(_ZERO))
    _sub(mun, "vDevTrib", fmt2(_ZERO))
    _sub(mun, "vIBSMun", fmt2(totals.ibs_mun))
    _sub(ibs, "vIBS", fmt2(totals.ibs_uf + totals.ibs_mun))
    _sub(ibs, "vCredPres", fmt2(_ZERO))
    _sub(ibs, "vCredPresCondSus", fmt2(_ZERO))
    cbs = _sub(group, "gCBS")
    _sub(cbs, "vDif", fmt2(_ZERO))
    _sub(cbs, "vDevTrib", fmt2(_ZERO))
    _sub(cbs, "vCBS", fmt2(totals.cbs))
    _sub(cbs, "vCredPres", fmt2(_ZERO))
    _sub(cbs, "vCredPresCondSus", fmt2(_ZERO))
