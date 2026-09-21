"""
farmaura-api/app/tests/unit/test_fiscal_sefaz.py

SEFAZ messaging and client tests for Farmaura (no real network).

Responsibilities:
- prove cancellation and inutilization messages are schema-valid and correctly signed;
- prove authorization/consult/status answers are parsed into the right outcome;
- prove timeouts, 5xx and certificate refusals are classified so retries never repeat a rejection;
- prove the final `nfeProc` document validates against the official schema;

Observations:
- SOAP answers are canned in the exact shape of the leiaute 4.00 return messages;
- `httpx.MockTransport` replaces the network, so the TLS context is only constructed, never used;
"""

import ssl
from datetime import timedelta

import httpx
import pytest

from app.domain.fiscal import FiscalError, FiscalErrorCategory, FiscalTransientError
from app.fiscal import sefaz_messages as msg
from app.fiscal.schema_validator import validate_xml
from app.fiscal.sefaz_client import ENDPOINTS, SefazClient
from app.fiscal.xml_builder import build_nfce
from app.fiscal.xml_signer import sign_xml, verify_signature
from app.tests.fiscal_support import FIXED_ISSUE, TEST_CNPJ, make_certificate, make_input

NS = "http://www.portalfiscal.inf.br/nfe"
CERT = make_certificate()


def soap(payload: str, *, wrapper: str = "nfeResultMsg") -> bytes:
    return (
        '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">'
        f'<soap:Body><{wrapper} xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/X">{payload}</{wrapper}></soap:Body></soap:Envelope>'
    ).encode()


def signed_nfe(number: int = 7):
    built = build_nfce(make_input(number=number))
    return built, sign_xml(built.xml, "infNFe", CERT)


def authorized_reply(key: str, *, item_cstat: int = 100, reason: str = "Autorizado o uso da NF-e") -> bytes:
    return soap(
        f'<retEnviNFe xmlns="{NS}" versao="4.00"><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cStat>104</cStat>'
        f"<xMotivo>Lote processado</xMotivo><cUF>53</cUF><dhRecbto>2026-09-20T14:30:05-03:00</dhRecbto>"
        f'<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><chNFe>{key}</chNFe>'
        f"<dhRecbto>2026-09-20T14:30:05-03:00</dhRecbto><nProt>153260000000123</nProt><digVal>abc=</digVal>"
        f"<cStat>{item_cstat}</cStat><xMotivo>{reason}</xMotivo></infProt></protNFe></retEnviNFe>"
    )


def client_for(handler) -> SefazClient:
    return SefazClient(
        environment="homologacao", tls_context=ssl.create_default_context(),
        transport=httpx.MockTransport(handler),
    )


# ============================================================================
# ENDPOINTS
# ============================================================================


def test_endpoints_are_svrs_and_versioned_per_environment() -> None:
    assert ENDPOINTS["homologacao"].authorization.url == "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx"
    assert ENDPOINTS["producao"].authorization.url == "https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx"
    assert ENDPOINTS["homologacao"].consult.method == "nfeConsultaNF"
    assert ENDPOINTS["homologacao"].event.soap_action == '"http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"'
    assert all("homologacao" not in s.url for s in vars(ENDPOINTS["producao"]).values())


# ============================================================================
# REQUEST MESSAGES
# ============================================================================


def test_authorization_batch_is_schema_valid_and_verbatim() -> None:
    _, signed = signed_nfe()
    batch = msg.build_authorization_batch(batch_id="1", signed_nfe_xml=signed)
    assert signed in batch and "<indSinc>1</indSinc>" in batch
    assert validate_xml("enviNFe", batch) == []


def test_consult_and_status_requests_are_schema_valid() -> None:
    built, _ = signed_nfe()
    assert validate_xml("consSitNFe", msg.build_consult_request(access_key=built.access_key, tp_amb="2")) == []
    assert validate_xml("consStatServ", msg.build_status_request(tp_amb="2", uf_code="53")) == []


def test_cancellation_event_is_schema_valid_and_signed() -> None:
    built, _ = signed_nfe()
    envelope, event = msg.build_cancellation_event(
        access_key=built.access_key, protocol="153260000000123", justification="Erro de digitacao no pedido do cliente",
        tp_amb="2", cnpj=TEST_CNPJ, uf_code="53", occurred_at=FIXED_ISSUE + timedelta(minutes=5),
        sequence=1, batch_id="2", certificate=CERT,
    )
    assert validate_xml("envEventoCancNFe", envelope) == []
    assert verify_signature(event, CERT)
    assert f'Id="ID110111{built.access_key}01"' in event


def test_cancellation_justification_is_escaped() -> None:
    built, _ = signed_nfe()
    _, event = msg.build_cancellation_event(
        access_key=built.access_key, protocol="153260000000123", justification="Troca <erro> & correcao do item",
        tp_amb="2", cnpj=TEST_CNPJ, uf_code="53", occurred_at=FIXED_ISSUE, sequence=1, batch_id="2", certificate=CERT,
    )
    assert "&lt;erro&gt; &amp; correcao" in event


def test_inutilization_is_schema_valid_and_signed() -> None:
    xml = msg.build_inutilization(
        tp_amb="2", uf_code="53", year=2026, cnpj=TEST_CNPJ, serie=1, first_number=10, last_number=12,
        justification="Numeracao pulada por falha no emissor", certificate=CERT,
    )
    assert validate_xml("inutNFe", xml) == []
    assert verify_signature(xml, CERT)
    assert 'Id="ID5326' + TEST_CNPJ + '65001000000010000000012"' in xml


