"""
farmaura-api/app/schemas/chat.py

Chat schemas for Farmaura.

Responsibilities:
- define pharmacist messaging contracts;
- expose thread and message payloads for the internal inbox;
- validate outgoing internal messages conservatively;

Observations:
- an attachment exposes only its id, original name, and content type — never the storage
  key (an internal identifier, not a public URL, per file_asset design intent); the actual
  file is fetched through the protected /uploads/{file_id} download endpoint, which
  re-checks ownership independently of anything in this response;
- thread responses are shaped to match the current pharmacist console UI;
"""

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# CHAT RESPONSE SCHEMAS
# ============================================================================


class ChatAttachmentResponse(StrictModel):
    """Represent one file attachment linked to a chat message."""

    file_id: str
    name: str
    content_type: str


class ChatMessageResponse(StrictModel):
    """Represent one message inside a thread."""

    id: str
    from_role: str
    text: str
    at: str
    prescription_id: str | None = None
    prescription_status: str = ""
    prescription_reference_url: str = ""
    attachment: ChatAttachmentResponse | None = None


class ChatThreadResponse(StrictModel):
    """Represent one operational chat thread."""

    id: str
    customer: str
    order: str
    protocol: str
    unread: int
    online: bool
    last_at: str
    topic: str
    pharmacist_name: str = ""
    msgs: list[ChatMessageResponse]
    thread_status: str = "open"
    closed_reason: str = ""
    customer_flagged_spam: bool = False
    customer_permanently_blocked: bool = False
    customer_blocked_until: str = ""


class ChatThreadListResponse(StrictModel):
    """Represent the pharmacist inbox payload."""

    items: list[ChatThreadResponse]


class ChatSendMessageRequest(StrictModel):
    """Validate one outgoing pharmacist message."""

    text: str = Field(min_length=1, max_length=4000)


class ChatSubmitPrescriptionLinkRequest(StrictModel):
    """Validate one link-based digital prescription submitted through chat.

    Mirrors the file-upload submission (`submit_customer_prescription`) but for a customer
    whose digital prescription already lives on an external platform — nothing to store, just
    the URL to review (see `Prescription.digital_reference_url`, the same field the PDV
    delivery_method == 'digital' path already writes).
    """

    url: str = Field(min_length=1, max_length=500)


class ChatEnsureThreadRequest(StrictModel):
    """Validate one request to fetch-or-create a customer thread, optionally linked to an order."""

    order_id: str | None = Field(default=None, max_length=36)


class ChatSpamFlagRequest(StrictModel):
    """Validate a pharmacist toggling a customer's spam flag."""

    is_flagged: bool


class ChatUnblockRequestCreateRequest(StrictModel):
    """Validate a customer's appeal against their current chat block."""

    message: str = Field(min_length=1, max_length=1000)


class ChatUnblockDecisionRequest(StrictModel):
    """Validate a pharmacist's decision on a customer's unblock appeal."""

    status: str = Field(pattern="^(approved|denied)$")
    pharmacist_notes: str = Field(default="", max_length=2000)


class ChatUnblockRequestMessagePreview(StrictModel):
    """Represent one recent customer message, for the pharmacist's unblock-request review context."""

    text: str
    at: str


class ChatUnblockRequestResponse(StrictModel):
    """Represent one customer unblock appeal for the pharmacist review queue."""

    id: str
    customer_id: str
    customer_name: str
    status: str
    customer_message: str
    violation_count_snapshot: int
    permanently_blocked_snapshot: bool
    total_requests_from_customer: int
    recent_messages: list[ChatUnblockRequestMessagePreview]
    decided_at: str = ""
    pharmacist_notes: str = ""
    created_at_label: str = ""


class ChatUnblockRequestListResponse(StrictModel):
    """Represent the pharmacist unblock-request review queue."""

    items: list[ChatUnblockRequestResponse]


class ChatUnblockAckResponse(StrictModel):
    """Acknowledge a customer's unblock appeal submission."""

    status: str

