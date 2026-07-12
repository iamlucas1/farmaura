"""
farmaura-api/app/schemas/fiscal.py

Fiscal document schemas for Farmaura.

Responsibilities:
- define fiscal document transport contracts for marketplace and PDV flows;
- validate operational actions such as manual issuance and e-mail delivery;
- keep document metadata explicit for printing and customer notifications.

Observations:
- fiscal responses are channel-agnostic and can represent online or in-store sales;
- e-mail delivery remains best-effort and should never block the core sale flow.
"""

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# FISCAL REQUEST SCHEMAS
# ============================================================================


class FiscalDocumentEmailRequest(StrictModel):
    """Validate one fiscal document e-mail dispatch request."""

    email: str = Field(min_length=5, max_length=320)
    also_whatsapp: bool = False


# ============================================================================
# FISCAL RESPONSE SCHEMAS
# ============================================================================


class FiscalDocumentResponse(StrictModel):
    """Represent one issued fiscal document summary."""

    id: str
    document_type: str = "nfce"
    source_channel: str = ""
    document_number: str = ""
    access_key: str = ""
    series_code: str = "001"
    issue_datetime_label: str = ""
    payment_method_snapshot: str = ""
    recipient_name_snapshot: str = ""
    recipient_document_snapshot: str = ""
    gross_total_amount: float = 0.0
    approximate_tax_amount: float = 0.0
    authorized: bool = True
    printable_html_url: str = ""


class FiscalDocumentEmailResponse(StrictModel):
    """Represent the result of one fiscal document e-mail dispatch."""

    id: str
    email: str
    sent: bool = False
    message: str = ""
