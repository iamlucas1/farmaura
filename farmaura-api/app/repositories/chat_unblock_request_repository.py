"""
farmaura-api/app/repositories/chat_unblock_request_repository.py

Chat unblock request repository for Farmaura.

Responsibilities:
- persist and load customer appeals against an active chat spam block;
- keep tenant-scoped access explicit for both the customer and pharmacist sides;

Observations:
- requests are ordered pending-first so the pharmacist review queue naturally
  surfaces what still needs a decision ahead of already-decided history;
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_unblock_request import ChatUnblockRequest


# ============================================================================
# CHAT UNBLOCK REQUEST REPOSITORY
# ============================================================================


class ChatUnblockRequestRepository:
    """Provide chat unblock request persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_tenant(self, *, tenant_id: str) -> list[ChatUnblockRequest]:
        """Return every unblock request for a tenant, pending requests first."""

        statement = (
            select(ChatUnblockRequest)
            .where(ChatUnblockRequest.tenant_id == tenant_id)
            .order_by(
                (ChatUnblockRequest.status == "pending").desc(),
                ChatUnblockRequest.created_at.desc(),
            )
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_pending_for_customer(self, *, tenant_id: str, customer_id: str) -> ChatUnblockRequest | None:
        """Return the customer's currently pending request, if any."""

        statement = select(ChatUnblockRequest).where(
            ChatUnblockRequest.tenant_id == tenant_id,
            ChatUnblockRequest.customer_id == customer_id,
            ChatUnblockRequest.status == "pending",
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_id(self, *, tenant_id: str, request_id: str) -> ChatUnblockRequest | None:
        """Return one tenant-scoped unblock request by identifier."""

        statement = select(ChatUnblockRequest).where(
            ChatUnblockRequest.tenant_id == tenant_id,
            ChatUnblockRequest.id == request_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def count_for_customer(self, *, tenant_id: str, customer_id: str) -> int:
        """Return how many unblock requests this customer has made in total, decided or not."""

        statement = select(func.count(ChatUnblockRequest.id)).where(
            ChatUnblockRequest.tenant_id == tenant_id,
            ChatUnblockRequest.customer_id == customer_id,
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one() or 0)

    async def add(self, request: ChatUnblockRequest) -> ChatUnblockRequest:
        """Persist one new unblock request."""

        self.session.add(request)
        await self.session.flush()
        return request
