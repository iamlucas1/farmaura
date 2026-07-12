"""
farmaura-api/app/services/crm_service.py

CRM service for Farmaura.

Responsibilities:
- expose tenant-scoped CRM customer projections;
- normalize loyalty and behavior snapshots for the console;
- keep CRM reads independent from UI-specific global data stores;

Observations:
- customer denormalization is intentional for the current console surface;
- write-side CRM automation can extend this service later;
"""

from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.validators import is_valid_cpf, normalize_cpf
from app.models.customer import Customer
from app.repositories.crm_repository import CrmRepository
from app.schemas.auth import TokenSubject
from app.schemas.crm import (
    CrmCategoryMixResponse,
    CrmCustomerCreateRequest,
    CrmCustomerListResponse,
    CrmCustomerResponse,
    CrmTopProductResponse,
)


# ============================================================================
# CRM SERVICE
# ============================================================================


class CrmService:
    """Provide CRM customer read use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = CrmRepository(session)

    async def list_customers(self) -> CrmCustomerListResponse:
        """Return tenant-scoped CRM customers for the console."""

        customers = await self.repository.list_customers(tenant_id=str(self.subject.tenant_id))
        return CrmCustomerListResponse(items=[self._serialize_customer(customer) for customer in customers])

    async def create_customer(self, payload: CrmCustomerCreateRequest) -> CrmCustomerResponse:
        """Register one walk-in customer captured at the point of sale."""

        full_name = payload.full_name.strip()
        doc_digits = normalize_cpf(payload.doc)
        if not full_name and len(doc_digits) != 11:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o nome ou um CPF válido do cliente.")
        cpf: str | None = None
        if doc_digits:
            if not is_valid_cpf(doc_digits):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CPF inválido.")
            existing = await self.repository.get_by_cpf(tenant_id=str(self.subject.tenant_id), cpf=doc_digits)
            if existing is not None:
                return self._serialize_customer(existing)
            cpf = doc_digits
        customer = Customer(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            external_code="pdv-" + uuid4().hex[:8],
            full_name=full_name or ("Cliente " + doc_digits),
            email="",
            phone=payload.phone.strip(),
            cpf=cpf,
            member_since_label="Agora",
            loyalty_tier="Novo",
        )
        customer = await self.repository.add(customer)
        return self._serialize_customer(customer)

    def _serialize_customer(self, customer: object) -> CrmCustomerResponse:
        """Convert one customer ORM row into the CRM response shape."""

        avatar = self._build_avatar(customer.full_name, customer.avatar_url)
        top_products = [
            CrmTopProductResponse(name=str(item.get("name") or item.get("n") or "Produto"), quantity=int(item.get("quantity") or item.get("q") or 0))
            for item in list(customer.top_products_snapshot or [])
        ]
        category_mix = [
            CrmCategoryMixResponse(name=str(item.get("name") or item.get("n") or "Categoria"), value=int(item.get("value") or item.get("v") or 0))
            for item in list(customer.category_mix_snapshot or [])
        ]
        monthly = [int(value) for value in list(customer.monthly_orders_snapshot or [])]
        if len(monthly) < 12:
            monthly = monthly + [0] * (12 - len(monthly))
        return CrmCustomerResponse(
            id=customer.id,
            name=customer.full_name,
            email=customer.email,
            phone=customer.phone,
            doc=customer.cpf or '',
            avatar=avatar,
            tier=customer.loyalty_tier,
            recurring=customer.is_recurring,
            city=customer.city_label,
            district=customer.district_label,
            cashback=Decimal(customer.cashback_balance),
            orders=customer.orders_count,
            total_spent=Decimal(customer.total_spent),
            avg_ticket=Decimal(customer.average_ticket),
            last_days=customer.last_purchase_days_ago,
            freq_days=customer.purchase_frequency_days,
            since=customer.member_since_label,
            tenure_months=customer.tenure_months,
            subscriptions=[str(item) for item in list(customer.active_subscriptions or [])],
            favorites=[str(item) for item in list(customer.favorite_items or [])],
            top_products=top_products,
            interests=[str(item) for item in list(customer.interest_tags or [])],
            category_mix=category_mix,
            monthly=monthly[:12],
        )

    def _build_avatar(self, name: str, avatar_url: str) -> str:
        """Return the avatar shorthand expected by the current console UI."""

        if avatar_url.strip():
            return avatar_url.strip()
        parts = [part[:1].upper() for part in name.split() if part]
        return "".join(parts[:2]) or "CL"

