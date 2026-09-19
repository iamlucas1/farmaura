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
from app.models.prescription_file import PrescriptionFile
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

    async def list_by_ids(self, *, prescription_ids: list[str]) -> list[Prescription]:
        """Return prescriptions by identifier, for denormalizing chat messages."""

        if not prescription_ids:
            return []
        statement = select(Prescription).where(Prescription.id.in_(prescription_ids))
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add(self, prescription: Prescription) -> Prescription:
        """Persist one new prescription."""

        self.session.add(prescription)
        await self.session.flush()
        return prescription

    async def add_item(self, item: PrescriptionItem) -> PrescriptionItem:
        """Persist one new prescription medication item."""

        self.session.add(item)
        await self.session.flush()
        return item

    async def add_file(self, prescription_file: PrescriptionFile) -> PrescriptionFile:
        """Persist one new prescription file link."""

        self.session.add(prescription_file)
        await self.session.flush()
        return prescription_file

    async def get_latest_for_customer(
        self, *, tenant_id: str, customer_id: str, source_channel: str = "marketplace",
    ) -> Prescription | None:
        """Return the customer's most recent prescription submitted ahead of an order.

        Used to gate marketplace checkout payment on prescription approval before an order
        exists — `order_id IS NULL` excludes prescriptions already tied to a placed order,
        whose approval/rejection instead flows through the order's own `prescription_status`.
        """

        statement = (
            select(Prescription)
            .where(
                Prescription.tenant_id == tenant_id,
                Prescription.customer_id == customer_id,
                Prescription.source_channel == source_channel,
                Prescription.order_id.is_(None),
            )
            .order_by(Prescription.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_latest_for_items(
        self, *, tenant_id: str, customer_id: str, inventory_item_ids: list[str], source_channel: str = "pdv",
    ) -> dict[str, tuple[Prescription, int | None]]:
        """Return the most recent prescription (and the quantity it was validated for) per inventory item, scoped to one channel."""

        if not inventory_item_ids:
            return {}
        statement = (
            select(Prescription, PrescriptionItem.inventory_item_id, PrescriptionItem.validated_quantity)
            .join(PrescriptionItem, PrescriptionItem.prescription_id == Prescription.id)
            .where(
                Prescription.tenant_id == tenant_id,
                Prescription.customer_id == customer_id,
                Prescription.source_channel == source_channel,
                PrescriptionItem.inventory_item_id.in_(inventory_item_ids),
            )
            .order_by(Prescription.created_at.desc())
        )
        result = await self.session.execute(statement)
        latest: dict[str, tuple[Prescription, int | None]] = {}
        for prescription, inventory_item_id, validated_quantity in result.all():
            if inventory_item_id not in latest:
                latest[inventory_item_id] = (prescription, validated_quantity)
        return latest

