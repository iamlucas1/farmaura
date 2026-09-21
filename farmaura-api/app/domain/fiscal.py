"""
farmaura-api/app/domain/fiscal.py

Fiscal (NFC-e) domain rules for Farmaura.

Responsibilities:
- name the document workflow states and the only legal transitions between them;
- classify SEFAZ `cStat` codes into authorized / denied / transient / rejected outcomes;
- map Farmaura payment methods to the official NFC-e `tPag` codes;
- define the errors the fiscal engine raises, without any I/O;

Observations:
- a CANCELED or DENIED document can never become AUTHORIZED again: terminal states have no exits;
- `cStat` codes and `tPag` values come from MOC 7.00 Anexo I and NT 2025.001/2025.002, not from memory;
- transient outcomes are the only ones retried automatically; a fiscal rejection needs a human fix;
"""

from __future__ import annotations

from enum import StrEnum

# ============================================================================
# ENUMS
# ============================================================================


class FiscalDocumentStatus(StrEnum):
    """Workflow state of one fiscal document."""

    DRAFT = "DRAFT"
    VALIDATING = "VALIDATING"
    SIGNING = "SIGNING"
    SENDING = "SENDING"
    PROCESSING = "PROCESSING"
    AUTHORIZED = "AUTHORIZED"
    REJECTED = "REJECTED"
    DENIED = "DENIED"
    CANCELED = "CANCELED"
    CONTINGENCY = "CONTINGENCY"
    PENDING_RECOVERY = "PENDING_RECOVERY"
    ERROR = "ERROR"
    # Rows created by the pre-2026-09 prototype: hash-derived number/key, never sent to SEFAZ.
    LEGACY_SIMULATED = "LEGACY_SIMULATED"


class FiscalEventType(StrEnum):
    """Kind of fiscal event registered against a document."""

    CANCELLATION = "CANCELLATION"
    INUTILIZATION = "INUTILIZATION"


class FiscalErrorCategory(StrEnum):
    """Coarse cause of a failed attempt, used for retry policy and operator messages."""

    MISSING_FISCAL_DATA = "MISSING_FISCAL_DATA"
    CONFIGURATION = "CONFIGURATION"
    SCHEMA = "SCHEMA"
    SIGNATURE = "SIGNATURE"
    TRANSIENT_NETWORK = "TRANSIENT_NETWORK"
    SEFAZ_UNAVAILABLE = "SEFAZ_UNAVAILABLE"
    SEFAZ_REJECTION = "SEFAZ_REJECTION"
    SEFAZ_DENIED = "SEFAZ_DENIED"
    UNEXPECTED = "UNEXPECTED"


# States from which nothing else may ever happen automatically.
TERMINAL_STATUSES = frozenset(
    {
        FiscalDocumentStatus.CANCELED,
        FiscalDocumentStatus.DENIED,
        FiscalDocumentStatus.LEGACY_SIMULATED,
    }
)

# States the emission worker may pick up (subject to lease + retry timing).
WORKABLE_STATUSES = frozenset(
    {
        FiscalDocumentStatus.DRAFT,
        FiscalDocumentStatus.VALIDATING,
        FiscalDocumentStatus.SIGNING,
        FiscalDocumentStatus.SENDING,
        FiscalDocumentStatus.PROCESSING,
        FiscalDocumentStatus.PENDING_RECOVERY,
        FiscalDocumentStatus.CONTINGENCY,
    }
)

_ALLOWED_TRANSITIONS: dict[FiscalDocumentStatus, frozenset[FiscalDocumentStatus]] = {
    FiscalDocumentStatus.DRAFT: frozenset(
        {FiscalDocumentStatus.VALIDATING, FiscalDocumentStatus.ERROR}
    ),
    FiscalDocumentStatus.VALIDATING: frozenset(
        {FiscalDocumentStatus.SIGNING, FiscalDocumentStatus.ERROR, FiscalDocumentStatus.DRAFT}
    ),
    FiscalDocumentStatus.SIGNING: frozenset(
        {FiscalDocumentStatus.SENDING, FiscalDocumentStatus.ERROR, FiscalDocumentStatus.CONTINGENCY}
    ),
    FiscalDocumentStatus.SENDING: frozenset(
        {
            FiscalDocumentStatus.PROCESSING,
            FiscalDocumentStatus.AUTHORIZED,
            FiscalDocumentStatus.REJECTED,
            FiscalDocumentStatus.DENIED,
            FiscalDocumentStatus.PENDING_RECOVERY,
            FiscalDocumentStatus.CONTINGENCY,
            FiscalDocumentStatus.ERROR,
        }
    ),
    FiscalDocumentStatus.PROCESSING: frozenset(
        {
            FiscalDocumentStatus.AUTHORIZED,
            FiscalDocumentStatus.REJECTED,
            FiscalDocumentStatus.DENIED,
            FiscalDocumentStatus.PENDING_RECOVERY,
            FiscalDocumentStatus.CANCELED,
        }
    ),
    FiscalDocumentStatus.PENDING_RECOVERY: frozenset(
        {
            FiscalDocumentStatus.SENDING,
            FiscalDocumentStatus.AUTHORIZED,
            FiscalDocumentStatus.REJECTED,
            FiscalDocumentStatus.DENIED,
            FiscalDocumentStatus.CANCELED,
            FiscalDocumentStatus.CONTINGENCY,
            FiscalDocumentStatus.ERROR,
        }
    ),
    FiscalDocumentStatus.CONTINGENCY: frozenset(
        {
            FiscalDocumentStatus.SENDING,
            FiscalDocumentStatus.AUTHORIZED,
            FiscalDocumentStatus.REJECTED,
            FiscalDocumentStatus.DENIED,
            FiscalDocumentStatus.PENDING_RECOVERY,
            FiscalDocumentStatus.CANCELED,
            FiscalDocumentStatus.ERROR,
        }
    ),
    # A rejected document keeps its number and access key and is re-sent after the cause is fixed.
    FiscalDocumentStatus.REJECTED: frozenset(
        {FiscalDocumentStatus.DRAFT, FiscalDocumentStatus.CANCELED, FiscalDocumentStatus.ERROR}
    ),
    FiscalDocumentStatus.ERROR: frozenset(
        {FiscalDocumentStatus.DRAFT, FiscalDocumentStatus.PENDING_RECOVERY, FiscalDocumentStatus.CANCELED}
    ),
    FiscalDocumentStatus.AUTHORIZED: frozenset({FiscalDocumentStatus.CANCELED}),
    FiscalDocumentStatus.CANCELED: frozenset(),
    FiscalDocumentStatus.DENIED: frozenset(),
    FiscalDocumentStatus.LEGACY_SIMULATED: frozenset(),
}


