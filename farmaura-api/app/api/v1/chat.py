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

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_subject_session, require_internal_subject, require_marketplace_subject
from app.core.config import Settings
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.chat import (
    ChatEnsureThreadRequest,
    ChatSendMessageRequest,
    ChatSpamFlagRequest,
    ChatSubmitPrescriptionLinkRequest,
    ChatThreadListResponse,
    ChatThreadResponse,
    ChatUnblockAckResponse,
    ChatUnblockDecisionRequest,
    ChatUnblockRequestCreateRequest,
    ChatUnblockRequestListResponse,
)
from app.services.chat_service import ChatService


# ============================================================================
# CHAT ROUTES
# ============================================================================


router = APIRouter()


@router.get('/threads', response_model=ChatThreadListResponse)
async def list_chat_threads(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadListResponse:
    """Return the internal pharmacist inbox threads."""

    service = ChatService(session=session, subject=subject)
    return await service.list_threads()


@router.post('/threads/{thread_id}/messages', response_model=ChatThreadResponse)
async def send_chat_message(
    thread_id: str,
    payload: ChatSendMessageRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Persist one outbound pharmacist message."""

    service = ChatService(session=session, subject=subject)
    return await service.send_message(thread_id, payload)


@router.post('/threads/{thread_id}/flag-spam', response_model=ChatThreadResponse)
async def flag_chat_thread_spam(
    thread_id: str,
    payload: ChatSpamFlagRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Toggle a thread's customer as flagged-spam, lowering their per-minute message limit."""

    service = ChatService(session=session, subject=subject)
    return await service.flag_customer_spam(thread_id, is_flagged=payload.is_flagged)


@router.post('/threads/{thread_id}/unblock', response_model=ChatThreadResponse)
async def unblock_chat_thread_customer(
    thread_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Directly lift a thread's customer chat block — pharmacist override, no appeal needed."""

    service = ChatService(session=session, subject=subject)
    return await service.unblock_customer(thread_id)


@router.get('/unblock-requests', response_model=ChatUnblockRequestListResponse)
async def list_chat_unblock_requests(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatUnblockRequestListResponse:
    """Return the pharmacist review queue of customer unblock appeals."""

    service = ChatService(session=session, subject=subject)
    return await service.list_unblock_requests()


@router.post('/unblock-requests/{request_id}/decision', response_model=ChatUnblockRequestListResponse)
async def decide_chat_unblock_request(
    request_id: str,
    payload: ChatUnblockDecisionRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatUnblockRequestListResponse:
    """Approve or deny one pending customer unblock appeal."""

    service = ChatService(session=session, subject=subject)
    return await service.decide_unblock_request(request_id, decision_status=payload.status, pharmacist_notes=payload.pharmacist_notes)


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
    payload: ChatEnsureThreadRequest | None = None,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Return or create one customer chat thread, optionally linked to one of the customer's orders."""

    service = ChatService(session=session, subject=subject)
    return await service.ensure_customer_thread(order_id=payload.order_id if payload else None)


@router.post('/customer/unblock-requests', response_model=ChatUnblockAckResponse)
async def create_customer_chat_unblock_request(
    payload: ChatUnblockRequestCreateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatUnblockAckResponse:
    """Submit one customer appeal against their current chat block."""

    service = ChatService(session=session, subject=subject)
    return await service.create_unblock_request(message=payload.message)


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


@router.post('/customer/threads/{thread_id}/prescriptions', response_model=ChatThreadResponse)
async def submit_customer_prescription(
    thread_id: str,
    file: UploadFile = File(...),
    note: str = Form(default="", max_length=1000),
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> ChatThreadResponse:
    """Validate, store, and post one prescription file into the pharmacist chat."""

    service = ChatService(session=session, subject=subject)
    return await service.submit_customer_prescription(thread_id=thread_id, file=file, note=note, settings=settings)


@router.post('/customer/threads/{thread_id}/prescriptions/link', response_model=ChatThreadResponse)
async def submit_customer_prescription_link(
    thread_id: str,
    payload: ChatSubmitPrescriptionLinkRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> ChatThreadResponse:
    """Create and post one link-based digital prescription into the pharmacist chat."""

    service = ChatService(session=session, subject=subject)
    return await service.submit_customer_prescription_link(thread_id=thread_id, url=payload.url)
