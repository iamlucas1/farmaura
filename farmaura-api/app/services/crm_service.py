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

from app.domain.validators import is_valid_cpf, is_valid_email, normalize_cpf
from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.repositories.crm_repository import CrmRepository
from app.repositories.customer_address_repository import CustomerAddressRepository
from app.repositories.customer_payment_method_repository import CustomerPaymentMethodRepository
from app.schemas.auth import TokenSubject
from app.schemas.crm import (
    CrmAddressCreateRequest,
    CrmAddressListResponse,
    CrmAddressResponse,
    CrmCategoryMixResponse,
    CrmCustomerCreateRequest,
    CrmCustomerListResponse,
    CrmCustomerResponse,
    CrmPaymentMethodListResponse,
    CrmPaymentMethodResponse,
    CrmPurchaseInsightsResponse,
    CrmRecurrenceCandidateResponse,
    CrmTopProductInsightResponse,
    CrmTopProductResponse,
)
from app.services.purchase_history_service import PurchaseHistoryService


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

    async def list_payment_methods(self, customer_id: str) -> CrmPaymentMethodListResponse:
        """Return one customer's saved payment methods for the internal console."""

        methods = await CustomerPaymentMethodRepository(self.session).list_for_customer(customer_id=customer_id)
        return CrmPaymentMethodListResponse(
            items=[
                CrmPaymentMethodResponse(
                    id=method.id,
                    brand_name=method.brand_name,
                    last_four_digits=method.last_four_digits,
                    holder_name=method.holder_name,
                    is_primary=method.is_primary,
                )
                for method in methods
            ]
        )

    async def list_addresses(self, customer_id: str) -> CrmAddressListResponse:
        """Return one customer's saved addresses for the internal console, for delivery at the PDV."""

        addresses = await CustomerAddressRepository(self.session).list_for_customer(customer_id=customer_id)
        return CrmAddressListResponse(items=[self._serialize_address(address) for address in addresses])

    async def create_address(self, customer_id: str, payload: CrmAddressCreateRequest) -> CrmAddressListResponse:
        """Persist one new saved address captured at the point of sale, and return the updated list."""

        address_repository = CustomerAddressRepository(self.session)
        if payload.is_primary:
            await address_repository.clear_primary(customer_id=customer_id)
        address = CustomerAddress(
            id=str(uuid4()),
            customer_id=customer_id,
            label=payload.label.strip() or "Casa",
            postal_code=payload.postal_code.strip(),
            street_line=payload.street_line.strip(),
            district=payload.district.strip(),
            city=payload.city.strip(),
            state_code=payload.state_code.strip().upper(),
            complement=payload.complement.strip(),
            reference_note=payload.reference_note.strip(),
            recipient_name=payload.recipient_name.strip(),
            recipient_phone=payload.recipient_phone.strip(),
            is_primary=payload.is_primary,
        )
        await address_repository.add(address)
        await self.session.commit()
        return await self.list_addresses(customer_id)

    def _serialize_address(self, address: CustomerAddress) -> CrmAddressResponse:
        """Shape one CustomerAddress row for the internal console."""

        return CrmAddressResponse(
            id=address.id,
            label=address.label,
            postal_code=address.postal_code,
            street_line=address.street_line,
            district=address.district,
            city=address.city,
            state_code=address.state_code,
            complement=address.complement,
            reference_note=address.reference_note,
            recipient_name=address.recipient_name,
            recipient_phone=address.recipient_phone,
            is_primary=address.is_primary,
        )

    async def get_purchase_insights(self, customer_id: str) -> CrmPurchaseInsightsResponse:
        """Return real purchase-history-driven top products and recurrence candidates for one customer."""

        summary = await PurchaseHistoryService(self.session).get_customer_purchase_summary(
            tenant_id=str(self.subject.tenant_id),
            customer_id=customer_id,
        )
        return CrmPurchaseInsightsResponse(
            top_products=[
                CrmTopProductInsightResponse(
                    product_key=entry.product_key,
                    name=entry.name,
                    brand=entry.brand,
                    total_quantity=entry.total_quantity,
                    last_price=entry.last_price,
                )
                for entry in summary.top_products
            ],
            recurrence_candidates=[
                CrmRecurrenceCandidateResponse(
                    product_key=entry.product_key,
                    name=entry.name,
                    brand=entry.brand,
                    consecutive_months=entry.consecutive_months,
                    last_purchased_month=entry.last_purchased_month,
                    avg_quantity=entry.avg_quantity,
                    last_unit_price=entry.last_unit_price,
                    suggested_discount_percent=entry.suggested_discount_percent,
                )
                for entry in summary.recurrence_candidates
            ],
        )

    async def create_customer(self, payload: CrmCustomerCreateRequest) -> CrmCustomerResponse:
        """Register one walk-in customer captured at the point of sale."""

        full_name = payload.full_name.strip()
        doc_digits = normalize_cpf(payload.doc)
        if not full_name and len(doc_digits) != 11:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o nome ou um CPF válido do cliente.")
        email = payload.email.strip().lower()
        if email and not is_valid_email(email):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="E-mail inválido.")
        cpf: str | None = None
        if doc_digits:
            if not is_valid_cpf(doc_digits):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CPF inválido.")
            existing = await self.repository.get_by_cpf(tenant_id=str(self.subject.tenant_id), cpf=doc_digits)
            if existing is not None:
                return self._serialize_customer(existing)
            cpf = doc_digits
        if email:
            existing = await self.repository.get_by_email(tenant_id=str(self.subject.tenant_id), email=email)
            if existing is not None:
                return self._serialize_customer(existing)
        customer = Customer(
            id=str(uuid4()),
            tenant_id=str(self.subject.tenant_id),
            external_code="pdv-" + uuid4().hex[:8],
            full_name=full_name or ("Cliente " + doc_digits),
            email=email,
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
            birth_date=customer.birth_date,
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

