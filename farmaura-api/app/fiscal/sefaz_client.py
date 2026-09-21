"""
farmaura-api/app/fiscal/sefaz_client.py

SEFAZ (SVRS) web service client for NFC-e, model 65, Distrito Federal.

Responsibilities:
- centralize every SEFAZ endpoint per environment (no URL is written anywhere else in the code base);
- send SOAP 1.2 messages over mutual TLS with the A1 certificate and parse the answers;
- separate transient failures (retry) from definitive answers (never retry);

Observations:
- the DF authorizes NFC-e through SVRS; URLs come from the SVRS NFC-e services page and were cross-checked
  against an independent open-source registry (operation names, versions);
- SVRS answers 403 to any caller without a client certificate, which is why the certificate is mandatory
  even for a WSDL or status query;
- request and response bodies are never logged (CPF and purchase data, LGPD);
- a timeout or connection reset is never interpreted as a rejection: the caller must consult by access key;
"""

from __future__ import annotations

import ssl
from dataclasses import dataclass
from typing import Final, Protocol

import httpx
from lxml import etree

from app.domain.fiscal import FiscalError, FiscalErrorCategory, FiscalTransientError
from app.fiscal import sefaz_messages as msg

SOAP_ENVELOPE: Final = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
    '<nfeDadosMsg xmlns="{namespace}">{payload}</nfeDadosMsg></soap12:Body></soap12:Envelope>'
)
WSDL_NAMESPACE_ROOT: Final = "http://www.portalfiscal.inf.br/nfe/wsdl"


# ============================================================================
# ENDPOINTS (single source of truth)
# ============================================================================


@dataclass(frozen=True)
class SefazService:
    """One web service: its URL, WSDL operation and SOAP method."""

    url: str
    operation: str
    method: str

    @property
    def namespace(self) -> str:
        """Return the SOAP namespace of the operation."""

        return f"{WSDL_NAMESPACE_ROOT}/{self.operation}"

    @property
    def soap_action(self) -> str:
        """Return the quoted SOAPAction value."""

        return f'"{self.namespace}/{self.method}"'


@dataclass(frozen=True)
class SefazEndpoints:
    """All services of one SEFAZ environment."""

    authorization: SefazService
    authorization_return: SefazService
    consult: SefazService
    status: SefazService
    event: SefazService
    inutilization: SefazService


def _svrs(host: str) -> SefazEndpoints:
    base = f"https://{host}/ws"
    return SefazEndpoints(
        authorization=SefazService(f"{base}/NfeAutorizacao/NFeAutorizacao4.asmx", "NFeAutorizacao4", "nfeAutorizacaoLote"),
        authorization_return=SefazService(f"{base}/NfeRetAutorizacao/NFeRetAutorizacao4.asmx", "NFeRetAutorizacao4", "nfeRetAutorizacaoLote"),
        consult=SefazService(f"{base}/NfeConsulta/NfeConsulta4.asmx", "NFeConsultaProtocolo4", "nfeConsultaNF"),
        status=SefazService(f"{base}/NfeStatusServico/NfeStatusServico4.asmx", "NFeStatusServico4", "nfeStatusServicoNF"),
        event=SefazService(f"{base}/recepcaoevento/recepcaoevento4.asmx", "NFeRecepcaoEvento4", "nfeRecepcaoEvento"),
        inutilization=SefazService(f"{base}/nfeinutilizacao/nfeinutilizacao4.asmx", "NFeInutilizacao4", "nfeInutilizacaoNF"),
    )


ENDPOINTS: Final[dict[str, SefazEndpoints]] = {
    "homologacao": _svrs("nfce-homologacao.svrs.rs.gov.br"),
    "producao": _svrs("nfce.svrs.rs.gov.br"),
}


# ============================================================================
# GATEWAY CONTRACT
# ============================================================================


