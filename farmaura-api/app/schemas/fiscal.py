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

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel

# ============================================================================
# FISCAL REQUEST SCHEMAS
# ============================================================================


class FiscalDocumentEmailRequest(StrictModel):
    """Validate one fiscal document e-mail dispatch request."""

    email: str = Field(min_length=5, max_length=320)
    also_whatsapp: bool = False


class FiscalEmitRequest(StrictModel):
    """Ask to (re)queue the NFC-e of one PDV sale; the sale is the only input, never a payload of totals."""

    sale_id: str = Field(min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$")


class FiscalCancelRequest(StrictModel):
    """Validate an NFC-e cancellation request."""

    justification: str = Field(min_length=15, max_length=255)


class FiscalInutilizationRequest(StrictModel):
    """Validate a number-range inutilization request."""

    first_number: int = Field(ge=1, le=999_999_999)
    last_number: int = Field(ge=1, le=999_999_999)
    justification: str = Field(min_length=15, max_length=255)


class ProductFiscalProfileRequest(StrictModel):
    """Validate the tax classification of one product (entered or approved by accounting)."""

    ncm: str = Field(pattern=r"^\d{8}$")
    cest: str = Field(default="", pattern=r"^(\d{7})?$")
    cfop: str = Field(pattern=r"^\d{4}$")
    origin: str = Field(pattern=r"^[0-8]$")
    commercial_unit: str = Field(min_length=1, max_length=6)
    icms_cst: str = Field(default="", pattern=r"^(00|40|41|50|60)?$")
    icms_csosn: str = Field(default="", pattern=r"^(102|103|300|400|500)?$")
    icms_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=4)
    pis_cst: str = Field(pattern=r"^\d{2}$")
    pis_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=4)
    cofins_cst: str = Field(pattern=r"^\d{2}$")
    cofins_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=4)
    cbenef: str = Field(default="", max_length=10)
    ibscbs_cst: str = Field(default="", pattern=r"^(\d{3})?$")
    ibscbs_cclasstrib: str = Field(default="", pattern=r"^(\d{6})?$")
    ibscbs_has_tax_group: bool = True
    ibs_uf_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=4)
    ibs_mun_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=4)
    cbs_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=4)
    notes: str = Field(default="", max_length=500)


# ============================================================================
# FISCAL RESPONSE SCHEMAS
# ============================================================================


class FiscalDocumentResponse(StrictModel):
    """Represent one fiscal document summary.

    Legacy fields (`document_number`, `series_code`, `issue_datetime_label`, `authorized`, ...) are still filled
    because the marketplace and e-mail screens read them; new consumers should use `status`, `number`, `serie`.
    """

    id: str
    document_type: str = "nfce"
    source_channel: str = ""
    status: str = ""
    environment: str = ""
    number: int | None = None
    serie: int | None = None
    cstat: int | None = None
    status_message: str = ""
    protocol: str = ""
    authorization_datetime: datetime | None = None
    document_number: str = ""
    access_key: str = ""
    series_code: str = ""
    issue_datetime_label: str = ""
    payment_method_snapshot: str = ""
    recipient_name_snapshot: str = ""
    recipient_document_snapshot: str = ""
    gross_total_amount: float = 0.0
    approximate_tax_amount: float = 0.0
    authorized: bool = False
    printable_html_url: str = ""
    pdf_url: str = ""
    xml_url: str = ""
    cancel_deadline: datetime | None = None
    error_category: str = ""
    error_details: list[str] = Field(default_factory=list)
    simulated: bool = False


class FiscalDocumentListResponse(StrictModel):
    """Represent one page of fiscal documents."""

    items: list[FiscalDocumentResponse]
    total: int
    limit: int
    offset: int


class FiscalDocumentEmailResponse(StrictModel):
    """Represent the result of one fiscal document e-mail dispatch."""

    id: str
    email: str
    sent: bool = False
    message: str = ""


class FiscalInutilizationResponse(StrictModel):
    """Represent one number-range inutilization."""

    id: str
    environment: str
    serie: int
    number_start: int
    number_end: int
    justification: str
    status: str
    cstat: int | None = None
    message: str = ""
    protocol: str = ""
    created_at: datetime


class FiscalModuleStatusResponse(StrictModel):
    """Represent the fiscal module health for the admin panel; never contains secrets."""

    enabled: bool
    environment: str
    production_unlocked: bool
    serie: str = ""
    problems: list[str] = Field(default_factory=list)
    certificate: dict[str, object] | None = None
    sefaz: dict[str, object] | None = None
    counts: dict[str, int] = Field(default_factory=dict)
    contingency_available: bool = False


class ProductFiscalProfileResponse(ProductFiscalProfileRequest):
    """Represent the stored tax classification of one product."""

    product_id: str
    complete: bool
    missing: list[str] = Field(default_factory=list)
