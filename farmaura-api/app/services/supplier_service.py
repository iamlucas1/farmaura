"""
farmaura-api/app/services/supplier_service.py

Supplier service for Farmaura.

Responsibilities:
- execute supplier registration and maintenance use-cases;
- validate supplier payloads before they reach persistence;
- assemble internal console responses from repository models;

Observations:
- suppliers are tenant-scoped, since one supplier can serve every store in the tenant;
- suppliers are never hard-deleted, only deactivated, to preserve stock-lot history references;
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.auth import TokenSubject
from app.schemas.supplier import (
    SupplierCreateRequest,
    SupplierListResponse,
    SupplierResponse,
    SupplierStatusUpdateRequest,
    SupplierUpdateRequest,
)


# ============================================================================
# SUPPLIER SERVICE
# ============================================================================


class SupplierService:
    """Provide supplier use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = SupplierRepository(session)

    async def list_suppliers(self, *, query: str = "", active_only: bool = False) -> SupplierListResponse:
        """Return tenant suppliers."""

        suppliers = await self.repository.list_suppliers(
            tenant_id=str(self.subject.tenant_id),
            query=query,
            active_only=active_only,
        )
        return SupplierListResponse(items=[self._serialize(supplier) for supplier in suppliers])

    async def create_supplier(self, payload: SupplierCreateRequest) -> SupplierResponse:
        """Create a new supplier."""

        existing = await self.repository.get_by_cnpj(tenant_id=str(self.subject.tenant_id), cnpj=payload.cnpj)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Supplier CNPJ already registered.")
        supplier = Supplier(
            tenant_id=str(self.subject.tenant_id),
            legal_name=payload.legal_name,
            trade_name=payload.trade_name,
            cnpj=payload.cnpj,
            email=payload.email,
            phone=payload.phone,
            website=payload.website,
            category=payload.category,
            contact_person_name=payload.contact_person_name,
            uf=payload.uf.upper(),
            city=payload.city,
            address_line=payload.address_line,
            lead_time_days=payload.lead_time_days,
            minimum_order_amount=payload.minimum_order_amount,
            freight_policy=payload.freight_policy,
            payment_terms=payload.payment_terms,
            notes=payload.notes,
            is_active=True,
        )
        supplier = await self.repository.add_supplier(supplier)
        await self.session.commit()
        return self._serialize(supplier)

    async def update_supplier(self, supplier_id: str, payload: SupplierUpdateRequest) -> SupplierResponse:
        """Update an existing supplier."""

        supplier = await self._require_supplier(supplier_id)
        existing = await self.repository.get_by_cnpj(tenant_id=str(self.subject.tenant_id), cnpj=payload.cnpj)
        if existing is not None and existing.id != supplier.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Supplier CNPJ already registered.")
        supplier.legal_name = payload.legal_name
        supplier.trade_name = payload.trade_name
        supplier.cnpj = payload.cnpj
        supplier.email = payload.email
        supplier.phone = payload.phone
        supplier.website = payload.website
        supplier.category = payload.category
        supplier.contact_person_name = payload.contact_person_name
        supplier.uf = payload.uf.upper()
        supplier.city = payload.city
        supplier.address_line = payload.address_line
        supplier.lead_time_days = payload.lead_time_days
        supplier.minimum_order_amount = payload.minimum_order_amount
        supplier.freight_policy = payload.freight_policy
        supplier.payment_terms = payload.payment_terms
        supplier.notes = payload.notes
        await self.session.commit()
        await self.session.refresh(supplier)
        return self._serialize(supplier)

    async def update_supplier_status(self, supplier_id: str, payload: SupplierStatusUpdateRequest) -> SupplierResponse:
        """Activate or deactivate a supplier."""

        supplier = await self._require_supplier(supplier_id)
        supplier.is_active = payload.is_active
        await self.session.commit()
        await self.session.refresh(supplier)
        return self._serialize(supplier)

    async def _require_supplier(self, supplier_id: str) -> Supplier:
        """Return an existing supplier or fail with not found."""

        supplier = await self.repository.get_by_id(tenant_id=str(self.subject.tenant_id), supplier_id=supplier_id)
        if supplier is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found.")
        return supplier

    def _serialize(self, supplier: Supplier) -> SupplierResponse:
        """Serialize a supplier for API responses."""

        return SupplierResponse(
            id=supplier.id,
            legal_name=supplier.legal_name,
            trade_name=supplier.trade_name,
            cnpj=supplier.cnpj,
            email=supplier.email,
            phone=supplier.phone,
            website=supplier.website,
            category=supplier.category,
            contact_person_name=supplier.contact_person_name,
            uf=supplier.uf,
            city=supplier.city,
            address_line=supplier.address_line,
            lead_time_days=supplier.lead_time_days,
            minimum_order_amount=supplier.minimum_order_amount,
            freight_policy=supplier.freight_policy,
            payment_terms=supplier.payment_terms,
            notes=supplier.notes,
            is_active=supplier.is_active,
            created_at=supplier.created_at,
            updated_at=supplier.updated_at,
        )
