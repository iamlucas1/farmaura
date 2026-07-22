"""
farmaura-api/app/api/v1/customers.py

Customer routes for Farmaura.

Responsibilities:
- expose authenticated customer profile access;
- keep customer handlers thin and typed;
- enforce backend-derived identity for self data;

Observations:
- ownership is derived from the authenticated subject;
- richer customer endpoints can expand from this baseline;
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_marketplace_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.customers import (
    CardTokenizeRequest,
    CartItemResponse,
    CartItemUpsertRequest,
    CustomerAddressResponse,
    CustomerAddressUpsertRequest,
    CustomerAvatarUpdateRequest,
    CustomerPaymentMethodCreateRequest,
    CustomerPaymentMethodResponse,
    CustomerPaymentMethodUpdateRequest,
    CustomerProfileResponse,
    CustomerProfileUpdateRequest,
    ProductAvailabilityAlertCreateRequest,
    ProductAvailabilityAlertResponse,
)
from app.services.customer_service import CustomerService


# ============================================================================
# CUSTOMER ROUTES
# ============================================================================


router = APIRouter()


@router.get("/me", response_model=CustomerProfileResponse)
async def get_customer_profile(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CustomerProfileResponse:
    """Return the authenticated customer profile."""

    service = CustomerService(session)
    return await service.get_profile(subject)


@router.put("/me/avatar", response_model=CustomerProfileResponse)
async def update_customer_avatar(
    payload: CustomerAvatarUpdateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CustomerProfileResponse:
    """Persist the authenticated customer profile avatar."""

    service = CustomerService(session)
    return await service.update_avatar(subject, payload)


@router.put("/me/profile", response_model=CustomerProfileResponse)
async def update_customer_profile(
    payload: CustomerProfileUpdateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> CustomerProfileResponse:
    """Persist the authenticated customer's real personal and document data."""

    service = CustomerService(session)
    return await service.update_profile(subject, payload)


# ----------------------------------------------------------------------------
# Addresses
# ----------------------------------------------------------------------------


@router.get("/me/addresses", response_model=list[CustomerAddressResponse])
async def list_customer_addresses(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerAddressResponse]:
    """Return every saved address for the authenticated customer."""

    service = CustomerService(session)
    return await service.list_addresses(subject)


@router.post("/me/addresses", response_model=list[CustomerAddressResponse])
async def create_customer_address(
    payload: CustomerAddressUpsertRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerAddressResponse]:
    """Persist one new address for the authenticated customer."""

    service = CustomerService(session)
    return await service.create_address(subject, payload)


@router.put("/me/addresses/{address_id}", response_model=list[CustomerAddressResponse])
async def update_customer_address(
    address_id: str,
    payload: CustomerAddressUpsertRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerAddressResponse]:
    """Persist changes to one existing address owned by the authenticated customer."""

    service = CustomerService(session)
    return await service.update_address(subject, address_id, payload)


@router.delete("/me/addresses/{address_id}", response_model=list[CustomerAddressResponse])
async def delete_customer_address(
    address_id: str,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerAddressResponse]:
    """Delete one address owned by the authenticated customer."""

    service = CustomerService(session)
    return await service.delete_address(subject, address_id)


# ----------------------------------------------------------------------------
# Payment methods
# ----------------------------------------------------------------------------


@router.get("/me/payment-methods", response_model=list[CustomerPaymentMethodResponse])
async def list_customer_payment_methods(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerPaymentMethodResponse]:
    """Return every saved payment method for the authenticated customer."""

    service = CustomerService(session)
    return await service.list_payment_methods(subject)


@router.post("/me/payment-methods", response_model=list[CustomerPaymentMethodResponse])
async def create_customer_payment_method(
    payload: CustomerPaymentMethodCreateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerPaymentMethodResponse]:
    """Persist one new tokenized payment method for the authenticated customer."""

    service = CustomerService(session)
    return await service.create_payment_method(subject, payload)


@router.post("/me/payment-methods/tokenize-card", response_model=list[CustomerPaymentMethodResponse])
async def tokenize_customer_card(
    payload: CardTokenizeRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerPaymentMethodResponse]:
    """Tokenize one raw card via the payment provider and persist only the resulting token."""

    service = CustomerService(session)
    return await service.tokenize_and_save_card(subject, payload)


@router.patch("/me/payment-methods/{payment_method_id}", response_model=list[CustomerPaymentMethodResponse])
async def update_customer_payment_method(
    payment_method_id: str,
    payload: CustomerPaymentMethodUpdateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerPaymentMethodResponse]:
    """Update the primary flag for one payment method owned by the authenticated customer."""

    service = CustomerService(session)
    return await service.update_payment_method(subject, payment_method_id, payload)


@router.delete("/me/payment-methods/{payment_method_id}", response_model=list[CustomerPaymentMethodResponse])
async def delete_customer_payment_method(
    payment_method_id: str,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CustomerPaymentMethodResponse]:
    """Delete one payment method owned by the authenticated customer."""

    service = CustomerService(session)
    return await service.delete_payment_method(subject, payment_method_id)


# ----------------------------------------------------------------------------
# Cart
# ----------------------------------------------------------------------------


@router.get("/me/cart", response_model=list[CartItemResponse])
async def list_customer_cart(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CartItemResponse]:
    """Return every persisted cart line for the authenticated customer."""

    service = CustomerService(session)
    return await service.list_cart(subject)


@router.put("/me/cart/{product_ref}", response_model=list[CartItemResponse])
async def upsert_customer_cart_item(
    product_ref: str,
    payload: CartItemUpsertRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CartItemResponse]:
    """Create or update one cart line for the authenticated customer."""

    service = CustomerService(session)
    return await service.upsert_cart_item(subject, product_ref, payload)


@router.delete("/me/cart/{product_ref}", response_model=list[CartItemResponse])
async def delete_customer_cart_item(
    product_ref: str,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CartItemResponse]:
    """Remove one cart line for the authenticated customer."""

    service = CustomerService(session)
    return await service.delete_cart_item(subject, product_ref)


@router.delete("/me/cart", response_model=list[CartItemResponse])
async def clear_customer_cart(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[CartItemResponse]:
    """Remove every cart line for the authenticated customer."""

    service = CustomerService(session)
    return await service.clear_cart(subject)


# ----------------------------------------------------------------------------
# Product availability alerts
# ----------------------------------------------------------------------------


@router.get("/me/availability-alerts", response_model=list[ProductAvailabilityAlertResponse])
async def list_customer_availability_alerts(
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[ProductAvailabilityAlertResponse]:
    """Return every back-in-stock alert requested by the authenticated customer."""

    service = CustomerService(session)
    return await service.list_availability_alerts(subject)


@router.put("/me/availability-alerts/{product_ref}", response_model=list[ProductAvailabilityAlertResponse])
async def create_customer_availability_alert(
    product_ref: str,
    payload: ProductAvailabilityAlertCreateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[ProductAvailabilityAlertResponse]:
    """Register one back-in-stock alert for the authenticated customer."""

    service = CustomerService(session)
    return await service.create_availability_alert(subject, product_ref, payload)


@router.delete("/me/availability-alerts/{product_ref}", response_model=list[ProductAvailabilityAlertResponse])
async def delete_customer_availability_alert(
    product_ref: str,
    subject: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
    session: AsyncSession = Depends(get_subject_session),
) -> list[ProductAvailabilityAlertResponse]:
    """Remove one back-in-stock alert for the authenticated customer."""

    service = CustomerService(session)
    return await service.delete_availability_alert(subject, product_ref)
