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
"""

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import UserRole
from app.models.chat_message import ChatMessage
from app.models.chat_thread import ChatThread
from app.models.customer import Customer
from app.models.order import Order
from app.models.user import User
from app.repositories.chat_repository import ChatRepository
from app.repositories.prescription_repository import PrescriptionRepository
from app.schemas.auth import TokenSubject
from app.schemas.chat import ChatMessageResponse, ChatSendMessageRequest, ChatThreadListResponse, ChatThreadResponse


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
        response = await self.list_customer_threads()
        match = next((item for item in response.items if item.id == thread.id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Thread payload unavailable after send.')
        return match

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

    async def _build_thread_list_response(self, threads: list[ChatThread], *, viewer_role: str) -> ChatThreadListResponse:
        """Build one serialized thread list response for the requested viewer."""

        thread_ids = [thread.id for thread in threads]
        messages = await self.repository.list_messages(thread_ids=thread_ids)
        prescription_ids = [message.prescription_id for message in messages if message.prescription_id]
        prescriptions = await self.prescription_repository.list_by_ids(prescription_ids=prescription_ids)
        prescription_map = {prescription.id: prescription for prescription in prescriptions}
        message_map: dict[str, list[ChatMessageResponse]] = {}
        for message in messages:
            prescription = prescription_map.get(message.prescription_id) if message.prescription_id else None
            message_map.setdefault(message.thread_id, []).append(
                ChatMessageResponse(
                    id=message.id,
                    from_role=self._map_message_role(message.sender_role, viewer_role=viewer_role),
                    text=message.body_text,
                    at=message.sent_at_label,
                    prescription_id=message.prescription_id,
                    prescription_status=prescription.status if prescription else "",
                    prescription_reference_url=prescription.digital_reference_url if prescription else "",
                )
            )
        return ChatThreadListResponse(
            items=[
                ChatThreadResponse(
                    id=thread.id,
                    customer=thread.customer_name_snapshot,
                    order=thread.order_code_snapshot or '—',
                    unread=thread.customer_unread_count if viewer_role == 'customer' else thread.pharmacist_unread_count,
                    online=False,
                    last_at=thread.last_message_at_label,
                    topic=thread.topic,
                    pharmacist_name=thread.pharmacist_name_snapshot,
                    msgs=message_map.get(thread.id, []),
                )
                for thread in threads
            ]
        )

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
        """Create one new customer-owned marketplace thread."""

        pharmacist = await self._resolve_default_pharmacist()
        resolved_order_code = order_code or await self._resolve_order_code(order_id)
        thread = ChatThread(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            order_id=order_id,
            customer_id=customer.id,
            pharmacist_user_id=pharmacist.id if pharmacist is not None else None,
            thread_code='CHAT-' + uuid4().hex[:8].upper(),
            source_channel='marketplace',
            thread_status='open',
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

    async def _resolve_order_code(self, order_id: str | None) -> str:
        """Return the order code snapshot for one order identifier."""

        if not order_id:
            return ''
        statement = select(Order).where(Order.id == order_id, Order.tenant_id == str(self.subject.tenant_id))
        result = await self.session.execute(statement)
        order = result.scalar_one_or_none()
        return '' if order is None else str(order.order_code or '')

    def _map_message_role(self, sender_role: str, *, viewer_role: str) -> str:
        """Map persisted sender roles to the current UI role vocabulary."""

        if viewer_role == 'customer':
            return 'me' if sender_role == UserRole.CUSTOMER.value else 'pharm'
        return 'cust' if sender_role == UserRole.CUSTOMER.value else 'me'