def test_authorized_document_validates_as_nfe_proc() -> None:
    built, signed = signed_nfe()
    reply = msg.parse_authorization(msg.unwrap_soap(authorized_reply(built.access_key)))
    proc = msg.build_authorized_document(signed_nfe_xml=signed, protocol_xml=reply.protocol.raw_xml)
    assert validate_xml("procNFe", proc) == []
    assert verify_signature(proc, CERT)


# ============================================================================
# RESPONSE PARSING + CLIENT
# ============================================================================


@pytest.mark.anyio
async def test_authorize_parses_authorized_protocol() -> None:
    built, signed = signed_nfe()
    client = client_for(lambda request: httpx.Response(200, content=authorized_reply(built.access_key)))
    result = await client.authorize(batch_id="1", signed_nfe_xml=signed)
    assert result.cstat == 104 and result.protocol is not None
    assert result.protocol.cstat == 100 and result.protocol.number == "153260000000123"
    assert result.protocol.access_key == built.access_key


@pytest.mark.anyio
async def test_authorize_sends_soap12_with_action_and_verbatim_xml() -> None:
    built, signed = signed_nfe()
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["ctype"] = request.headers["content-type"]
        seen["body"] = request.content.decode()
        return httpx.Response(200, content=authorized_reply(built.access_key))

    await client_for(handler).authorize(batch_id="1", signed_nfe_xml=signed)
    assert seen["url"] == ENDPOINTS["homologacao"].authorization.url
    assert "application/soap+xml" in seen["ctype"] and "nfeAutorizacaoLote" in seen["ctype"]
    assert 'nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"' in seen["body"]
    assert signed in seen["body"]


@pytest.mark.anyio
async def test_rejection_is_reported_not_raised() -> None:
    built, signed = signed_nfe()
    reply = authorized_reply(built.access_key, item_cstat=539, reason="Rejeicao: Duplicidade de NF-e, com diferenca na Chave de Acesso")
    result = await client_for(lambda r: httpx.Response(200, content=reply)).authorize(batch_id="1", signed_nfe_xml=signed)
    assert result.protocol is not None and result.protocol.cstat == 539


@pytest.mark.anyio
async def test_timeout_and_network_errors_are_transient() -> None:
    _, signed = signed_nfe()

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    def reset(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("reset", request=request)

    for handler in (timeout, reset):
        with pytest.raises(FiscalTransientError):
            await client_for(handler).authorize(batch_id="1", signed_nfe_xml=signed)


@pytest.mark.anyio
@pytest.mark.parametrize("status", [500, 502, 503, 504, 429])
async def test_server_errors_are_transient(status: int) -> None:
    _, signed = signed_nfe()
    with pytest.raises(FiscalTransientError):
        await client_for(lambda r: httpx.Response(status)).authorize(batch_id="1", signed_nfe_xml=signed)


@pytest.mark.anyio
async def test_certificate_refusal_is_a_configuration_error_not_transient() -> None:
    _, signed = signed_nfe()
    with pytest.raises(FiscalError) as raised:
        await client_for(lambda r: httpx.Response(403)).authorize(batch_id="1", signed_nfe_xml=signed)
    assert not isinstance(raised.value, FiscalTransientError)
    assert raised.value.category == FiscalErrorCategory.CONFIGURATION


@pytest.mark.anyio
async def test_status_consult_event_and_inutilization_parsers() -> None:
    built, _ = signed_nfe()
    status = await client_for(lambda r: httpx.Response(200, content=soap(
        f'<retConsStatServ xmlns="{NS}" versao="4.00"><tpAmb>2</tpAmb><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo>'
        "<cUF>53</cUF><dhRecbto>2026-09-20T14:31:00-03:00</dhRecbto><tMed>1</tMed></retConsStatServ>"))).service_status()
    assert status.cstat == 107 and status.average_seconds == "1"

    consult = await client_for(lambda r: httpx.Response(200, content=soap(
        f'<retConsSitNFe xmlns="{NS}" versao="4.00"><tpAmb>2</tpAmb><cStat>217</cStat>'
        "<xMotivo>Rejeicao: NF-e nao consta na base de dados da SEFAZ</xMotivo>"
        "<cUF>53</cUF></retConsSitNFe>"))).consult(access_key=built.access_key)
    assert consult.cstat == 217 and consult.protocol is None

    event = await client_for(lambda r: httpx.Response(200, content=soap(
        f'<retEnvEvento xmlns="{NS}" versao="1.00"><idLote>2</idLote><tpAmb>2</tpAmb><cStat>128</cStat>'
        "<xMotivo>Lote de Evento Processado</xMotivo>"
        '<retEvento versao="1.00"><infEvento><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo>'
        f"<chNFe>{built.access_key}</chNFe><nProt>153260000000999</nProt></infEvento></retEvento></retEnvEvento>"))
    ).register_event(event_envelope_xml="<x/>")
    assert event.batch_cstat == 128 and event.cstat == 135 and event.protocol == "153260000000999"

    inut = await client_for(lambda r: httpx.Response(200, content=soap(
        f'<retInutNFe xmlns="{NS}" versao="4.00"><infInut><tpAmb>2</tpAmb><cStat>102</cStat>'
        "<xMotivo>Inutilizacao de numero homologado</xMotivo>"
        "<nProt>153260000000555</nProt></infInut></retInutNFe>"))).inutilize(inutilization_xml="<x/>")
    assert inut.cstat == 102 and inut.protocol == "153260000000555"


@pytest.mark.anyio
async def test_soap_fault_and_garbage_are_not_treated_as_answers() -> None:
    fault = (
        b'<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">'
        b"<soap:Body><soap:Fault><soap:Reason><soap:Text>boom</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>"
    )
    with pytest.raises(FiscalError):
        await client_for(lambda r: httpx.Response(200, content=fault)).service_status()
    with pytest.raises(FiscalTransientError):
        await client_for(lambda r: httpx.Response(200, content=b"<html>not xml")).service_status()
