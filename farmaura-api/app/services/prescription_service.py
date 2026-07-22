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

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import OrderStatus
from app.models.prescription import Prescription
from app.models.prescription_item import PrescriptionItem
from app.repositories.cashback_repository import CashbackRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.prescription_repository import PrescriptionRepository
from app.schemas.auth import TokenSubject
from app.schemas.pdv import (
    PdvPrescriptionCartStatusResponse,
    PdvPrescriptionCreateRequest,
    PdvPrescriptionResponse,
    PdvPrescriptionStatusResponse,
)
from app.schemas.prescriptions import (
    PrescriptionCheckResponse,
    PrescriptionDecisionRequest,
    PrescriptionMedicationResponse,
    PrescriptionQueueItemResponse,
    PrescriptionQueueResponse,
)
from app.services.chat_service import ChatService
from app.services.inventory_stock_sync import restock_marketplace_order

RETENTION_REQUIRED_CATEGORIES = {"prescription_retention", "special_control", "black_stripe"}


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
        self.inventory_repository = InventoryRepository(session)
        self.cashback_repository = CashbackRepository(session)
        self.order_repository = OrderRepository(session)

    async def create_from_pdv(self, payload: PdvPrescriptionCreateRequest) -> PdvPrescriptionResponse:
        """Record a PDV prescription validation — an immediate physical decision, or a pending digital request."""

        item = await self.inventory_repository.get_item_by_id(tenant_id=str(self.subject.tenant_id), item_id=payload.inventory_item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found.")
        if not payload.customer_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Identifique o cliente antes de validar a receita.")
        customer = await self.cashback_repository.get_customer_by_id(tenant_id=str(self.subject.tenant_id), customer_id=payload.customer_id)
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
        requires_retention = item.controlled_category in RETENTION_REQUIRED_CATEGORIES
        if payload.delivery_method == "physical":
            if payload.decision is None:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe a decisão (validar ou recusar) da receita física.")
            if payload.decision == "rejected" and not payload.rejection_reason.strip():
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rejection reason is required.")
            status_value = payload.decision
            reviewed_by_user_id = str(self.subject.user_id)
            reviewed_at_label = "agora"
        else:
            if not payload.digital_reference_url.strip():
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o link da receita digital.")
            status_value = "pending"
            reviewed_by_user_id = None
            reviewed_at_label = ""
        prescription = Prescription(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer.id,
            order_id=None,
            pdv_order_id=None,
            reviewed_by_user_id=reviewed_by_user_id,
            prescription_code="RX-" + uuid4().hex[:6].upper(),
            source_channel="pdv",
            delivery_method=payload.delivery_method,
            digital_reference_url=payload.digital_reference_url if payload.delivery_method == "digital" else "",
            status=status_value,
            patient_name_snapshot=customer.full_name,
            patient_document_snapshot=customer.cpf,
            patient_age_years=None,
            patient_phone_snapshot=customer.phone,
            doctor_name="",
            doctor_license_number="",
            prescription_type="Receita física conferida no balcão" if payload.delivery_method == "physical" else "Receita digital enviada no balcão",
            issued_on_label="",
            remaining_validity_days=None,
            submitted_at_label="agora",
            reviewed_at_label=reviewed_at_label,
            pharmacist_notes=payload.pharmacist_notes,
            rejection_reason=payload.rejection_reason if status_value == "rejected" else "",
            has_controlled_medication=True,
            requires_retention=requires_retention,
        )
        await self.repository.add(prescription)
        await self.repository.add_item(
            PrescriptionItem(
                id=str(uuid4()),
                prescription_id=prescription.id,
                order_item_id=None,
                inventory_item_id=item.id,
                marketplace_listing_id=None,
                medication_name=payload.medication_name or item.name,
                dosage_instructions="Conforme orientação médica.",
                prescribed_quantity_label="",
                matches_requested_item=True,
                pharmacist_note="",
            )
        )
        if payload.delivery_method == "digital":
            chat_service = ChatService(self.session, self.subject)
            thread = await chat_service.ensure_thread_for_customer(customer_id=customer.id, topic="Validação de receita")
            await chat_service.post_prescription_request_message(
                thread_id=thread.id,
                prescription_id=prescription.id,
                text="Receita digital enviada para validação: " + payload.digital_reference_url,
            )
        await self.session.commit()
        return PdvPrescriptionResponse(
            id=prescription.id,
            inventory_item_id=item.id,
            status=prescription.status,
            delivery_method=prescription.delivery_method,
            digital_reference_url=prescription.digital_reference_url,
            requires_retention=prescription.requires_retention,
        )

    async def get_status_for_cart(self, customer_id: str | None, inventory_item_ids: list[str]) -> PdvPrescriptionStatusResponse:
        """Return the current PDV prescription validation state for every requested cart line."""

        if not customer_id or not inventory_item_ids:
            return PdvPrescriptionStatusResponse(
                items=[PdvPrescriptionCartStatusResponse(inventory_item_id=item_id) for item_id in inventory_item_ids]
            )
        latest = await self.repository.get_latest_for_items(
            tenant_id=str(self.subject.tenant_id), customer_id=customer_id, inventory_item_ids=inventory_item_ids, source_channel="pdv",
        )
        return PdvPrescriptionStatusResponse(
            items=[
                PdvPrescriptionCartStatusResponse(
                    inventory_item_id=item_id,
                    prescription_id=latest[item_id].id if item_id in latest else None,
                    status=latest[item_id].status if item_id in latest else "missing",
                    delivery_method=latest[item_id].delivery_method if item_id in latest else "",
                )
                for item_id in inventory_item_ids
            ]
        )

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
        if prescription.order_id and payload.status in {"approved", "rejected"}:
            await self._apply_decision_to_order(prescription.order_id, payload)
        await self.session.commit()
        queue = await self.list_review_queue()
        match = next((item for item in queue.items if item.id == prescription_id), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Prescription payload unavailable after update.")
        return match

    async def _apply_decision_to_order(self, order_id: str, payload: PrescriptionDecisionRequest) -> None:
        """Propagate an approve/reject decision to the marketplace order it gates.

        Approving just clears the hold so the pharmacist board can advance the order.
        Rejecting cancels the order outright (confirmed product decision) and credits
        back every unit of stock the checkout reserved, since a rejected prescription
        means the order will never ship.
        """

        order = await self.order_repository.get_by_id(tenant_id=str(self.subject.tenant_id), order_id=order_id)
        if order is None:
            return
        order.prescription_status = payload.status
        if payload.status == "rejected":
            order.status = OrderStatus.CANCELLED.value
            order.completed_at_label = "Cancelado"
            order.internal_note = (order.internal_note + "\n" if order.internal_note else "") + (
                "Receita rejeitada: " + payload.rejection_reason
            )
            await restock_marketplace_order(
                self.session,
                tenant_id=str(self.subject.tenant_id),
                order_code=order.order_code,
                reason="Pedido cancelado - receita rejeitada",
            )

