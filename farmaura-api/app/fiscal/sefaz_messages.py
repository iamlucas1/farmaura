"""
farmaura-api/app/fiscal/sefaz_messages.py

SEFAZ request builders and response parsers for NFC-e (leiaute 4.00).

Responsibilities:
- build `enviNFe`, `consSitNFe`, `consStatServ`, cancellation `envEvento` and `inutNFe` messages;
- parse the synchronous authorization answer, protocol consultation, status, event and inutilization replies;
- assemble the final `nfeProc` (NFe + protocol) that is the legally authoritative XML;

Observations:
- the signed NFe string is embedded verbatim: re-serializing it would invalidate the digest;
- parsers look elements up by local name so a namespace prefix chosen by SEFAZ never matters;
- nothing here logs XML: authorized notes carry CPF and purchase data (LGPD);
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from lxml import etree

from app.domain.fiscal import FiscalError
from app.fiscal.certificate import LoadedCertificate
from app.fiscal.schema_validator import assert_valid_xml
from app.fiscal.xml_signer import parse_xml, sign_xml

NFE_NS = "http://www.portalfiscal.inf.br/nfe"
CANCEL_EVENT_TYPE = "110111"


# ============================================================================
# RESULTS
# ============================================================================


@dataclass(frozen=True)
class Protocol:
    """`infProt` of an authorization / consultation."""

    cstat: int
    reason: str
    number: str = ""
    access_key: str = ""
    received_at: str = ""
    digest: str = ""
    raw_xml: str = ""


@dataclass(frozen=True)
class AuthorizationResult:
    """Answer to `NFeAutorizacao4` (synchronous mode)."""

    cstat: int
    reason: str
    protocol: Protocol | None


@dataclass(frozen=True)
class ConsultResult:
    """Answer to `NFeConsultaProtocolo4`."""

    cstat: int
    reason: str
    protocol: Protocol | None
    canceled_event_protocol: str = ""


@dataclass(frozen=True)
class StatusResult:
    """Answer to `NFeStatusServico4`."""

    cstat: int
    reason: str
    average_seconds: str = ""
    received_at: str = ""


@dataclass(frozen=True)
class EventResult:
    """Answer to `RecepcaoEvento4`."""

    batch_cstat: int
    cstat: int
    reason: str
    protocol: str = ""
    raw_xml: str = ""


@dataclass(frozen=True)
class InutilizationResult:
    """Answer to `NFeInutilizacao4`."""

    cstat: int
    reason: str
    protocol: str = ""


# ============================================================================
# REQUEST BUILDERS
# ============================================================================


def build_authorization_batch(*, batch_id: str, signed_nfe_xml: str) -> str:
    """Wrap one signed NFC-e in a synchronous `enviNFe` (indSinc=1, mandatory for a single NFC-e)."""

    xml = (
        f'<enviNFe xmlns="{NFE_NS}" versao="4.00"><idLote>{batch_id}</idLote><indSinc>1</indSinc>'
        f"{signed_nfe_xml}</enviNFe>"
    )
    assert_valid_xml("enviNFe", xml)
    return xml


def build_consult_request(*, access_key: str, tp_amb: str) -> str:
    """Build `consSitNFe` for one access key."""

    xml = (
        f'<consSitNFe xmlns="{NFE_NS}" versao="4.00"><tpAmb>{tp_amb}</tpAmb>'
        f"<xServ>CONSULTAR</xServ><chNFe>{access_key}</chNFe></consSitNFe>"
    )
    assert_valid_xml("consSitNFe", xml)
    return xml


def build_status_request(*, tp_amb: str, uf_code: str) -> str:
    """Build `consStatServ`."""

    xml = (
        f'<consStatServ xmlns="{NFE_NS}" versao="4.00"><tpAmb>{tp_amb}</tpAmb>'
        f"<cUF>{uf_code}</cUF><xServ>STATUS</xServ></consStatServ>"
    )
    assert_valid_xml("consStatServ", xml)
    return xml


def build_cancellation_event(
    *,
    access_key: str,
    protocol: str,
    justification: str,
    tp_amb: str,
    cnpj: str,
    uf_code: str,
    occurred_at: datetime,
    sequence: int,
    batch_id: str,
    certificate: LoadedCertificate,
) -> tuple[str, str]:
    """Build and sign the cancellation `envEvento`; return `(envelope_xml, event_xml)`."""

    event_id = f"ID{CANCEL_EVENT_TYPE}{access_key}{sequence:02d}"
    event = (
        f'<evento xmlns="{NFE_NS}" versao="1.00"><infEvento Id="{event_id}">'
        f"<cOrgao>{uf_code}</cOrgao><tpAmb>{tp_amb}</tpAmb><CNPJ>{cnpj}</CNPJ><chNFe>{access_key}</chNFe>"
        f"<dhEvento>{occurred_at.isoformat(timespec='seconds')}</dhEvento><tpEvento>{CANCEL_EVENT_TYPE}</tpEvento>"
        f'<nSeqEvento>{sequence}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00">'
        f"<descEvento>Cancelamento</descEvento><nProt>{protocol}</nProt><xJust>{_escape(justification)}</xJust>"
        f"</detEvento></infEvento></evento>"
    )
    signed_event = sign_xml(event, "infEvento", certificate)
    envelope = f'<envEvento xmlns="{NFE_NS}" versao="1.00"><idLote>{batch_id}</idLote>{_strip_root_ns(signed_event)}</envEvento>'
    assert_valid_xml("envEventoCancNFe", envelope)
    return envelope, signed_event


def build_inutilization(
    *,
    tp_amb: str,
    uf_code: str,
    year: int,
    cnpj: str,
    serie: int,
    first_number: int,
    last_number: int,
    justification: str,
    certificate: LoadedCertificate,
) -> str:
    """Build and sign `inutNFe` for a number range of model 65."""

    infinut_id = f"ID{uf_code}{year % 100:02d}{cnpj}65{serie:03d}{first_number:09d}{last_number:09d}"
    xml = (
        f'<inutNFe xmlns="{NFE_NS}" versao="4.00"><infInut Id="{infinut_id}"><tpAmb>{tp_amb}</tpAmb>'
        f"<xServ>INUTILIZAR</xServ><cUF>{uf_code}</cUF><ano>{year % 100:02d}</ano><CNPJ>{cnpj}</CNPJ><mod>65</mod>"
        f"<serie>{serie}</serie><nNFIni>{first_number}</nNFIni><nNFFin>{last_number}</nNFFin>"
        f"<xJust>{_escape(justification)}</xJust></infInut></inutNFe>"
    )
    signed = sign_xml(xml, "infInut", certificate)
    assert_valid_xml("inutNFe", signed)
    return signed


def build_authorized_document(*, signed_nfe_xml: str, protocol_xml: str) -> str:
    """Assemble `nfeProc`: the signed NFe plus the SEFAZ protocol (the authoritative document)."""

    return f'<nfeProc xmlns="{NFE_NS}" versao="4.00">{signed_nfe_xml}{_strip_root_ns(protocol_xml)}</nfeProc>'


# ============================================================================
# RESPONSE PARSERS
# ============================================================================


def unwrap_soap(body: bytes) -> etree._Element:
    """Return the payload element inside a SOAP 1.2 envelope (`nfeResultMsg` child)."""

    root = parse_xml(body)
    fault = _find(root, "Fault")
    if fault is not None:
        raise FiscalError("A SEFAZ respondeu com falha SOAP.")
    result = _find(root, "nfeResultMsg")
    if result is None or len(result) == 0:
        raise FiscalError("Resposta SOAP sem conteúdo (nfeResultMsg).")
    return result[0]


def parse_authorization(payload: etree._Element) -> AuthorizationResult:
    """Parse `retEnviNFe`."""

    cstat, reason = _cstat_reason(payload)
    prot = _find(payload, "protNFe")
    return AuthorizationResult(cstat=cstat, reason=reason, protocol=_parse_protocol(prot) if prot is not None else None)


def parse_consult(payload: etree._Element) -> ConsultResult:
    """Parse `retConsSitNFe`."""

    cstat, reason = _cstat_reason(payload)
    prot = _find(payload, "protNFe")
    event_protocol = ""
    for event in _findall(payload, "procEventoNFe"):
        info = _find(event, "retEvento")
        detail = _find(info, "infEvento") if info is not None else None
        if detail is not None and _text(detail, "tpEvento") == CANCEL_EVENT_TYPE:
            event_protocol = _text(detail, "nProt")
    return ConsultResult(
        cstat=cstat, reason=reason, protocol=_parse_protocol(prot) if prot is not None else None,
        canceled_event_protocol=event_protocol,
    )


def parse_status(payload: etree._Element) -> StatusResult:
    """Parse `retConsStatServ`."""

    cstat, reason = _cstat_reason(payload)
    return StatusResult(cstat=cstat, reason=reason, average_seconds=_text(payload, "tMed"), received_at=_text(payload, "dhRecbto"))


def parse_event(payload: etree._Element) -> EventResult:
    """Parse `retEnvEvento`."""

    batch_cstat, _ = _cstat_reason(payload)
    ret = _find(payload, "retEvento")
    info = _find(ret, "infEvento") if ret is not None else None
    if ret is None or info is None:
        return EventResult(batch_cstat=batch_cstat, cstat=batch_cstat, reason=_text(payload, "xMotivo"))
    return EventResult(
        batch_cstat=batch_cstat, cstat=_to_int(_text(info, "cStat")), reason=_text(info, "xMotivo"),
        protocol=_text(info, "nProt"), raw_xml=etree.tostring(ret, encoding="unicode"),
    )


def parse_inutilization(payload: etree._Element) -> InutilizationResult:
    """Parse `retInutNFe`."""

    info = _find(payload, "infInut")
    if info is None:
        cstat, reason = _cstat_reason(payload)
        return InutilizationResult(cstat=cstat, reason=reason)
    return InutilizationResult(cstat=_to_int(_text(info, "cStat")), reason=_text(info, "xMotivo"), protocol=_text(info, "nProt"))


# ============================================================================
# HELPERS
# ============================================================================


def _parse_protocol(prot: etree._Element) -> Protocol:
    info = _find(prot, "infProt")
    if info is None:
        return Protocol(cstat=0, reason="", raw_xml=etree.tostring(prot, encoding="unicode"))
    return Protocol(
        cstat=_to_int(_text(info, "cStat")), reason=_text(info, "xMotivo"), number=_text(info, "nProt"),
        access_key=_text(info, "chNFe"), received_at=_text(info, "dhRecbto"), digest=_text(info, "digVal"),
        raw_xml=etree.tostring(prot, encoding="unicode"),
    )


def _cstat_reason(element: etree._Element) -> tuple[int, str]:
    # Direct children only: the batch-level cStat, not the one inside protNFe.
    cstat = ""
    reason = ""
    for child in element:
        if not isinstance(child.tag, str):
            continue
        local = etree.QName(child).localname
        if local == "cStat" and not cstat:
            cstat = (child.text or "").strip()
        elif local == "xMotivo" and not reason:
            reason = (child.text or "").strip()
    return _to_int(cstat), reason


def _find(element: etree._Element | None, local_name: str) -> etree._Element | None:
    if element is None:
        return None
    for node in element.iter():
        if isinstance(node.tag, str) and etree.QName(node).localname == local_name:
            return node
    return None


def _findall(element: etree._Element, local_name: str) -> list[etree._Element]:
    return [n for n in element.iter() if isinstance(n.tag, str) and etree.QName(n).localname == local_name]


def _text(element: etree._Element | None, local_name: str) -> str:
    node = _find(element, local_name)
    return (node.text or "").strip() if node is not None and node.text else ""


def _to_int(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _escape(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _strip_root_ns(xml: str) -> str:
    """Drop a redundant default-namespace declaration on the root so nesting stays clean."""

    return xml.replace(f' xmlns="{NFE_NS}"', "", 1) if xml.startswith("<") and f'xmlns="{NFE_NS}"' in xml[:200] else xml
