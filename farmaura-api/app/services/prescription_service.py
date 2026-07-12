"""
farmaura-api/app/services/prescription_service.py

Prescription service for Farmaura.

Responsibilities:
- expose pharmacist review queue use-cases;
- validate prescription status decisions server-side;
- shape prescription aggregates for the internal console;

Observations:
- approval and rejection remain deliberately explicit and auditable;
- downstream SNGPC or retention workflows can subscribe to these state changes later;
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.prescription_repository import PrescriptionRepository
from app.schemas.auth import TokenSubject
from app.schemas.prescriptions import (
    PrescriptionCheckResponse,
    PrescriptionDecisionRequest,
    PrescriptionMedicationResponse,
    PrescriptionQueueItemResponse,
    PrescriptionQueueResponse,
)


# ============================================================================
# PRESCRIPTION SERVICE
# ============================================================================


class PrescriptionService:
    """Provide prescription review use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = PrescriptionRepository(session)

    async def list_review_queue(self) -> PrescriptionQueueResponse:
        """Return the pharmacist prescription review queue."""

        prescriptions = await self.repository.list_for_review(tenant_id=str(self.subject.tenant_id))
        prescription_ids = [item.id for item in prescriptions]
        order_ids = [item.order_id for item in prescriptions if item.order_id]
        items = await self.repository.list_items(prescription_ids=prescription_ids)
        checks = await self.repository.list_checks(prescription_ids=prescription_ids)
        orders = await self.repository.list_orders(order_ids=order_ids)
        items_map: dict[str, list[PrescriptionMedicationResponse]] = {}
        for item in items:
            items_map.setdefault(item.prescription_id, []).append(
                PrescriptionMedicationResponse(
                    name=item.medication_name,
                    dose=item.dosage_instructions,
                    qty=item.prescribed_quantity_label,
                    match=bool(item.inventory_item_id or item.matches_requested_item),
                )
            )
        checks_map: dict[str, list[PrescriptionCheckResponse]] = {}
        for item in checks:
            checks_map.setdefault(item.prescription_id, []).append(
                PrescriptionCheckResponse(
                    key=item.check_key,
                    label=item.check_label,
                    passed=item.is_passed,
                    note=item.note,
                )
            )
        orders_map = {order.id: order for order in orders}
        return PrescriptionQueueResponse(
            items=[
                PrescriptionQueueItemResponse(
                    id=prescription.id,
                    order=orders_map[prescription.order_id].order_code if prescription.order_id and prescription.order_id in orders_map else "—",
                    patient=prescription.patient_name_snapshot,
                    age=prescription.patient_age_years,
                    doctor=prescription.doctor_name,
                    crm=prescription.doctor_license_number,
                    type=prescription.prescription_type,
                    issued=prescription.issued_on_label,
                    valid_days=prescription.remaining_validity_days,
                    sent_at=prescription.submitted_at_label,
                    status=prescription.status,
                    meds=items_map.get(prescription.id, []),
                    checks=checks_map.get(prescription.id, []),
                    pharmacist_notes=prescription.pharmacist_notes,
                    rejection_reason=prescription.rejection_reason,
                )
                for prescription in prescriptions
            ]
        )

    async def decide(self, prescription_id: str, payload: PrescriptionDecisionRequest) -> PrescriptionQueueItemResponse:
        """Persist a pharmacist prescription decision."""

        prescription = await self.repository.get_by_id(tenant_id=str(self.subject.tenant_id), prescription_id=prescription_id)
        if prescription is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found.")
        if payload.status == "rejected" and not payload.rejection_reason.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rejection reason is required.")
        prescription.status = payload.status
        prescription.pharmacist_notes = payload.pharmacist_notes
        prescription.rejection_reason = payload.rejection_reason if payload.status == "rejected" else ""
        await self.session.commit()
        queue = await self.list_review_queue()
        match = next((item for item in queue.items if item.id == prescription_id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Prescription payload unavailable after update.")
        return match