def can_transition(current: FiscalDocumentStatus, target: FiscalDocumentStatus) -> bool:
    """Return whether moving from `current` to `target` is a legal workflow step."""

    if current == target:
        return True
    return target in _ALLOWED_TRANSITIONS.get(current, frozenset())


# ============================================================================
# cStat CLASSIFICATION
# ============================================================================

# 100 = Autorizado o uso da NF-e; 150 = Autorizado fora de prazo (contingência).
AUTHORIZED_CSTATS = frozenset({100, 150})
# 110/301/302/303 = Uso Denegado.
DENIED_CSTATS = frozenset({110, 301, 302, 303})
# Service down/paralyzed or not answering: retry later, never treat as a rejection.
SERVICE_UNAVAILABLE_CSTATS = frozenset({108, 109, 999})
# Lot received / processed / still processing.
LOT_RECEIVED_CSTAT = 103
LOT_PROCESSED_CSTAT = 104
LOT_PROCESSING_CSTAT = 105
# 204 = Duplicidade de NF-e: the document exists at SEFAZ, ask its situation instead of re-sending.
DUPLICATE_CSTAT = 204
# Consulta: 100 authorized, 101 canceled, 217 unknown to SEFAZ (safe to send the same XML again).
CONSULT_CANCELED_CSTAT = 101
CONSULT_NOT_FOUND_CSTAT = 217
# Events: 135 registered and linked, 136 registered but not linked, 155 canceled after the deadline.
EVENT_ACCEPTED_CSTATS = frozenset({135, 136, 155})
INUTILIZATION_ACCEPTED_CSTAT = 102
SERVICE_STATUS_OPERATING_CSTAT = 107


def is_authorized(cstat: int) -> bool:
    """Return whether `cstat` means the note is authorized."""

    return cstat in AUTHORIZED_CSTATS


def is_denied(cstat: int) -> bool:
    """Return whether `cstat` means SEFAZ denied use of the note."""

    return cstat in DENIED_CSTATS


def is_transient(cstat: int) -> bool:
    """Return whether `cstat` means SEFAZ is temporarily unable to answer."""

    return cstat in SERVICE_UNAVAILABLE_CSTATS


# ============================================================================
# PAYMENT METHODS
# ============================================================================

# Farmaura PDV payment method -> NFC-e tPag (MOC 7.00 Anexo I, YA02).
PAYMENT_METHOD_TO_TPAG: dict[str, str] = {
    "cash": "01",
    "credit": "03",
    "debit": "04",
    "pix": "17",
    # Card saved on the marketplace account and charged online through Asaas: still a credit card.
    "marketplace_card": "03",
}

CARD_TPAGS = frozenset({"03", "04"})


# ============================================================================
# ERRORS
# ============================================================================


class FiscalError(Exception):
    """Base class for fiscal engine errors."""

    category: FiscalErrorCategory = FiscalErrorCategory.UNEXPECTED

    def __init__(self, message: str, *, details: list[str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = list(details or [])


class FiscalDataError(FiscalError):
    """Raised when data required to emit is missing or invalid; the operator must fix it."""

    category = FiscalErrorCategory.MISSING_FISCAL_DATA


class FiscalSchemaError(FiscalError):
    """Raised when the generated XML does not validate against the official XSD."""

    category = FiscalErrorCategory.SCHEMA


class FiscalSignatureError(FiscalError):
    """Raised when the XML cannot be signed (certificate missing, expired or unreadable)."""

    category = FiscalErrorCategory.SIGNATURE


class FiscalTransientError(FiscalError):
    """Raised for timeouts, connection resets and 5xx answers; safe to retry with backoff."""

    category = FiscalErrorCategory.TRANSIENT_NETWORK


class ContingencyNotSupportedError(FiscalError):
    """Raised when offline contingency is requested but its QR Code signature is not implemented."""

    category = FiscalErrorCategory.CONFIGURATION
