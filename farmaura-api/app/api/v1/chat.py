"""
farmaura-api/app/api/v1/chat.py

Chat routes for Farmaura.

Responsibilities:
- expose pharmacist inbox and customer messaging endpoints;
- keep communication handlers explicit and tenant-scoped;
- delegate message persistence to the dedicated service layer;

Observations:
- internal and marketplace chat channels share the same persisted thread model;
- thread ownership is always derived from the authenticated subject.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject, require_marketplace_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.chat import ChatSendMessageRequest, ChatThreadListResponse, ChatThreadResponse
from app.services.chat_service import ChatService


# ============================================================================
# CHAT ROUTES
# ============================================================================


router = APIRouter()


@router.get('/threads', response_model=ChatThreadListResponse)
async def list_chat_threads(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadListResponse:
    """Return the internal pharmacist inbox threads."""

    service = ChatService(session=session, subject=subject)
    return await service.list_threads()


@router.post('/threads/{thread_id}/messages', response_model=ChatThreadResponse)
async def send_chat_message(
    thread_id: str,
    payload: ChatSendMessageRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Persist one outbound pharmacist message."""

    service = ChatService(session=session, subject=subject)
    return await service.send_message(thread_id, payload)


@router.get('/customer/threads', response_model=ChatThreadListResponse)
async def list_customer_chat_threads(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadListResponse:
    """Return the authenticated customer chat inbox."""

    service = ChatService(session=session, subject=subject)
    return await service.list_customer_threads()


@router.post('/customer/threads', response_model=ChatThreadResponse)
async def ensure_customer_chat_thread(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Return or create one customer chat thread."""

    service = ChatService(session=session, subject=subject)
    return await service.ensure_customer_thread()


@router.post('/customer/threads/{thread_id}/messages', response_model=ChatThreadResponse)
async def send_customer_chat_message(
    thread_id: str,
    payload: ChatSendMessageRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Persist one outbound customer message."""

    service = ChatService(session=session, subject=subject)
    return await service.send_customer_message(thread_id, payload)
