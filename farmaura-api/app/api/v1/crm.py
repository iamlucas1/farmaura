"""
farmaura-api/app/api/v1/crm.py

CRM routes for Farmaura.

Responsibilities:
- expose tenant-scoped CRM customer projections;
- keep customer-relationship handlers explicit and typed;
- reserve write-side CRM logic for dedicated future routes;

Observations:
- CRM data is highly tenant-sensitive and always requires internal access;
- responses are shaped for the current pharmacist console experience;
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.crm import (
    CrmAddressCreateRequest,
    CrmAddressListResponse,
    CrmCustomerCreateRequest,
    CrmCustomerListResponse,
    CrmCustomerResponse,
    CrmPaymentMethodListResponse,
    CrmPurchaseInsightsResponse,
)
from app.services.crm_service import CrmService


# ============================================================================
# CRM ROUTES
# ============================================================================


router = APIRouter()


@router.get("/customers", response_model=CrmCustomerListResponse)
async def list_crm_customers(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmCustomerListResponse:
    """Return tenant-scoped CRM customers for the console."""

    service = CrmService(session=session, subject=subject)
    return await service.list_customers()


@router.post("/customers", response_model=CrmCustomerResponse)
async def create_crm_customer(
    payload: CrmCustomerCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmCustomerResponse:
    """Register one walk-in customer captured at the point of sale."""

    service = CrmService(session=session, subject=subject)
    response = await service.create_customer(payload)
    await session.commit()
    return response


@router.get("/customers/{customer_id}/payment-methods", response_model=CrmPaymentMethodListResponse)
async def list_crm_customer_payment_methods(
    customer_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmPaymentMethodListResponse:
    """Return one customer's saved payment methods, for choosing a card to charge a recurrence."""

    service = CrmService(session=session, subject=subject)
    return await service.list_payment_methods(customer_id)


@router.get("/customers/{customer_id}/addresses", response_model=CrmAddressListResponse)
async def list_crm_customer_addresses(
    customer_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmAddressListResponse:
    """Return one customer's saved addresses, for choosing or reusing a delivery address at the PDV."""

    service = CrmService(session=session, subject=subject)
    return await service.list_addresses(customer_id)


@router.post("/customers/{customer_id}/addresses", response_model=CrmAddressListResponse)
async def create_crm_customer_address(
    customer_id: str,
    payload: CrmAddressCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmAddressListResponse:
    """Persist a new saved address for one customer, captured at the point of sale."""

    service = CrmService(session=session, subject=subject)
    return await service.create_address(customer_id, payload)


@router.get("/customers/{customer_id}/purchase-insights", response_model=CrmPurchaseInsightsResponse)
async def get_crm_customer_purchase_insights(
    customer_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmPurchaseInsightsResponse:
    """Return real purchase-history top products and recurrence candidates for one customer."""

    service = CrmService(session=session, subject=subject)
    return await service.get_purchase_insights(customer_id)

