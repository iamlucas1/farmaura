"""
farmaura-api/app/services/chat_service.py

Chat service for Farmaura.

Responsibilities:
- expose the internal pharmacist inbox and customer thread actions;
- persist outbound messages with tenant-safe access checks for both portals;
- normalize chat aggregates for the existing console and marketplace UIs;

Observations:
- outbound messages are append-only;
- customer auto-replies were removed in favor of persisted chat threads;
- `apply_tenant_context` sets Postgres RLS session variables with `set_config(..., true)`
  ("SET LOCAL" semantics) — scoped to the current transaction, and silently cleared the
  moment that transaction commits. Every method here that commits mid-flow and then issues
  more RLS-scoped reads afterward (to build its own response) must reapply context first —
  see `_reapply_tenant_context` and its call sites below. Without it, the very next read
  (even of the acting subject's own row) comes back empty, not merely "as if logged out":
  RLS fails closed, so the app sees zero rows rather than an authorization error.
"""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.chat_guard import check_and_register_customer_message, clear_customer_block, is_customer_blocked
from app.core.config import Settings
from app.core.file_storage import write_private_file
from app.core.file_validation import EXTENSION_BY_CONTENT_TYPE, validate_upload
from app.core.tenant_context import apply_tenant_context
from app.domain.enums import OrderStatus, UserRole
from app.domain.validators import is_http_url
from app.models.chat_message import ChatMessage
from app.models.chat_message_attachment import ChatMessageAttachment
from app.models.chat_thread import ChatThread
from app.models.chat_unblock_request import ChatUnblockRequest
from app.models.customer import Customer
from app.models.file_asset import FileAsset
from app.models.order import Order
from app.models.prescription import Prescription
from app.models.prescription_file import PrescriptionFile
from app.models.user import User
from app.repositories.chat_repository import ChatRepository
from app.repositories.chat_unblock_request_repository import ChatUnblockRequestRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.file_repository import FileRepository
from app.repositories.prescription_repository import PrescriptionRepository
from app.schemas.auth import TokenSubject
from app.schemas.chat import (
    ChatAttachmentResponse,
    ChatMessageResponse,
    ChatSendMessageRequest,
    ChatThreadListResponse,
    ChatThreadResponse,
    ChatUnblockAckResponse,
    ChatUnblockRequestListResponse,
    ChatUnblockRequestMessagePreview,
    ChatUnblockRequestResponse,
)


# ============================================================================
# CHAT SERVICE
# ============================================================================