class SefazGateway(Protocol):
    """What the fiscal service needs from SEFAZ; a fake implements this in tests."""

    async def authorize(self, *, batch_id: str, signed_nfe_xml: str) -> msg.AuthorizationResult: ...

    async def consult(self, *, access_key: str) -> msg.ConsultResult: ...

    async def service_status(self) -> msg.StatusResult: ...

    async def register_event(self, *, event_envelope_xml: str) -> msg.EventResult: ...

    async def inutilize(self, *, inutilization_xml: str) -> msg.InutilizationResult: ...


# ============================================================================
# HTTP CLIENT
# ============================================================================


class SefazClient:
    """Real SEFAZ client over mutual TLS."""

    def __init__(
        self,
        *,
        environment: str,
        tls_context: ssl.SSLContext,
        uf_code: str = "53",
        timeout_seconds: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if environment not in ENDPOINTS:
            raise FiscalError(f"Ambiente fiscal desconhecido: {environment}.")
        self.environment = environment
        self.endpoints = ENDPOINTS[environment]
        self.uf_code = uf_code
        self._tp_amb = "1" if environment == "producao" else "2"
        self._tls_context = tls_context
        self._timeout = httpx.Timeout(timeout_seconds, connect=10.0)
        self._transport = transport

    # ------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------

    async def authorize(self, *, batch_id: str, signed_nfe_xml: str) -> msg.AuthorizationResult:
        payload = msg.build_authorization_batch(batch_id=batch_id, signed_nfe_xml=signed_nfe_xml)
        return msg.parse_authorization(await self._call(self.endpoints.authorization, payload))

    async def consult(self, *, access_key: str) -> msg.ConsultResult:
        payload = msg.build_consult_request(access_key=access_key, tp_amb=self._tp_amb)
        return msg.parse_consult(await self._call(self.endpoints.consult, payload))

    async def service_status(self) -> msg.StatusResult:
        payload = msg.build_status_request(tp_amb=self._tp_amb, uf_code=self.uf_code)
        return msg.parse_status(await self._call(self.endpoints.status, payload))

    async def register_event(self, *, event_envelope_xml: str) -> msg.EventResult:
        return msg.parse_event(await self._call(self.endpoints.event, event_envelope_xml))

    async def inutilize(self, *, inutilization_xml: str) -> msg.InutilizationResult:
        return msg.parse_inutilization(await self._call(self.endpoints.inutilization, inutilization_xml))

    # ------------------------------------------------------------------
    # Transport
    # ------------------------------------------------------------------

    async def _call(self, service: SefazService, payload: str) -> etree._Element:
        body = SOAP_ENVELOPE.format(namespace=service.namespace, payload=payload)
        headers = {"Content-Type": f'application/soap+xml; charset=utf-8; action={service.soap_action}'}
        try:
            async with httpx.AsyncClient(
                verify=self._tls_context, timeout=self._timeout, transport=self._transport, follow_redirects=False,
            ) as client:
                response = await client.post(service.url, content=body.encode("utf-8"), headers=headers)
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as exc:
            raise FiscalTransientError("A SEFAZ não respondeu a tempo (falha de rede ou timeout).") from exc
        except httpx.HTTPError as exc:
            raise FiscalTransientError("Falha de comunicação com a SEFAZ.") from exc

        if response.status_code >= 500 or response.status_code in (408, 429):
            raise FiscalTransientError(f"A SEFAZ está indisponível no momento (HTTP {response.status_code}).")
        if response.status_code in (401, 403):
            error = FiscalError(f"A SEFAZ recusou o certificado de cliente (HTTP {response.status_code}).")
            error.category = FiscalErrorCategory.CONFIGURATION
            raise error
        if response.status_code != 200:
            raise FiscalError(f"Resposta inesperada da SEFAZ (HTTP {response.status_code}).")
        try:
            return msg.unwrap_soap(response.content)
        except FiscalError:
            raise
        except Exception as exc:  # malformed XML from the gateway: treat as transient, consult before deciding
            raise FiscalTransientError("Resposta da SEFAZ ilegível.") from exc
