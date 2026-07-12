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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
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

