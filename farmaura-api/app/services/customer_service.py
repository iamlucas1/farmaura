"""
farmaura-api/app/services/customer_service.py

Customer service for Farmaura.

Responsibilities:
- expose customer profile baseline flows;
- keep customer domain logic centralized;
- prepare tenant-aware customer use-cases;

Observations:
- customer profile reads are resolved from the authenticated user and tenant;
- avatar persistence remains customer-scoped and does not mutate auth tokens.
"""

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

import asyncio
import re

from app.core.tenant_context import apply_tenant_context
from app.domain.validators import is_valid_cpf, normalize_cpf
from app.models.cart_item import CartItem
from app.models.customer_address import CustomerAddress
from app.models.customer_payment_method import CustomerPaymentMethod
from app.models.product_availability_alert import ProductAvailabilityAlert
from app.repositories.cart_repository import CartRepository
from app.repositories.customer_address_repository import CustomerAddressRepository
from app.repositories.customer_payment_method_repository import CustomerPaymentMethodRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_availability_alert_repository import ProductAvailabilityAlertRepository
from app.repositories.user_repository import UserRepository
from app.services.asaas_client import AsaasClient, AsaasError
from app.services.marketplace_projection import build_marketplace_catalog_groups
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


# ============================================================================
# CUSTOMER SERVICE
# ============================================================================


