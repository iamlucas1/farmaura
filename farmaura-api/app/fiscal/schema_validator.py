"""
farmaura-api/app/fiscal/schema_validator.py

Validation of fiscal XML against the official SEFAZ XSDs.

Responsibilities:
- load the versioned XSD set stored under `app/fiscal/schemas/` (see its README for provenance);
- validate NF-e, batch (`enviNFe`), consultation, event and inutilization messages;
- return human-readable schema errors so the operator sees the failing field, not a stack trace;

Observations:
- schemas are read from the repository only; nothing is downloaded at runtime and DTD/network loading
  is disabled, so a crafted document cannot trigger XXE or SSRF through the validator;
- the checked-in set is the SVRS "PL_010b / NT 2025.002 v1.30" leiaute plus the 4.00 service schemas;
  a newer package (NT 2025.002 v1.40+ fields) must be dropped into that folder and re-hashed;
"""

from __future__ import annotations

from functools import cache
from pathlib import Path

from lxml import etree

from app.domain.fiscal import FiscalSchemaError

SCHEMA_DIRECTORY = Path(__file__).parent / "schemas"

_ROOT_SCHEMAS: dict[str, str] = {
    "nfe": "nfe_v4.00.xsd",
    "procNFe": "procNFe_v4.00.xsd",
    "enviNFe": "enviNFe_v4.00.xsd",
    "consSitNFe": "consSitNFe_v4.00.xsd",
    "consStatServ": "consStatServ_v4.00.xsd",
    "inutNFe": "inutNFe_v4.00.xsd",
    "envEventoCancNFe": "envEventoCancNFe_v1.00.xsd",
}

_PARSER = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)


@cache
def _load_schema(kind: str) -> etree.XMLSchema:
    filename = _ROOT_SCHEMAS.get(kind)
    if filename is None:
        raise FiscalSchemaError(f"Tipo de mensagem fiscal desconhecido: {kind}.")
    path = SCHEMA_DIRECTORY / filename
    document = etree.parse(str(path), parser=_PARSER)
    return etree.XMLSchema(document)


def validate_xml(kind: str, xml: str | bytes) -> list[str]:
    """Return the list of schema violations for `xml` (empty when valid)."""

    schema = _load_schema(kind)
    data = xml.encode("utf-8") if isinstance(xml, str) else xml
    try:
        document = etree.fromstring(data, parser=_PARSER)
    except etree.XMLSyntaxError as exc:
        return [f"XML malformado: {exc}"]
    if schema.validate(document):
        return []
    return [_format_error(error) for error in schema.error_log]  # type: ignore[attr-defined]


def assert_valid_xml(kind: str, xml: str | bytes) -> None:
    """Raise `FiscalSchemaError` with every violation when `xml` does not validate."""

    errors = validate_xml(kind, xml)
    if errors:
        raise FiscalSchemaError("O XML gerado não é válido perante o schema oficial da SEFAZ.", details=errors)


def _format_error(error: etree._LogEntry) -> str:
    return f"linha {error.line}: {error.message}"
