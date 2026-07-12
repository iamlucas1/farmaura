"""
farmaura-api/app/schemas/chat.py

Chat schemas for Farmaura.

Responsibilities:
- define pharmacist messaging contracts;
- expose thread and message payloads for the internal inbox;
- validate outgoing internal messages conservatively;

Observations:
- attachments remain out of scope for this first operational slice;
- thread responses are shaped to match the current pharmacist console UI;
"""

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# CHAT RESPONSE SCHEMAS
# ============================================================================


class ChatMessageResponse(StrictModel):
    """Represent one message inside a thread."""

    id: str
    from_role: str
    text: str
    at: str


class ChatThreadResponse(StrictModel):
    """Represent one operational chat thread."""

    id: str
    customer: str
    order: str
    unread: int
    online: bool
    last_at: str
    topic: str
    pharmacist_name: str = ""
    msgs: list[ChatMessageResponse]


class ChatThreadListResponse(StrictModel):
    """Represent the pharmacist inbox payload."""

    items: list[ChatThreadResponse]


class ChatSendMessageRequest(StrictModel):
    """Validate one outgoing pharmacist message."""

    text: str = Field(min_length=1, max_length=4000)