class ChatService:
    """Provide pharmacist and customer chat use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = ChatRepository(session)
        self.prescription_repository = PrescriptionRepository(session)
        self.file_repository = FileRepository(session)
        self.customer_repository = CustomerRepository(session)
        self.unblock_repository = ChatUnblockRequestRepository(session)

    async def _reapply_tenant_context(self) -> None:
        """Restore RLS session variables after a mid-method commit ended the transaction they
        lived in — see the module docstring. Call this before any further RLS-scoped read that
        follows a `self.session.commit()` within the same request."""

        await apply_tenant_context(self.session, self.subject)

    async def list_threads(self) -> ChatThreadListResponse:
        """Return tenant-scoped pharmacist chat threads."""

        threads = await self.repository.list_threads(tenant_id=str(self.subject.tenant_id))
        return await self._build_thread_list_response(threads, viewer_role='internal')

    async def list_customer_threads(self) -> ChatThreadListResponse:
        """Return customer-owned marketplace chat threads."""

        customer = await self._require_customer()
        threads = await self.repository.list_customer_threads(tenant_id=str(self.subject.tenant_id), customer_id=customer.id)
        return await self._build_thread_list_response(threads, viewer_role='customer')

    async def send_message(self, thread_id: str, payload: ChatSendMessageRequest) -> ChatThreadResponse:
        """Persist one outbound pharmacist message."""

        thread = await self.repository.get_thread_by_id(tenant_id=str(self.subject.tenant_id), thread_id=thread_id)
        if thread is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Thread not found.')
        self._require_thread_open(thread)
        message = ChatMessage(
            id=str(uuid4()),
            thread_id=thread.id,
            sender_user_id=str(self.subject.user_id),
            sender_customer_id=None,
            message_type='text',
            sender_role=self.subject.role.value,
            sender_name_snapshot='Farmacêutico',
            body_text=payload.text,
            sent_at_label='agora',
            customer_read=False,
            pharmacist_read=True,
            is_internal_note=False,
        )
        await self.repository.add_message(message)
        thread.last_message_preview = payload.text[:240]
        thread.last_message_at_label = 'agora'
        thread.pharmacist_unread_count = 0
        thread.customer_unread_count = int(thread.customer_unread_count or 0) + 1
        await self.session.commit()
        await self._reapply_tenant_context()
        response = await self.list_threads()
        match = next((item for item in response.items if item.id == thread_id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after send.')
        return match

    async def send_customer_message(self, thread_id: str, payload: ChatSendMessageRequest) -> ChatThreadResponse:
        """Persist one outbound marketplace customer message."""

        customer = await self._require_customer()
        thread = await self.repository.get_customer_thread_by_id(
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer.id,
            thread_id=thread_id,
        )
        if thread is None:
            thread = await self._create_customer_thread(customer=customer, topic='Atendimento farmacêutico')
        self._require_thread_open(thread)
        await check_and_register_customer_message(self.session, customer)
        message = ChatMessage(
            id=str(uuid4()),
            thread_id=thread.id,
            sender_user_id=None,
            sender_customer_id=customer.id,
            message_type='text',
            sender_role=self.subject.role.value,
            sender_name_snapshot=customer.full_name,
            body_text=payload.text,
            sent_at_label='agora',
            customer_read=True,
            pharmacist_read=False,
            is_internal_note=False,
        )
        await self.repository.add_message(message)
        thread.last_message_preview = payload.text[:240]
        thread.last_message_at_label = 'agora'
        thread.customer_unread_count = 0
        thread.pharmacist_unread_count = int(thread.pharmacist_unread_count or 0) + 1
        await self.session.commit()
        await self._reapply_tenant_context()
        response = await self.list_customer_threads()
        match = next((item for item in response.items if item.id == thread.id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after send.')
        return match

    async def submit_customer_prescription(
        self, *, thread_id: str, file: UploadFile, note: str, settings: Settings,
    ) -> ChatThreadResponse:
        """Validate and store one customer-submitted prescription file, posting it into the chat.

        Folds the marketplace's "enviar receita" flow into the pharmacist chat: the upload is
        validated and stored exactly like any other protected file (see `validate_upload` /
        `write_private_file`), then linked from *both* sides that already know how to render it —
        a `Prescription` + `PrescriptionFile` pair so it enters the existing pharmacist review
        queue (`PrescriptionService.list_review_queue`), and a `ChatMessageAttachment` so the
        conversation itself shows what was sent. The chat message carries `prescription_id`, which
        the internal console's chat screen already renders with an approve/reject control — no
        changes needed there for this to work end to end.
        """

        customer = await self._require_customer()
        thread = await self.repository.get_customer_thread_by_id(
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer.id,
            thread_id=thread_id,
        )
        if thread is None:
            thread = await self._create_customer_thread(customer=customer, topic='Atendimento farmacêutico')
        self._require_thread_open(thread)
        await check_and_register_customer_message(self.session, customer)

        await validate_upload(file, settings)
        content = await file.read()
        await file.seek(0)
        tenant_id = str(self.subject.tenant_id)
        owner_user_id = str(self.subject.user_id)
        extension = EXTENSION_BY_CONTENT_TYPE.get(file.content_type or '', '')
        storage_key = f"{tenant_id}/{owner_user_id}/{uuid4()}{extension}"
        await write_private_file(settings=settings, storage_key=storage_key, content=content)
        file_asset = FileAsset(
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
            original_name=file.filename or 'receita',
            storage_key=storage_key,
            content_type=file.content_type or 'application/octet-stream',
            size_bytes=len(content),
        )
        await self.file_repository.save(file_asset)

        prescription = Prescription(
            id=str(uuid4()),
            tenant_id=tenant_id,
            customer_id=customer.id,
            order_id=thread.order_id,
            prescription_code='RX-' + uuid4().hex[:6].upper(),
            source_channel='marketplace',
            delivery_method='digital',
            status='pending',
            patient_name_snapshot=customer.full_name,
            patient_document_snapshot=customer.cpf,
            patient_phone_snapshot=customer.phone,
            prescription_type='Receita digital enviada pelo chat',
            submitted_at_label='agora',
            has_controlled_medication=False,
            requires_retention=True,
        )
        await self.prescription_repository.add(prescription)
        await self.prescription_repository.add_file(
            PrescriptionFile(
                id=str(uuid4()),
                prescription_id=prescription.id,
                file_asset_id=file_asset.id,
                page_order=1,
                original_name_snapshot=file_asset.original_name,
                content_type_snapshot=file_asset.content_type,
                is_primary=True,
            )
        )

        message_text = note.strip() or 'Receita enviada para validação.'
        message = ChatMessage(
            id=str(uuid4()),
            thread_id=thread.id,
            sender_user_id=None,
            sender_customer_id=customer.id,
            message_type='prescription_request',
            sender_role=self.subject.role.value,
            sender_name_snapshot=customer.full_name,
            body_text=message_text,
            prescription_id=prescription.id,
            sent_at_label='agora',
            customer_read=True,
            pharmacist_read=False,
            is_internal_note=False,
        )
        await self.repository.add_message(message)
        await self.repository.add_attachment(
            ChatMessageAttachment(
                id=str(uuid4()),
                message_id=message.id,
                file_asset_id=file_asset.id,
                original_name_snapshot=file_asset.original_name,
                content_type_snapshot=file_asset.content_type,
            )
        )
        thread.last_message_preview = message_text[:240]
        thread.last_message_at_label = 'agora'
        thread.customer_unread_count = 0
        thread.pharmacist_unread_count = int(thread.pharmacist_unread_count or 0) + 1
        await self.session.commit()
        await self._reapply_tenant_context()
        response = await self.list_customer_threads()
        match = next((item for item in response.items if item.id == thread.id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after send.')
        return match

    async def submit_customer_prescription_link(self, *, thread_id: str, url: str) -> ChatThreadResponse:
        """Create one link-based digital prescription from a chat message, posting it into the thread.

        Same "folds into pharmacist chat" trick as `submit_customer_prescription`, but for a
        customer whose digital prescription already lives on an external platform — nothing to
        validate/store here, `digital_reference_url` is the record of what to review instead of
        a `PrescriptionFile` (the same field the PDV delivery_method == 'digital' path already
        writes, see `PrescriptionService.create_from_pdv`). The internal console's chat screen
        already renders `prescription_reference_url` as a link with no changes needed — it was
        built for the PDV case and never actually reachable from the marketplace side until now.
        """

        normalized_url = url.strip()
        if not is_http_url(normalized_url):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Envie um link http(s) válido.')

        customer = await self._require_customer()
        thread = await self.repository.get_customer_thread_by_id(
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer.id,
            thread_id=thread_id,
        )
        if thread is None:
            thread = await self._create_customer_thread(customer=customer, topic='Atendimento farmacêutico')
        self._require_thread_open(thread)
        await check_and_register_customer_message(self.session, customer)

        prescription = Prescription(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer.id,
            order_id=thread.order_id,
            prescription_code='RX-' + uuid4().hex[:6].upper(),
            source_channel='marketplace',
            delivery_method='digital',
            digital_reference_url=normalized_url,
            status='pending',
            patient_name_snapshot=customer.full_name,
            patient_document_snapshot=customer.cpf,
            patient_phone_snapshot=customer.phone,
            prescription_type='Receita digital enviada pelo chat (link)',
            submitted_at_label='agora',
            has_controlled_medication=False,
            requires_retention=True,
        )
        await self.prescription_repository.add(prescription)

        message_text = 'Receita digital enviada para validação: ' + normalized_url
        message = ChatMessage(
            id=str(uuid4()),
            thread_id=thread.id,
            sender_user_id=None,
            sender_customer_id=customer.id,
            message_type='prescription_request',
            sender_role=self.subject.role.value,
            sender_name_snapshot=customer.full_name,
            body_text=message_text,
            prescription_id=prescription.id,
            sent_at_label='agora',
            customer_read=True,
            pharmacist_read=False,
            is_internal_note=False,
        )
        await self.repository.add_message(message)
        thread.last_message_preview = message_text[:240]
        thread.last_message_at_label = 'agora'
        thread.customer_unread_count = 0
        thread.pharmacist_unread_count = int(thread.pharmacist_unread_count or 0) + 1
        await self.session.commit()
        await self._reapply_tenant_context()
        response = await self.list_customer_threads()
        match = next((item for item in response.items if item.id == thread.id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after send.')
        return match

    async def flag_customer_spam(self, thread_id: str, *, is_flagged: bool) -> ChatThreadResponse:
        """Toggle a thread's customer as flagged-spam, lowering their per-minute message limit."""

        thread = await self.repository.get_thread_by_id(tenant_id=str(self.subject.tenant_id), thread_id=thread_id)
        if thread is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Thread not found.')
        customer = await self.customer_repository.get_by_id(tenant_id=str(self.subject.tenant_id), customer_id=thread.customer_id)
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Customer not found.')
        customer.chat_flagged_spam = is_flagged
        await self.session.commit()
        await self._reapply_tenant_context()
        response = await self.list_threads()
        match = next((item for item in response.items if item.id == thread_id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after flagging.')
        return match

    async def unblock_customer(self, thread_id: str) -> ChatThreadResponse:
        """Directly lift a thread's customer chat block — the pharmacist's own override, no appeal needed."""

        thread = await self.repository.get_thread_by_id(tenant_id=str(self.subject.tenant_id), thread_id=thread_id)
        if thread is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Thread not found.')
        customer = await self.customer_repository.get_by_id(tenant_id=str(self.subject.tenant_id), customer_id=thread.customer_id)
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Customer not found.')
        clear_customer_block(customer)
        await self.session.commit()
        await self._reapply_tenant_context()
        response = await self.list_threads()
        match = next((item for item in response.items if item.id == thread_id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after unblocking.')
        return match

    async def create_unblock_request(self, *, message: str) -> ChatUnblockAckResponse:
        """Persist a customer's appeal against their current chat block."""

        customer = await self._require_customer()
        if not is_customer_blocked(customer):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Você não está bloqueado no momento.')
        existing = await self.unblock_repository.get_pending_for_customer(tenant_id=str(self.subject.tenant_id), customer_id=customer.id)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Você já tem uma contestação em análise.')
        threads = await self.repository.list_customer_threads(tenant_id=str(self.subject.tenant_id), customer_id=customer.id)
        request = ChatUnblockRequest(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer.id,
            thread_id=threads[0].id if threads else None,
            status='pending',
            customer_message=message,
            violation_count_snapshot=int(customer.chat_violation_count or 0),
            permanently_blocked_snapshot=customer.chat_permanently_blocked,
        )
        await self.unblock_repository.add(request)
        await self.session.commit()
        return ChatUnblockAckResponse(status='pending')

    async def list_unblock_requests(self) -> ChatUnblockRequestListResponse:
        """Return every unblock request for the pharmacist review queue, pending first."""

        requests = await self.unblock_repository.list_for_tenant(tenant_id=str(self.subject.tenant_id))
        items = []
        for request in requests:
            customer = await self.customer_repository.get_by_id(tenant_id=str(self.subject.tenant_id), customer_id=request.customer_id)
            recent_messages = await self.repository.list_messages_by_customer(
                tenant_id=str(self.subject.tenant_id), customer_id=request.customer_id, limit=10,
            )
            total_requests = await self.unblock_repository.count_for_customer(tenant_id=str(self.subject.tenant_id), customer_id=request.customer_id)
            items.append(
                ChatUnblockRequestResponse(
                    id=request.id,
                    customer_id=request.customer_id,
                    customer_name=customer.full_name if customer else '',
                    status=request.status,
                    customer_message=request.customer_message,
                    violation_count_snapshot=request.violation_count_snapshot,
                    permanently_blocked_snapshot=request.permanently_blocked_snapshot,
                    total_requests_from_customer=total_requests,
                    recent_messages=[
                        ChatUnblockRequestMessagePreview(text=message.body_text, at=message.sent_at_label)
                        for message in recent_messages
                    ],
                    decided_at=request.decided_at.isoformat() if request.decided_at else '',
                    pharmacist_notes=request.pharmacist_notes,
                    created_at_label=request.created_at.isoformat(),
                )
            )
        return ChatUnblockRequestListResponse(items=items)

    async def decide_unblock_request(self, request_id: str, *, decision_status: str, pharmacist_notes: str) -> ChatUnblockRequestListResponse:
        """Approve or deny one pending unblock request."""

        request = await self.unblock_repository.get_by_id(tenant_id=str(self.subject.tenant_id), request_id=request_id)
        if request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Unblock request not found.')
        if request.status != 'pending':
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Esta contestação já foi decidida.')
        customer = await self.customer_repository.get_by_id(tenant_id=str(self.subject.tenant_id), customer_id=request.customer_id)
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Customer not found.')
        request.status = decision_status
        request.pharmacist_notes = pharmacist_notes
        request.decided_at = datetime.now(UTC)
        request.decided_by_user_id = str(self.subject.user_id)
        if decision_status == 'approved':
            clear_customer_block(customer)
        await self.session.commit()
        await self._reapply_tenant_context()
        return await self.list_unblock_requests()

    async def ensure_customer_thread(self, *, order_id: str | None = None, order_code: str | None = None, topic: str | None = None) -> ChatThreadResponse:
        """Return or create one customer-owned thread for the provided order."""

        customer = await self._require_customer()
        threads = await self.repository.list_customer_threads(tenant_id=str(self.subject.tenant_id), customer_id=customer.id)
        normalized_order_id = str(order_id or '').strip()
        normalized_order_code = str(order_code or '').strip()
        for thread in threads:
            if normalized_order_id and thread.order_id == normalized_order_id:
                return await self._find_customer_thread_response(thread.id)
            if normalized_order_code and thread.order_code_snapshot == normalized_order_code:
                return await self._find_customer_thread_response(thread.id)
        created = await self._create_customer_thread(
            customer=customer,
            order_id=normalized_order_id or None,
            order_code=normalized_order_code or None,
            topic=topic or ('Pedido ' + normalized_order_code if normalized_order_code else 'Atendimento farmacêutico'),
        )
        await self.session.commit()
        await self._reapply_tenant_context()
        return await self._find_customer_thread_response(created.id)

    async def _find_customer_thread_response(self, thread_id: str) -> ChatThreadResponse:
        """Return one serialized customer thread response by identifier."""

        response = await self.list_customer_threads()
        match = next((item for item in response.items if item.id == thread_id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after creation.')
        return match

    async def ensure_thread_for_customer(self, *, customer_id: str, topic: str) -> ChatThread:
        """Return or create one thread for a customer, callable by an internal (pharmacist/admin) actor.

        Unlike `ensure_customer_thread`, this does not require the acting subject to be the
        customer — used by PDV to route a prescription validation request into the customer's
        existing conversation without needing them to be logged into the marketplace right now.
        """

        customer_statement = select(Customer).where(Customer.id == customer_id, Customer.tenant_id == str(self.subject.tenant_id))
        customer_result = await self.session.execute(customer_statement)
        customer = customer_result.scalar_one_or_none()
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
        threads = await self.repository.list_customer_threads(tenant_id=str(self.subject.tenant_id), customer_id=customer.id)
        for thread in threads:
            if thread.thread_status == "open":
                return thread
        return await self._create_customer_thread(customer=customer, topic=topic)

    async def post_prescription_request_message(self, *, thread_id: str, prescription_id: str, text: str) -> None:
        """Post one system-originated prescription validation request into an existing thread."""

        thread = await self.repository.get_thread_by_id(tenant_id=str(self.subject.tenant_id), thread_id=thread_id)
        if thread is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
        message = ChatMessage(
            id=str(uuid4()),
            thread_id=thread.id,
            sender_user_id=str(self.subject.user_id),
            sender_customer_id=None,
            message_type="prescription_request",
            sender_role=self.subject.role.value,
            sender_name_snapshot="Farmacêutico",
            body_text=text,
            prescription_id=prescription_id,
            sent_at_label="agora",
            customer_read=False,
            pharmacist_read=False,
            is_internal_note=False,
        )
        await self.repository.add_message(message)
        thread.last_message_preview = text[:240]
        thread.last_message_at_label = "agora"
        thread.pharmacist_unread_count = int(thread.pharmacist_unread_count or 0) + 1

    async def post_prescription_decision_message(self, *, prescription_id: str, decision_status: str, rejection_reason: str) -> None:
        """Post the pharmacist's approve/reject decision back into the originating chat thread.

        A plain text message (not `message_type='prescription_request'`, and no `prescription_id`
        set) — the request message already carries its own resolved approve/reject state, so this
        is just the human-readable follow-up the customer sees explaining what happened, same as
        any other pharmacist reply. Silently no-ops when the prescription didn't originate from a
        chat message (e.g. the PDV in-store flow), since there is no conversation to post into.

        A rejection also closes the thread (same 'closed' + `closed_reason` mechanism used when
        an order completes, see ChatRepository.close_threads_for_order) — this is meant to be a
        clean end to that specific submission's back-and-forth, not an invitation to argue the
        decision in place. The customer's own "reenviar receita" affordance already opens a fresh
        thread once this one is closed (ensureMarketplaceChatThread skips closed threads when
        looking for one to reuse), so nothing is actually lost — just a clean slate per attempt.
        """

        origin_message = await self.repository.get_message_by_prescription_id(prescription_id=prescription_id)
        if origin_message is None:
            return
        thread = await self.repository.get_thread_by_id(tenant_id=str(self.subject.tenant_id), thread_id=origin_message.thread_id)
        if thread is None:
            return
        text = (
            "Receita validada! Seu pedido já pode seguir para o pagamento."
            if decision_status == "approved"
            else (
                "Receita recusada pelo farmacêutico. Motivo: " + rejection_reason
                + " Se você acha que foi um engano, abra um novo atendimento e envie uma nova receita."
            )
        )
        message = ChatMessage(
            id=str(uuid4()),
            thread_id=thread.id,
            sender_user_id=str(self.subject.user_id),
            sender_customer_id=None,
            message_type="text",
            sender_role=self.subject.role.value,
            sender_name_snapshot="Farmacêutico",
            body_text=text,
            sent_at_label="agora",
            customer_read=False,
            pharmacist_read=True,
            is_internal_note=False,
        )
        await self.repository.add_message(message)
        thread.last_message_preview = text[:240]
        thread.last_message_at_label = "agora"
        thread.customer_unread_count = int(thread.customer_unread_count or 0) + 1
        if decision_status == "rejected":
            thread.thread_status = "closed"
            thread.closed_reason = "prescription_rejected"

    async def _build_thread_list_response(self, threads: list[ChatThread], *, viewer_role: str) -> ChatThreadListResponse:
        """Build one serialized thread list response for the requested viewer."""

        thread_ids = [thread.id for thread in threads]
        messages = await self.repository.list_messages(thread_ids=thread_ids)
        prescription_ids = [message.prescription_id for message in messages if message.prescription_id]
        prescriptions = await self.prescription_repository.list_by_ids(prescription_ids=prescription_ids)
        prescription_map = {prescription.id: prescription for prescription in prescriptions}
        message_ids = [message.id for message in messages]
        attachments = await self.repository.list_attachments(message_ids=message_ids)
        attachment_map = {attachment.message_id: attachment for attachment in attachments}
        message_map: dict[str, list[ChatMessageResponse]] = {}
        for message in messages:
            prescription = prescription_map.get(message.prescription_id) if message.prescription_id else None
            attachment = attachment_map.get(message.id)
            message_map.setdefault(message.thread_id, []).append(
                ChatMessageResponse(
                    id=message.id,
                    from_role=self._map_message_role(message.sender_role, viewer_role=viewer_role),
                    text=message.body_text,
                    at=message.sent_at_label,
                    prescription_id=message.prescription_id,
                    prescription_status=prescription.status if prescription else "",
                    prescription_reference_url=prescription.digital_reference_url if prescription else "",
                    attachment=ChatAttachmentResponse(
                        file_id=attachment.file_asset_id,
                        name=attachment.original_name_snapshot,
                        content_type=attachment.content_type_snapshot,
                    ) if attachment else None,
                )
            )
        customer_map: dict[str, Customer] = {}
        if viewer_role == 'internal':
            customer_ids = list({thread.customer_id for thread in threads})
            if customer_ids:
                statement = select(Customer).where(Customer.id.in_(customer_ids))
                result = await self.session.execute(statement)
                customer_map = {customer.id: customer for customer in result.scalars().all()}
        return ChatThreadListResponse(
            items=[
                ChatThreadResponse(
                    id=thread.id,
                    customer=thread.customer_name_snapshot,
                    order=thread.order_code_snapshot or '—',
                    protocol=thread.thread_code,
                    unread=thread.customer_unread_count if viewer_role == 'customer' else thread.pharmacist_unread_count,
                    online=False,
                    last_at=thread.last_message_at_label,
                    topic=thread.topic,
                    pharmacist_name=thread.pharmacist_name_snapshot,
                    msgs=message_map.get(thread.id, []),
                    thread_status=thread.thread_status,
                    closed_reason=thread.closed_reason,
                    **self._spam_fields(customer_map.get(thread.customer_id), viewer_role=viewer_role),
                )
                for thread in threads
            ]
        )

    def _spam_fields(self, customer: Customer | None, *, viewer_role: str) -> dict[str, object]:
        """Return the spam/block fields for one thread's response — internal viewers only.

        A customer's own thread list never carries their block state; they learn about a
        block from the 429 raised on their next send attempt instead (see `chat_guard`).
        """

        if viewer_role != 'internal' or customer is None:
            return {}
        return {
            'customer_flagged_spam': customer.chat_flagged_spam,
            'customer_permanently_blocked': customer.chat_permanently_blocked,
            'customer_blocked_until': customer.chat_blocked_until.isoformat() if is_customer_blocked(customer) and not customer.chat_permanently_blocked else '',
        }

    async def _require_customer(self) -> Customer:
        """Load the customer associated with the authenticated subject."""

        user_statement = select(User).where(User.id == str(self.subject.user_id))
        user_result = await self.session.execute(user_statement)
        user = user_result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Customer session user was not found.')
        customer_statement = select(Customer).where(
            Customer.tenant_id == str(self.subject.tenant_id),
            Customer.email == user.email,
            Customer.is_active.is_(True),
        )
        customer_result = await self.session.execute(customer_statement)
        customer = customer_result.scalar_one_or_none()
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Customer profile was not found.')
        return customer

    async def _create_customer_thread(self, *, customer: Customer, topic: str, order_id: str | None = None, order_code: str | None = None) -> ChatThread:
        """Create one new customer-owned marketplace thread.

        If the linked order is already in a completed state (delivered, or picked up), the
        thread is born already closed — the marketplace order picker is expected to filter
        those out before offering a link, but this stays correct even if it doesn't, matching
        the standing rule that a completed order's chat cannot stay open (see `close_threads_for_order`).
        """

        pharmacist = await self._resolve_default_pharmacist()
        resolved_order_code, order_already_completed = await self._resolve_order_code_and_completion(order_id)
        resolved_order_code = order_code or resolved_order_code
        thread = ChatThread(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            order_id=order_id,
            customer_id=customer.id,
            pharmacist_user_id=pharmacist.id if pharmacist is not None else None,
            thread_code='CHAT-' + uuid4().hex[:8].upper(),
            source_channel='marketplace',
            thread_status='closed' if order_already_completed else 'open',
            closed_reason='order_completed' if order_already_completed else '',
            topic=topic,
            customer_name_snapshot=customer.full_name,
            pharmacist_name_snapshot=pharmacist.full_name if pharmacist is not None else '',
            order_code_snapshot=resolved_order_code or '',
            last_message_preview='',
            last_message_at_label='agora',
            customer_unread_count=0,
            pharmacist_unread_count=0,
            is_active=True,
        )
        self.session.add(thread)
        await self.session.flush()
        return thread

    async def _resolve_default_pharmacist(self) -> User | None:
        """Return the default pharmacist for customer-facing threads."""

        statement = select(User).where(
            User.tenant_id == str(self.subject.tenant_id),
            User.role == UserRole.PHARMACIST.value,
            User.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return result.scalars().first()

    async def _resolve_order_code_and_completion(self, order_id: str | None) -> tuple[str, bool]:
        """Return the order code snapshot and whether that order is already a completed transaction.

        "Completed" mirrors the two real completion points in the codebase (see
        `close_threads_for_order` call sites): delivered, or picked up (retirada confirmed —
        represented as DISPATCHED + completed_at_label == 'Retirado', there is no separate
        "picked up" order status today).
        """

        if not order_id:
            return '', False
        statement = select(Order).where(Order.id == order_id, Order.tenant_id == str(self.subject.tenant_id))
        result = await self.session.execute(statement)
        order = result.scalar_one_or_none()
        if order is None:
            return '', False
        is_completed = order.status == OrderStatus.DELIVERED.value or (
            order.status == OrderStatus.DISPATCHED.value and order.completed_at_label == 'Retirado'
        )
        return str(order.order_code or ''), is_completed

    def _require_thread_open(self, thread: ChatThread) -> None:
        """Reject the request with 409 if the thread was frozen because its order completed.

        Applied to every send path on both sides (pharmacist and customer) — once a thread is
        closed it must stay immutable, so this can't just be a client-side hint.
        """

        if thread.thread_status != 'closed':
            return
        if thread.closed_reason == 'order_completed':
            detail = 'Este atendimento foi encerrado porque o pedido foi concluído. Abra um novo atendimento para continuar.'
        else:
            detail = 'Este atendimento foi encerrado. Abra um novo atendimento para continuar.'
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    def _map_message_role(self, sender_role: str, *, viewer_role: str) -> str:
        """Map persisted sender roles to the current UI role vocabulary."""

        if viewer_role == 'customer':
            return 'me' if sender_role == UserRole.CUSTOMER.value else 'pharm'
        return 'cust' if sender_role == UserRole.CUSTOMER.value else 'me'