class CustomerService:
    """Provide customer-facing profile use-cases."""

    def __init__(self, session: AsyncSession) -> None:
        """Store service dependencies."""

        self.session = session
        self.customer_repository = CustomerRepository(session)
        self.user_repository = UserRepository(session)
        self.address_repository = CustomerAddressRepository(session)
        self.payment_method_repository = CustomerPaymentMethodRepository(session)
        self.cart_repository = CartRepository(session)
        self.inventory_repository = InventoryRepository(session)
        self.availability_alert_repository = ProductAvailabilityAlertRepository(session)

    async def get_profile(self, subject: TokenSubject) -> CustomerProfileResponse:
        """Return a subject-derived customer profile."""

        user = await self._get_subject_user(subject)
        customer = await self.customer_repository.get_by_email(tenant_id=str(subject.tenant_id), email=user.email)
        return self._build_profile_response(subject=subject, user=user, customer=customer)

    async def update_avatar(self, subject: TokenSubject, payload: CustomerAvatarUpdateRequest) -> CustomerProfileResponse:
        """Persist the authenticated customer avatar."""

        user = await self._get_subject_user(subject)
        customer = await self.customer_repository.get_by_email(tenant_id=str(subject.tenant_id), email=user.email)
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer profile was not found.")
        customer.avatar_url = payload.avatar_url.strip()
        await self.customer_repository.save(customer)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        await self.session.refresh(customer)
        return self._build_profile_response(subject=subject, user=user, customer=customer)

    async def update_profile(self, subject: TokenSubject, payload: CustomerProfileUpdateRequest) -> CustomerProfileResponse:
        """Persist the authenticated customer's real personal and document data."""

        user = await self._get_subject_user(subject)
        cpf = normalize_cpf(payload.cpf)
        if not is_valid_cpf(cpf):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CPF inválido.")
        customer = await self.customer_repository.get_or_create(
            tenant_id=str(subject.tenant_id),
            user_id=str(subject.user_id),
            email=user.email,
            full_name=payload.full_name,
        )
        existing_with_cpf = await self.customer_repository.get_by_cpf(tenant_id=str(subject.tenant_id), cpf=cpf)
        if existing_with_cpf is not None and existing_with_cpf.id != customer.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este CPF já está cadastrado para outro cliente.")
        customer.full_name = payload.full_name.strip()
        customer.cpf = cpf
        customer.phone = payload.phone.strip()
        customer.birth_date = payload.birth_date.strip()
        customer.gender = payload.gender.strip()
        customer.marital_status = payload.marital_status.strip()
        customer.children_count = payload.children_count
        await self.customer_repository.save(customer)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        await self.session.refresh(customer)
        return self._build_profile_response(subject=subject, user=user, customer=customer)

    # ------------------------------------------------------------------------
    # Addresses
    # ------------------------------------------------------------------------

    async def list_addresses(self, subject: TokenSubject) -> list[CustomerAddressResponse]:
        """Return every saved address for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        addresses = await self.address_repository.list_for_customer(customer_id=customer.id)
        return [self._build_address_response(address) for address in addresses]

    async def create_address(self, subject: TokenSubject, payload: CustomerAddressUpsertRequest) -> list[CustomerAddressResponse]:
        """Persist one new address for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        if payload.is_primary:
            await self.address_repository.clear_primary(customer_id=customer.id)
        address = CustomerAddress(
            id=str(uuid4()),
            customer_id=customer.id,
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
        await self.address_repository.add(address)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_addresses(subject)

    async def update_address(
        self, subject: TokenSubject, address_id: str, payload: CustomerAddressUpsertRequest,
    ) -> list[CustomerAddressResponse]:
        """Persist changes to one existing address owned by the authenticated customer."""

        customer = await self._resolve_customer(subject)
        address = await self.address_repository.get_for_customer(customer_id=customer.id, address_id=address_id)
        if address is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endereço não encontrado.")
        if payload.is_primary and not address.is_primary:
            await self.address_repository.clear_primary(customer_id=customer.id)
        address.label = payload.label.strip() or "Casa"
        address.postal_code = payload.postal_code.strip()
        address.street_line = payload.street_line.strip()
        address.district = payload.district.strip()
        address.city = payload.city.strip()
        address.state_code = payload.state_code.strip().upper()
        address.complement = payload.complement.strip()
        address.reference_note = payload.reference_note.strip()
        address.recipient_name = payload.recipient_name.strip()
        address.recipient_phone = payload.recipient_phone.strip()
        address.is_primary = payload.is_primary
        await self.address_repository.save(address)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_addresses(subject)

    async def delete_address(self, subject: TokenSubject, address_id: str) -> list[CustomerAddressResponse]:
        """Delete one address owned by the authenticated customer."""

        customer = await self._resolve_customer(subject)
        address = await self.address_repository.get_for_customer(customer_id=customer.id, address_id=address_id)
        if address is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endereço não encontrado.")
        await self.address_repository.delete(address)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_addresses(subject)

    # ------------------------------------------------------------------------
    # Payment methods
    # ------------------------------------------------------------------------

    async def list_payment_methods(self, subject: TokenSubject) -> list[CustomerPaymentMethodResponse]:
        """Return every saved payment method for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        methods = await self.payment_method_repository.list_for_customer(customer_id=customer.id)
        return [self._build_payment_method_response(method) for method in methods]

    async def create_payment_method(
        self, subject: TokenSubject, payload: CustomerPaymentMethodCreateRequest,
    ) -> list[CustomerPaymentMethodResponse]:
        """Persist one new tokenized payment method for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        if payload.is_primary:
            await self.payment_method_repository.clear_primary(customer_id=customer.id)
        method = CustomerPaymentMethod(
            id=str(uuid4()),
            customer_id=customer.id,
            provider_name=payload.provider_name.strip(),
            provider_token=payload.provider_token.strip(),
            brand_name=payload.brand_name.strip() or "Cartão",
            last_four_digits=payload.last_four_digits,
            holder_name=payload.holder_name.strip(),
            expiration_month=payload.expiration_month,
            expiration_year=payload.expiration_year,
            is_primary=payload.is_primary,
        )
        await self.payment_method_repository.add(method)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_payment_methods(subject)

    async def update_payment_method(
        self, subject: TokenSubject, payment_method_id: str, payload: CustomerPaymentMethodUpdateRequest,
    ) -> list[CustomerPaymentMethodResponse]:
        """Update the primary flag for one payment method owned by the authenticated customer."""

        customer = await self._resolve_customer(subject)
        method = await self.payment_method_repository.get_for_customer(
            customer_id=customer.id, payment_method_id=payment_method_id,
        )
        if method is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão não encontrado.")
        if payload.is_primary:
            await self.payment_method_repository.clear_primary(customer_id=customer.id)
        method.is_primary = payload.is_primary
        await self.payment_method_repository.save(method)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_payment_methods(subject)

    async def tokenize_and_save_card(
        self, subject: TokenSubject, payload: CardTokenizeRequest,
    ) -> list[CustomerPaymentMethodResponse]:
        """Tokenize one raw card via Asaas and persist only the resulting token metadata.

        Raw card fields live only in this method's local scope; they are handed to
        the Asaas client for the single tokenization call and discarded afterward.
        """

        customer = await self._resolve_customer(subject)
        if not is_valid_cpf(customer.cpf or ""):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe um CPF válido em Minha Conta antes de salvar um cartão.",
            )
        addresses = await self.address_repository.list_for_customer(customer_id=customer.id)
        primary_address = next((address for address in addresses if address.is_primary), addresses[0] if addresses else None)
        if primary_address is None or not primary_address.postal_code:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cadastre um endereço em Meus Endereços antes de salvar um cartão.",
            )
        asaas_client = AsaasClient()
        try:
            asaas_client.assert_configured()
        except AsaasError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error
        provider_customer_id = customer.payment_provider_customer_id
        if not provider_customer_id:
            try:
                remote_customer = await asyncio.to_thread(
                    asaas_client.upsert_customer,
                    {
                        "name": customer.full_name,
                        "email": customer.email,
                        "cpfCnpj": normalize_cpf(customer.cpf or ""),
                        "phone": customer.phone,
                        "externalReference": customer.id,
                    },
                )
            except AsaasError as error:
                raise HTTPException(status_code=error.status_code, detail=error.message) from error
            provider_customer_id = str(remote_customer.get("id") or "")
            if not provider_customer_id:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="O Asaas não retornou um cliente válido.")
            customer.payment_provider_customer_id = provider_customer_id
            await self.customer_repository.save(customer)
        address_number = self._extract_address_number(primary_address.street_line)
        wants_primary = payload.is_primary
        try:
            tokenized = await asyncio.to_thread(
                asaas_client.tokenize_credit_card,
                {
                    "customer": provider_customer_id,
                    "creditCard": {
                        "holderName": payload.holder_name.strip(),
                        "number": payload.number,
                        "expiryMonth": payload.expiration_month,
                        "expiryYear": payload.expiration_year,
                        "ccv": payload.cvv,
                    },
                    "creditCardHolderInfo": {
                        "name": customer.full_name,
                        "email": customer.email,
                        "cpfCnpj": normalize_cpf(customer.cpf or ""),
                        "postalCode": re.sub(r"\D", "", primary_address.postal_code),
                        "addressNumber": address_number,
                        "phone": customer.phone,
                    },
                },
            )
        except AsaasError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error
        # `payload` (raw card number/CVV) is not referenced again past this point.
        provider_token = str(tokenized.get("creditCardToken") or "")
        if not provider_token:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="O Asaas não retornou um token de cartão válido.")
        create_request = CustomerPaymentMethodCreateRequest(
            provider_name="asaas",
            provider_token=provider_token,
            brand_name=str(tokenized.get("creditCardBrand") or "Cartão"),
            last_four_digits=str(tokenized.get("creditCardNumber") or "0000")[-4:],
            holder_name=str(tokenized.get("creditCardHolderName") or ""),
            expiration_month=str(tokenized.get("creditCardExpiryMonth") or ""),
            expiration_year=str(tokenized.get("creditCardExpiryYear") or ""),
            is_primary=wants_primary,
        )
        return await self.create_payment_method(subject, create_request)

    def _extract_address_number(self, street_line: str) -> str:
        """Return the best-effort street number extracted from a combined address line."""

        match = re.search(r"(\d+)\s*$", street_line or "")
        return match.group(1) if match else "S/N"

    async def delete_payment_method(self, subject: TokenSubject, payment_method_id: str) -> list[CustomerPaymentMethodResponse]:
        """Delete one payment method owned by the authenticated customer."""

        customer = await self._resolve_customer(subject)
        method = await self.payment_method_repository.get_for_customer(
            customer_id=customer.id, payment_method_id=payment_method_id,
        )
        if method is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão não encontrado.")
        await self.payment_method_repository.delete(method)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_payment_methods(subject)

    # ------------------------------------------------------------------------
    # Cart
    # ------------------------------------------------------------------------

    async def list_cart(self, subject: TokenSubject) -> list[CartItemResponse]:
        """Return every persisted cart line for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        items = await self.cart_repository.list_for_customer(customer_id=customer.id)
        return [self._build_cart_item_response(item) for item in items]

    async def upsert_cart_item(
        self, subject: TokenSubject, product_ref: str, payload: CartItemUpsertRequest,
    ) -> list[CartItemResponse]:
        """Create or update one cart line for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        await self._require_marketplace_product(subject, product_ref)
        existing = await self.cart_repository.get_for_customer(customer_id=customer.id, product_ref=product_ref)
        if existing is not None:
            existing.quantity = payload.quantity
            existing.is_subscription = payload.is_subscription
            await self.cart_repository.save(existing)
        else:
            item = CartItem(
                id=str(uuid4()),
                tenant_id=customer.tenant_id,
                customer_id=customer.id,
                product_ref=product_ref,
                quantity=payload.quantity,
                is_subscription=payload.is_subscription,
            )
            await self.cart_repository.add(item)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_cart(subject)

    async def delete_cart_item(self, subject: TokenSubject, product_ref: str) -> list[CartItemResponse]:
        """Remove one cart line for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        existing = await self.cart_repository.get_for_customer(customer_id=customer.id, product_ref=product_ref)
        if existing is not None:
            await self.cart_repository.delete(existing)
            await self.session.commit()
            await apply_tenant_context(self.session, subject)
        return await self.list_cart(subject)

    async def clear_cart(self, subject: TokenSubject) -> list[CartItemResponse]:
        """Remove every cart line for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        await self.cart_repository.clear_for_customer(customer_id=customer.id)
        await self.session.commit()
        return []

    # ------------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------------

    async def _resolve_customer(self, subject: TokenSubject):
        """Return the customer aggregate tied to the authenticated subject, provisioning one when absent."""

        user = await self._get_subject_user(subject)
        return await self.customer_repository.get_or_create(
            tenant_id=str(subject.tenant_id),
            user_id=str(subject.user_id),
            email=user.email,
            full_name=user.full_name,
        )

    async def _require_marketplace_product(self, subject: TokenSubject, product_ref: str) -> None:
        """Validate that one grouped marketplace product is currently in stock and purchasable.

        Applies the same price filter and stock computation the customer-facing catalog
        uses (unlike a plain existence check) — a product hidden from the precificador
        contributes zero purchasable stock in build_marketplace_catalog_groups, so it can
        never be added to the cart even from a stale cached catalog snapshot on the client,
        without needing a separate visibility check here: the stock check below already
        catches it the same way it catches a genuinely out-of-stock product.
        """

        tenant_id = str(subject.tenant_id)
        inventory_items = await self.inventory_repository.list_items(
            tenant_id=tenant_id, store_id="", active_only=True,
        )
        grouped = build_marketplace_catalog_groups([
            item for item in inventory_items
            if getattr(item, "sale_price", None) is not None
            and item.sale_price > 0
        ])
        group = next((entry for entry in grouped if str(entry["id"]) == product_ref), None)
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado ou não está mais disponível.")
        if int(str(group["stock"])) <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Produto sem estoque no momento.")

    # ------------------------------------------------------------------------
    # Product availability alerts
    # ------------------------------------------------------------------------

    async def list_availability_alerts(self, subject: TokenSubject) -> list[ProductAvailabilityAlertResponse]:
        """Return every back-in-stock alert requested by the authenticated customer."""

        customer = await self._resolve_customer(subject)
        alerts = await self.availability_alert_repository.list_for_customer(customer_id=customer.id)
        return [self._build_availability_alert_response(alert) for alert in alerts]

    async def create_availability_alert(
        self, subject: TokenSubject, product_ref: str, payload: ProductAvailabilityAlertCreateRequest,
    ) -> list[ProductAvailabilityAlertResponse]:
        """Register (or refresh) one back-in-stock alert for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        product_name = await self._resolve_any_marketplace_product_name(str(subject.tenant_id), product_ref)
        if product_name is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")
        existing = await self.availability_alert_repository.get_for_customer(customer_id=customer.id, product_ref=product_ref)
        if existing is not None:
            existing.notified_at = None
            existing.product_name_snapshot = payload.product_name.strip() or product_name
        else:
            alert = ProductAvailabilityAlert(
                id=str(uuid4()),
                tenant_id=customer.tenant_id,
                customer_id=customer.id,
                product_ref=product_ref,
                product_name_snapshot=payload.product_name.strip() or product_name,
            )
            await self.availability_alert_repository.add(alert)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self.list_availability_alerts(subject)

    async def delete_availability_alert(self, subject: TokenSubject, product_ref: str) -> list[ProductAvailabilityAlertResponse]:
        """Remove one back-in-stock alert for the authenticated customer."""

        customer = await self._resolve_customer(subject)
        existing = await self.availability_alert_repository.get_for_customer(customer_id=customer.id, product_ref=product_ref)
        if existing is not None:
            await self.availability_alert_repository.delete(existing)
            await self.session.commit()
            await apply_tenant_context(self.session, subject)
        return await self.list_availability_alerts(subject)

    async def _resolve_any_marketplace_product_name(self, tenant_id: str, product_ref: str) -> str | None:
        """Return one grouped product's display name even when hidden or out of stock, or None if it never existed."""

        inventory_items = await self.inventory_repository.list_items(tenant_id=tenant_id, store_id="", active_only=True)
        grouped = build_marketplace_catalog_groups([
            item for item in inventory_items if getattr(item, "sale_price", None) is not None and item.sale_price > 0
        ])
        group = next((entry for entry in grouped if str(entry["id"]) == product_ref), None)
        return str(group["name"]) if group is not None else None

    def _build_availability_alert_response(self, alert: ProductAvailabilityAlert) -> ProductAvailabilityAlertResponse:
        """Build one availability alert response payload."""

        return ProductAvailabilityAlertResponse(
            product_ref=alert.product_ref,
            product_name=alert.product_name_snapshot,
            notified=alert.notified_at is not None,
        )

    def _build_address_response(self, address: CustomerAddress) -> CustomerAddressResponse:
        """Build one address response payload."""

        return CustomerAddressResponse(
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

    def _build_payment_method_response(self, method: CustomerPaymentMethod) -> CustomerPaymentMethodResponse:
        """Build one payment method response payload."""

        return CustomerPaymentMethodResponse(
            id=method.id,
            provider_name=method.provider_name,
            brand_name=method.brand_name,
            last_four_digits=method.last_four_digits,
            holder_name=method.holder_name,
            expiration_month=method.expiration_month,
            expiration_year=method.expiration_year,
            is_primary=method.is_primary,
        )

    def _build_cart_item_response(self, item: CartItem) -> CartItemResponse:
        """Build one cart item response payload."""

        return CartItemResponse(
            product_ref=item.product_ref,
            quantity=item.quantity,
            is_subscription=item.is_subscription,
        )

    async def _get_subject_user(self, subject: TokenSubject):
        """Load the authenticated user tied to the current subject."""

        user = await self.user_repository.get_by_id(str(subject.user_id))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer session user was not found.")
        return user

    def _build_profile_response(self, *, subject: TokenSubject, user: object, customer: object | None) -> CustomerProfileResponse:
        """Build the customer profile response payload."""

        return CustomerProfileResponse(
            user_id=subject.user_id,
            tenant_id=subject.tenant_id,
            role=subject.role,
            access_scope=subject.access_scope,
            full_name=getattr(customer, "full_name", "") or getattr(user, "full_name", ""),
            email=getattr(customer, "email", "") or getattr(user, "email", ""),
            phone=getattr(customer, "phone", "") or "",
            cpf=getattr(customer, "cpf", "") or "",
            birth_date=getattr(customer, "birth_date", "") or "",
            gender=getattr(customer, "gender", "") or "",
            marital_status=getattr(customer, "marital_status", "") or "",
            children_count=getattr(customer, "children_count", None),
            avatar_url=getattr(customer, "avatar_url", "") or "",
            two_factor_enabled=bool(getattr(user, "two_factor_enabled", False)),
            member_since_label=getattr(customer, "member_since_label", "") or "",
        )
