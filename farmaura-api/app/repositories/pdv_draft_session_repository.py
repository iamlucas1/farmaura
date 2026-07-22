"""
farmaura-api/app/repositories/pdv_draft_session_repository.py

PDV draft session repository for Farmaura.

Responsibilities:
- load and persist in-progress PDV atendimento drafts;
- keep every query scoped to the owning pharmacist in addition to RLS enforcement;

Observations:
- ordering by most-recently-updated makes the newest autosave surface first in recovery lists.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pdv_draft_session import PdvDraftSession


# ============================================================================
# PDV DRAFT SESSION REPOSITORY
# ============================================================================


class PdvDraftSessionRepository:
    """Provide PDV draft session persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_pharmacist(self, *, tenant_id: str, pharmacist_user_id: str) -> list[PdvDraftSession]:
        """Return every open draft owned by one pharmacist, most recently updated first."""

        statement = (
            select(PdvDraftSession)
            .where(
                PdvDraftSession.tenant_id == tenant_id,
                PdvDraftSession.pharmacist_user_id == pharmacist_user_id,
            )
            .order_by(PdvDraftSession.updated_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_for_pharmacist(self, *, tenant_id: str, pharmacist_user_id: str, draft_id: str) -> PdvDraftSession | None:
        """Return one draft owned by the given pharmacist."""

        statement = select(PdvDraftSession).where(
            PdvDraftSession.id == draft_id,
            PdvDraftSession.tenant_id == tenant_id,
            PdvDraftSession.pharmacist_user_id == pharmacist_user_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add(self, draft: PdvDraftSession) -> PdvDraftSession:
        """Persist one new draft."""

        self.session.add(draft)
        await self.session.flush()
        return draft

    async def save(self, draft: PdvDraftSession) -> PdvDraftSession:
        """Flush updates for one existing draft."""

        self.session.add(draft)
        await self.session.flush()
        return draft

    async def delete(self, draft: PdvDraftSession) -> None:
        """Hard-delete one draft."""

        await self.session.delete(draft)
        await self.session.flush()
