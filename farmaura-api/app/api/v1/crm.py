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
from app.schemas.crm import CrmCustomerCreateRequest, CrmCustomerListResponse, CrmCustomerResponse
from app.services.crm_service import CrmService


# ============================================================================
# CRM ROUTES
# ============================================================================


router = APIRouter()


@router.get("/customers", response_model=CrmCustomerListResponse)
async def list_crm_customers(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmCustomerListResponse:
    """Return tenant-scoped CRM customers for the console."""

    service = CrmService(session=session, subject=subject)
    return await service.list_customers()


@router.post("/customers", response_model=CrmCustomerResponse)
async def create_crm_customer(
    payload: CrmCustomerCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CrmCustomerResponse:
    """Register one walk-in customer captured at the point of sale."""

    service = CrmService(session=session, subject=subject)
    response = await service.create_customer(payload)
    await session.commit()
    return response

