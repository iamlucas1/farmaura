"""
farmaura-api/app/fiscal/qrcode_v3.py

NFC-e QR Code version 3 (NT 2025.001) and consultation URL helpers.

Responsibilities:
- build the QR Code URL for normal (online) emission: `URL?p=<chNFe>|3|<tpAmb>`;
- render the QR image (SVG/PNG) used by the DANFE;
- refuse offline-contingency QR Codes until their signature is implemented from the official manual;

Observations:
- in version 3 the online QR Code carries no CSC, no `idCSC` and no hash: only the key, the version and
  the environment (NT 2025.001, section 04, table row "3"). The CSC configuration is therefore unused;
- the offline (tpEmis=9) form adds `dia|vNF|tp_idDest|idDest|assinatura`; how `assinatura` is computed is
  defined in the "Manual de Padrões Técnicos do DANFE NFC-e e QR Code v6", which was not obtainable from a
  primary source, so that path fails closed instead of guessing a formula;
- the QR text must not be wrapped in CDATA in version 3 (same NT, note 4);
"""

from __future__ import annotations

import io

import segno

from app.domain.fiscal import ContingencyNotSupportedError

QRCODE_VERSION = "3"


def build_online_qrcode_url(*, base_url: str, access_key: str, tp_amb: str) -> str:
    """Return the version-3 QR Code URL for a note authorized online (`tpEmis=1`)."""

    if tp_amb not in {"1", "2"}:
        raise ValueError("tp_amb must be 1 or 2.")
    if len(access_key) != 44 or not access_key.isdigit():
        raise ValueError("access_key must have 44 digits.")
    separator = "" if base_url.endswith("?") else "?"
    return f"{base_url}{separator}p={access_key}|{QRCODE_VERSION}|{tp_amb}"


def build_offline_qrcode_url() -> str:
    """Offline contingency QR Code: intentionally unavailable, see module docstring."""

    raise ContingencyNotSupportedError(
        "A assinatura do QR Code v3 para contingência offline ainda não foi implementada: "
        "falta a fórmula oficial do Manual do DANFE NFC-e v6."
    )


def render_qrcode_svg(text: str, *, scale: int = 4) -> str:
    """Render `text` as an inline SVG QR Code (quiet zone included)."""

    buffer = io.BytesIO()
    segno.make(text, error="m").save(buffer, kind="svg", scale=scale, border=2, xmldecl=False, nl=False)
    return buffer.getvalue().decode("utf-8")


def render_qrcode_png(text: str, *, scale: int = 6) -> bytes:
    """Render `text` as a PNG QR Code (quiet zone included)."""

    buffer = io.BytesIO()
    segno.make(text, error="m").save(buffer, kind="png", scale=scale, border=2)
    return buffer.getvalue()
