"""
farmaura-api/app/repositories/prescription_repository.py

Prescription repository for Farmaura.

Responsibilities:
- load tenant-scoped prescription review data;
- isolate checklist and order lookups used by pharmacist workflows;
- support safe state transitions for prescription reviews;

Observations:
- repository methods return denormalized snapshots instead of ORM relationships;
- customer-facing upload flows can reuse this repository later;
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.prescription import Prescription
from app.models.prescription_check import PrescriptionCheck
from app.models.prescription_item import PrescriptionItem


# ============================================================================
# PRESCRIPTION REPOSITORY
# ============================================================================


class PrescriptionRepository:
    """Provide prescription persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_review(self, *, tenant_id: str) -> list[Prescription]:
        """Return tenant-scoped prescriptions for the pharmacist queue."""

        statement = select(Prescription).where(Prescription.tenant_id == tenant_id).order_by(Prescription.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id(self, *, tenant_id: str, prescription_id: str) -> Prescription | None:
        """Return one tenant-scoped prescription by identifier."""

        statement = select(Prescription).where(Prescription.id == prescription_id, Prescription.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_items(self, *, prescription_ids: list[str]) -> list[PrescriptionItem]:
        """Return medication items for the requested prescriptions."""

        if not prescription_ids:
            return []
        statement = select(PrescriptionItem).where(PrescriptionItem.prescription_id.in_(prescription_ids)).order_by(PrescriptionItem.created_at.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_checks(self, *, prescription_ids: list[str]) -> list[PrescriptionCheck]:
        """Return review checks for the requested prescriptions."""

        if not prescription_ids:
            return []
        statement = select(PrescriptionCheck).where(PrescriptionCheck.prescription_id.in_(prescription_ids)).order_by(PrescriptionCheck.created_at.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_orders(self, *, order_ids: list[str]) -> list[Order]:
        """Return parent orders used by the review queue."""

        if not order_ids:
            return []
        statement = select(Order).where(Order.id.in_(order_ids))
        result = await self.session.execute(statement)
        return list(result.scalars().all())

