"""
farmaura-api/app/repositories/chat_repository.py

Chat repository for Farmaura.

Responsibilities:
- load pharmacist chat threads and message streams;
- enforce tenant-scoped thread access at the persistence layer;
- persist outbound pharmacist messages explicitly;

Observations:
- messages are append-only and returned ordered by creation time;
- attachment handling can be layered later without changing the text flow;
"""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
from app.models.chat_message_attachment import ChatMessageAttachment
from app.models.chat_thread import ChatThread


# ============================================================================
# CHAT REPOSITORY
# ============================================================================


class ChatRepository:
    """Provide chat persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_threads(self, *, tenant_id: str) -> list[ChatThread]:
        """Return tenant-scoped pharmacist chat threads."""

        statement = (
            select(ChatThread)
            .where(ChatThread.tenant_id == tenant_id, ChatThread.is_active.is_(True))
            .order_by(ChatThread.created_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_customer_threads(self, *, tenant_id: str, customer_id: str) -> list[ChatThread]:
        """Return customer-scoped chat threads."""

        statement = (
            select(ChatThread)
            .where(
                ChatThread.tenant_id == tenant_id,
                ChatThread.customer_id == customer_id,
                ChatThread.is_active.is_(True),
            )
            .order_by(ChatThread.created_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_thread_by_id(self, *, tenant_id: str, thread_id: str) -> ChatThread | None:
        """Return one tenant-scoped chat thread."""

        statement = select(ChatThread).where(
            ChatThread.id == thread_id,
            ChatThread.tenant_id == tenant_id,
            ChatThread.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_customer_thread_by_id(self, *, tenant_id: str, customer_id: str, thread_id: str) -> ChatThread | None:
        """Return one customer-owned tenant-scoped chat thread."""

        statement = select(ChatThread).where(
            ChatThread.id == thread_id,
            ChatThread.tenant_id == tenant_id,
            ChatThread.customer_id == customer_id,
            ChatThread.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_messages(self, *, thread_ids: list[str]) -> list[ChatMessage]:
        """Return messages for the requested threads."""

        if not thread_ids:
            return []
        statement = select(ChatMessage).where(ChatMessage.thread_id.in_(thread_ids)).order_by(ChatMessage.created_at.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add_message(self, message: ChatMessage) -> ChatMessage:
        """Persist one outbound chat message."""

        self.session.add(message)
        await self.session.flush()
        await self.session.refresh(message)
        return message

    async def add_attachment(self, attachment: ChatMessageAttachment) -> ChatMessageAttachment:
        """Persist one file attachment linked to a chat message."""

        self.session.add(attachment)
        await self.session.flush()
        return attachment

    async def close_threads_for_order(self, *, tenant_id: str, order_id: str, reason: str) -> None:
        """Freeze every open thread linked to one order — called when the order completes.

        A direct bulk UPDATE rather than load-then-save: the caller (order/delivery service)
        is mid-transaction on its own subject's session, and an order can only ever have zero
        or one linked thread in practice, but this stays correct even if that ever changes.
        """

        statement = (
            update(ChatThread)
            .where(ChatThread.tenant_id == tenant_id, ChatThread.order_id == order_id, ChatThread.thread_status == "open")
            .values(thread_status="closed", closed_reason=reason)
        )
        await self.session.execute(statement)

    async def list_messages_by_customer(self, *, tenant_id: str, customer_id: str, limit: int = 20) -> list[ChatMessage]:
        """Return one customer's most recent chat messages across all their threads.

        Used by the unblock-request review queue so a pharmacist can judge whether a block
        was actually deserved, without opening each of the customer's threads individually.
        """

        threads = await self.list_customer_threads(tenant_id=tenant_id, customer_id=customer_id)
        thread_ids = [thread.id for thread in threads]
        if not thread_ids:
            return []
        statement = (
            select(ChatMessage)
            .where(ChatMessage.thread_id.in_(thread_ids))
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_message_by_prescription_id(self, *, prescription_id: str) -> ChatMessage | None:
        """Return the chat message that first carried one prescription, to find its thread.

        A prescription submitted through the chat widget always has exactly one originating
        message (see `ChatService.submit_customer_prescription`); this is how a later pharmacist
        decision finds its way back to the same conversation.
        """

        statement = (
            select(ChatMessage)
            .where(ChatMessage.prescription_id == prescription_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_attachments(self, *, message_ids: list[str]) -> list[ChatMessageAttachment]:
        """Return attachments for the requested messages."""

        if not message_ids:
            return []
        statement = select(ChatMessageAttachment).where(ChatMessageAttachment.message_id.in_(message_ids))
        result = await self.session.execute(statement)
        return list(result.scalars().all())

