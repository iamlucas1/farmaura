"""
farmaura-api/app/services/portal_service.py

Portal bootstrap and marketplace preference service for Farmaura.

Responsibilities:
- build cache-friendly bootstrap payloads for marketplace and internal portals;
- persist customer favorites, subscriptions, coupon campaigns, and portal settings from authoritative database records;
- expose customer-safe bootstrap snapshots without relying on frontend globals;

Observations:
- institutional metadata is resolved from tenant settings first and persisted operational records second;
- customer-specific collections are filtered by the authenticated subject and tenant on every request;
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import ValidationError

from app.core.password_hashing import generate_temporary_password, hash_password
from app.core.tenant_context import apply_first_access_context, apply_public_marketplace_context, apply_tenant_context
from app.domain.enums import AccessScope, OrderStatus, UserRole
from app.domain.validators import is_valid_email
from app.repositories.category_repository import CategoryRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.store_repository import StoreRepository
from app.repositories.user_repository import UserRepository
from app.services.geocoding_client import GeocodingClient
from app.services.marketplace_projection import resolve_marketplace_category_id
from app.services.notification_service import NotificationService

from app.models.chat_thread import ChatThread
from app.models.coupon_campaign import CouponCampaign
from app.models.customer import Customer
from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.health_service import HealthService
from app.models.health_service_appointment import HealthServiceAppointment
from app.models.marketplace_listing import MarketplaceListing
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.pdv_sale import PdvSale
from app.models.portal_setting import PortalSetting
from app.models.pricing_promotion import PricingPromotion
from app.models.product_review import ProductReview
from app.models.saved_product import SavedProduct
from app.models.subscription import Subscription
from app.models.user import User
from app.services.pricing_promotion_service import estimate_audience_size
from app.schemas.auth import TokenSubject
from app.schemas.portal import (
    PortalAddressSearchResponse,
    PortalAddressSearchResult,
    PortalCategoryResponse,
    PortalCnaeSettingsResponse,
    PortalCnaeSettingsUpdateRequest,
    PortalConstructionCostsResponse,
    PortalConstructionCostsUpdateRequest,
    PortalStoreConstructionCostsInput,
    PortalStoreConstructionCostsResponse,
    PortalCouponMutationRequest,
    PortalCouponResponse,
    PortalDeliveryRouteResponse,
    PortalDeliveryRouteStopResponse,
    PortalFavoriteMutationRequest,
    PortalFavoriteResponse,
    PortalFinancialSettingsResponse,
    PortalFirstAccessRequest,
    PortalFirstAccessResponse,
    PortalFinancialSettingsUpdateRequest,
    PortalHealthAppointmentCreateRequest,
    PortalHealthHistoryResponse,
    PortalHealthServiceResponse,
    PortalInternalBootstrapResponse,
    PortalMarketplaceBootstrapResponse,
    PortalDeliveryPricingResponse,
    PortalDeliveryPricingUpdateRequest,
    PortalDeliveryAreasResponse,
    PortalDeliveryAreasUpdateRequest,
    PortalMarketplaceDeliveryEstimateResponse,
    PortalMarketplaceMetaResponse,
    PortalMarketplaceMetaUpdateRequest,
    PortalMarketplacePublicBootstrapResponse,
    PortalPdvDiscountSettingsResponse,
    PortalPdvDiscountSettingsUpdateRequest,
    PortalPharmacistResponse,
    PortalPricingPromotionAudienceEstimateRequest,
    PortalPricingPromotionAudienceEstimateResponse,
    PortalPricingPromotionMutationRequest,
    PortalPricingPromotionResponse,
    PortalProductReviewCollectionResponse,
    PortalProductReviewCreateRequest,
    PortalProductReviewResponse,
    PortalRegisterRequest,
    PortalStoreResponse,
    PortalSubscriptionCreateRequest,
    PortalSubscriptionResponse,
    PortalSubscriptionUpdateRequest,
)


# ============================================================================
# PORTAL SERVICE CONSTANTS
# ============================================================================


PORTAL_NAME_INTERNAL = 'internal'
PORTAL_NAME_MARKETPLACE = 'marketplace'
SETTING_KEY_MARKETPLACE_META = 'marketplace_meta'
SETTING_KEY_FINANCIAL_SETTINGS = 'financial_settings'
SETTING_KEY_CONSTRUCTION_COSTS = 'construction_costs'
NON_REVENUE_ORDER_STATUSES = {OrderStatus.DRAFT.value, OrderStatus.SUBMITTED.value, OrderStatus.CANCELLED.value}
SETTING_KEY_DELIVERY_PRICING = 'delivery_pricing'
SETTING_KEY_DELIVERY_AREAS = 'delivery_areas'
SETTING_KEY_PDV_DISCOUNT_SETTINGS = 'pdv_discount_settings'
SETTING_KEY_CNAE_SETTINGS = 'cnae_settings'
WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
ZERO_FINANCIAL_MONTH = {
    'faturamento': 0, 'aluguel': 0, 'energia': 0, 'agua': 0, 'contab': 0,
    'licencas': 0, 'manut': 0, 'folha': 0, 'cmv_pct': 0, 'icms_pct': 0, 'reinv_pct': 0, 'roi_aa': 0,
}


# ============================================================================
# PORTAL SERVICE
# ============================================================================


class PortalService:
    """Provide portal bootstrap, coupon, review, and setting flows."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def get_marketplace_public_bootstrap(self) -> PortalMarketplacePublicBootstrapResponse:
        """Return marketplace bootstrap metadata derived from persisted records."""

        tenant_id = await self._resolve_public_tenant_id()
        if tenant_id:
            await apply_public_marketplace_context(self.session, tenant_id)
        categories = await self._list_marketplace_categories(tenant_id=tenant_id)
        stores = await self._list_store_snapshots(tenant_id=tenant_id)
        pharmacist = await self._resolve_primary_pharmacist(tenant_id=tenant_id, include_contact=False)
        marketplace = (await self._resolve_marketplace_meta(tenant_id=tenant_id)).model_copy(
            update={
                'commission_percent': Decimal('0.00'),
                'payment_fee_percent': Decimal('0.00'),
                'fixed_fee': Decimal('0.00'),
                'minimum_margin_percent': Decimal('0.00'),
            }
        )
        health_services = await self._list_health_services(tenant_id=tenant_id)
        coupons = await self._list_coupon_campaigns(tenant_id=tenant_id, active_only=True)
        return PortalMarketplacePublicBootstrapResponse(
            categories=categories,
            stores=stores,
            pharmacist=pharmacist,
            marketplace=marketplace,
            health_services=health_services,
            coupons=coupons,
            delivery_estimate=await self._resolve_marketplace_delivery_estimate(tenant_id=tenant_id),
        )

    async def request_marketplace_first_access(self, payload: PortalFirstAccessRequest) -> PortalFirstAccessResponse:
        """Provision or renew first-access credentials for a PDV-registered customer."""

        generic_response = PortalFirstAccessResponse(
            detail="Se o e-mail informado estiver cadastrado, enviaremos uma senha temporária para acesso.",
        )
        email = payload.email.strip().lower()
        await apply_first_access_context(self.session, email)
        tenant_id = await self._resolve_public_tenant_id()
        customer = await CustomerRepository(self.session).get_by_email(tenant_id=tenant_id, email=email)
        if customer is None:
            return generic_response

        user_repository = UserRepository(self.session)
        user = await user_repository.get_by_email(email)
        temporary_password = generate_temporary_password()
        if user is None:
            user = User(
                id=str(uuid4()),
                tenant_id=customer.tenant_id,
                email=email,
                password_hash=hash_password(temporary_password),
                full_name=customer.full_name,
                role=UserRole.CUSTOMER.value,
                access_scope=AccessScope.MARKETPLACE.value,
                must_change_password=True,
            )
            await user_repository.add(user)
        elif user.must_change_password:
            user.password_hash = hash_password(temporary_password)
            await user_repository.save(user)
        else:
            await self.session.commit()
            return generic_response

        NotificationService().send_first_access_email(
            email=email,
            full_name=customer.full_name,
            temporary_password=temporary_password,
        )
        await self.session.commit()
        return generic_response

    async def register_marketplace_account(self, payload: PortalRegisterRequest) -> User:
        """Create a self-service marketplace account and its customer profile."""

        email = payload.email.strip().lower()
        full_name = payload.full_name.strip()
        phone = payload.phone.strip()
        if not is_valid_email(email):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="E-mail inválido.")
        await apply_first_access_context(self.session, email)
        user_repository = UserRepository(self.session)
        if await user_repository.get_by_email(email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma conta com este e-mail.")

        tenant_id = await self._resolve_public_tenant_id()
        customer_repository = CustomerRepository(self.session)
        customer = await customer_repository.get_by_email(tenant_id=tenant_id, email=email)
        if customer is None:
            customer = Customer(
                id=str(uuid4()),
                tenant_id=tenant_id,
                external_code="web-" + uuid4().hex[:8],
                full_name=full_name,
                email=email,
                phone=phone,
                member_since_label="Agora",
                loyalty_tier="Novo",
            )
            await customer_repository.add(customer)
        elif phone and not customer.phone:
            customer.phone = phone
            await customer_repository.save(customer)

        user = User(
            id=str(uuid4()),
            tenant_id=tenant_id,
            email=email,
            password_hash=hash_password(payload.password),
            full_name=full_name or customer.full_name,
            role=UserRole.CUSTOMER.value,
            access_scope=AccessScope.MARKETPLACE.value,
            must_change_password=False,
        )
        await user_repository.add(user)
        await self.session.commit()
        return user

    async def get_marketplace_bootstrap(self, subject: TokenSubject) -> PortalMarketplaceBootstrapResponse:
        """Return authenticated marketplace bootstrap data for one customer."""

        customer = await self._require_customer(subject)
        categories = await self._list_marketplace_categories(tenant_id=customer.tenant_id)
        stores = await self._list_store_snapshots(tenant_id=customer.tenant_id)
        pharmacist = await self._resolve_primary_pharmacist(tenant_id=customer.tenant_id)
        marketplace = await self._resolve_marketplace_meta(tenant_id=customer.tenant_id)
        health_services = await self._list_health_services(tenant_id=customer.tenant_id)
        favorites = await self._list_saved_products(customer=customer)
        subscriptions = await self._list_subscriptions(customer=customer)
        health_history = await self._list_health_history(customer=customer)
        coupons = await self._list_coupon_campaigns(tenant_id=customer.tenant_id, active_only=True)
        return PortalMarketplaceBootstrapResponse(
            categories=categories,
            stores=stores,
            pharmacist=pharmacist,
            marketplace=marketplace,
            health_services=health_services,
            health_history=health_history,
            favorites=favorites,
            subscriptions=subscriptions,
            coupons=coupons,
            delivery_estimate=await self._resolve_marketplace_delivery_estimate(tenant_id=str(customer.tenant_id)),
        )

    async def get_internal_bootstrap(self, subject: TokenSubject, *, requested_store_id: str = "") -> PortalInternalBootstrapResponse:
        """Return internal portal metadata derived from persisted records."""

        user = await self._require_user(subject)
        tenant_id = str(subject.tenant_id)
        pharmacist = await self._build_pharmacist_profile(user=user)
        marketplace = await self._resolve_marketplace_meta(tenant_id=tenant_id)
        stores = await self._list_store_snapshots(tenant_id=tenant_id)
        if requested_store_id and subject.role == UserRole.ADMIN:
            own_store_id = requested_store_id
        else:
            own_store_id = user.store_id or await InventoryRepository(self.session).get_primary_store_id(tenant_id=tenant_id)
        store = next((candidate for candidate in stores if candidate.id == own_store_id), None)
        store = store or (stores[0] if stores else PortalStoreResponse(id='', name='Farmaura', address=''))
        now = datetime.now(tz=UTC)
        return PortalInternalBootstrapResponse(
            now_label=now.astimezone().strftime('%H:%M'),
            today_label=now.astimezone().strftime('%d/%m/%Y'),
            today_iso=now.date().isoformat(),
            pharmacist=pharmacist,
            marketplace=marketplace,
            store=store,
            stores=stores,
            chart_seed=await self._build_chart_seed(tenant_id=tenant_id),
            coupon_campaigns=await self._list_coupon_campaigns(tenant_id=tenant_id, active_only=False),
            pricing_promotions=await self._list_pricing_promotions(tenant_id=tenant_id),
            financial_settings=await self._resolve_financial_settings(tenant_id=tenant_id),
            delivery_route=await self._resolve_delivery_route(tenant_id=tenant_id, store=store),
            delivery_pricing=await self._resolve_delivery_pricing(tenant_id=tenant_id),
            delivery_areas=await self._resolve_delivery_areas(tenant_id=tenant_id),
            pdv_discount_settings=await self._resolve_pdv_discount_settings(tenant_id=tenant_id),
            cnae_settings=await self._resolve_cnae_settings(tenant_id=tenant_id),
        )

    async def update_marketplace_meta(self, subject: TokenSubject, payload: PortalMarketplaceMetaUpdateRequest) -> PortalMarketplaceMetaResponse:
        """Persist tenant-scoped marketplace meta settings."""

        await self._require_user(subject)
        value = payload.model_dump(mode='json')
        await self._upsert_setting_payload(
            tenant_id=str(subject.tenant_id),
            portal_name=PORTAL_NAME_INTERNAL,
            setting_key=SETTING_KEY_MARKETPLACE_META,
            value=value,
        )
        await self.session.commit()
        return await self._resolve_marketplace_meta(tenant_id=str(subject.tenant_id))

    async def get_delivery_pricing(self, subject: TokenSubject) -> PortalDeliveryPricingResponse:
        """Return tenant-scoped distance-based delivery pricing configuration."""

        await self._require_user(subject)
        return await self._resolve_delivery_pricing(tenant_id=str(subject.tenant_id))

    async def update_delivery_pricing(self, subject: TokenSubject, payload: PortalDeliveryPricingUpdateRequest) -> PortalDeliveryPricingResponse:
        """Persist tenant-scoped distance-based delivery pricing configuration."""

        await self._require_user(subject)
        sorted_tiers = sorted(payload.tiers, key=lambda tier: tier.up_to_km)
        value = {
            'tiers': [tier.model_dump(mode='json') for tier in sorted_tiers],
            'fee_beyond_last_tier': str(payload.fee_beyond_last_tier),
            'free_above_subtotal': str(payload.free_above_subtotal),
        }
        await self._upsert_setting_payload(
            tenant_id=str(subject.tenant_id),
            portal_name=PORTAL_NAME_INTERNAL,
            setting_key=SETTING_KEY_DELIVERY_PRICING,
            value=value,
        )
        await self.session.commit()
        return await self._resolve_delivery_pricing(tenant_id=str(subject.tenant_id))

    async def get_pdv_discount_settings(self, subject: TokenSubject) -> PortalPdvDiscountSettingsResponse:
        """Return the tenant-scoped minimum average margin required to grant a PDV discount."""

        await self._require_user(subject)
        return await self._resolve_pdv_discount_settings(tenant_id=str(subject.tenant_id))

    async def update_pdv_discount_settings(self, subject: TokenSubject, payload: PortalPdvDiscountSettingsUpdateRequest) -> PortalPdvDiscountSettingsResponse:
        """Persist the tenant-scoped minimum average margin required to grant a PDV discount."""

        await self._require_user(subject)
        value = payload.model_dump(mode='json')
        await self._upsert_setting_payload(
            tenant_id=str(subject.tenant_id),
            portal_name=PORTAL_NAME_INTERNAL,
            setting_key=SETTING_KEY_PDV_DISCOUNT_SETTINGS,
            value=value,
        )
        await self.session.commit()
        return await self._resolve_pdv_discount_settings(tenant_id=str(subject.tenant_id))

    async def get_cnae_settings(self, subject: TokenSubject) -> PortalCnaeSettingsResponse:
        """Return the tenant-scoped registered CNAEs and tax regime."""

        await self._require_user(subject)
        return await self._resolve_cnae_settings(tenant_id=str(subject.tenant_id))

    async def update_cnae_settings(self, subject: TokenSubject, payload: PortalCnaeSettingsUpdateRequest) -> PortalCnaeSettingsResponse:
        """Persist the tenant-scoped registered CNAEs and tax regime."""

        await self._require_user(subject)
        normalized = []
        principal_seen = False
        principal_requested = any(entry.is_principal for entry in payload.items)
        for index, entry in enumerate(payload.items):
            is_principal = (entry.is_principal or (not principal_requested and index == 0)) and not principal_seen
            if is_principal:
                principal_seen = True
            normalized.append(entry.model_copy(update={'is_principal': is_principal}))
        value = {
            'items': [entry.model_dump(mode='json') for entry in normalized],
            'tax_regime': payload.tax_regime.model_dump(mode='json'),
        }
        await self._upsert_setting_payload(
            tenant_id=str(subject.tenant_id),
            portal_name=PORTAL_NAME_INTERNAL,
            setting_key=SETTING_KEY_CNAE_SETTINGS,
            value=value,
        )
        await self.session.commit()
        return await self._resolve_cnae_settings(tenant_id=str(subject.tenant_id))

    async def get_delivery_areas(self, subject: TokenSubject) -> PortalDeliveryAreasResponse:
        """Return tenant-scoped per-store delivery-area configuration."""

        await self._require_user(subject)
        return await self._resolve_delivery_areas(tenant_id=str(subject.tenant_id))

    async def update_delivery_areas(self, subject: TokenSubject, payload: PortalDeliveryAreasUpdateRequest) -> PortalDeliveryAreasResponse:
        """Persist tenant-scoped per-store delivery-area configuration."""

        await self._require_user(subject)
        value = payload.model_dump(mode='json')
        await self._upsert_setting_payload(
            tenant_id=str(subject.tenant_id),
            portal_name=PORTAL_NAME_INTERNAL,
            setting_key=SETTING_KEY_DELIVERY_AREAS,
            value=value,
        )
        await self.session.commit()
        return await self._resolve_delivery_areas(tenant_id=str(subject.tenant_id))

    async def search_delivery_addresses(self, subject: TokenSubject, query: str) -> PortalAddressSearchResponse:
        """Return neighborhood/city search matches for one free-text query, to add as a delivery area."""

        await self._require_user(subject)
        matches = await asyncio.to_thread(GeocodingClient().search, query)
        results = [
            PortalAddressSearchResult(
                label=entry.label,
                district=entry.district,
                city=entry.city,
                state_code=entry.state_code,
                kind=entry.kind,
                latitude=entry.latitude,
                longitude=entry.longitude,
            )
            for entry in matches
        ]
        return PortalAddressSearchResponse(results=results)

    async def get_financial_settings(self, subject: TokenSubject) -> PortalFinancialSettingsResponse:
        """Return tenant-scoped financial assumptions for the internal portal."""

        await self._require_user(subject)
        return await self._resolve_financial_settings(tenant_id=str(subject.tenant_id))

    async def update_financial_settings(self, subject: TokenSubject, payload: PortalFinancialSettingsUpdateRequest) -> PortalFinancialSettingsResponse:
        """Persist tenant-scoped financial assumptions for the internal portal."""

        await self._require_user(subject)
        value = {'months': payload.model_dump(mode='json').get('months', {})}
        await self._upsert_setting_payload(
            tenant_id=str(subject.tenant_id),
            portal_name=PORTAL_NAME_INTERNAL,
            setting_key=SETTING_KEY_FINANCIAL_SETTINGS,
            value=value,
        )
        await self.session.commit()
        return await self._resolve_financial_settings(tenant_id=str(subject.tenant_id))

    async def get_construction_costs(self, subject: TokenSubject) -> PortalConstructionCostsResponse:
        """Return tenant-scoped, per-store construction cost entries and real-sales ROI figures."""

        await self._require_user(subject)
        return await self._resolve_construction_costs(tenant_id=str(subject.tenant_id))

    async def update_construction_costs(self, subject: TokenSubject, payload: PortalConstructionCostsUpdateRequest) -> PortalConstructionCostsResponse:
        """Persist tenant-scoped, per-store construction cost entries."""

        await self._require_user(subject)
        tenant_id = str(subject.tenant_id)
        value = {'stores': {store_id: entry.model_dump(mode='json') for store_id, entry in payload.stores.items()}}
        await self._upsert_setting_payload(
            tenant_id=tenant_id,
            portal_name=PORTAL_NAME_INTERNAL,
            setting_key=SETTING_KEY_CONSTRUCTION_COSTS,
            value=value,
        )
        await self.session.commit()
        return await self._resolve_construction_costs(tenant_id=tenant_id)

    async def list_coupon_campaigns(self, subject: TokenSubject) -> list[PortalCouponResponse]:
        """Return all coupon campaigns for the authenticated internal tenant."""

        await self._require_user(subject)
        return await self._list_coupon_campaigns(tenant_id=str(subject.tenant_id), active_only=False)

    async def create_coupon_campaign(self, subject: TokenSubject, payload: PortalCouponMutationRequest) -> list[PortalCouponResponse]:
        """Persist one coupon campaign for the authenticated internal tenant."""

        await self._require_user(subject)
        tenant_id = str(subject.tenant_id)
        normalized_code = self._normalize_coupon_code(payload.code)
        statement = select(CouponCampaign).where(CouponCampaign.tenant_id == tenant_id, CouponCampaign.code == normalized_code)
        existing = (await self.session.execute(statement)).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Coupon code already exists.')
        record = CouponCampaign(
            tenant_id=tenant_id,
            code=normalized_code,
            title=payload.title,
            description=payload.description,
            discount_type=payload.discount_type,
            shipping_discount_mode=payload.shipping_discount_mode,
            discount_value=payload.discount_value,
            minimum_order_value=payload.minimum_order_value,
            max_discount_value=payload.max_discount_value,
            starts_at_label=payload.starts_at,
            ends_at_label=payload.ends_at,
            usage_limit=payload.usage_limit,
            usage_count=0,
            per_customer_limit=payload.per_customer_limit,
            audience=payload.audience,
            scope_type=payload.scope_type,
            target_categories_json=self._json_dump(payload.target_categories),
            target_products_json=self._json_dump(payload.target_products),
            first_purchase_only=payload.first_purchase_only,
            stackable=payload.stackable,
            is_active=payload.active,
            notes=payload.notes,
        )
        self.session.add(record)
        await self.session.commit()
        return await self._list_coupon_campaigns(tenant_id=tenant_id, active_only=False)

    async def update_coupon_campaign(self, subject: TokenSubject, coupon_id: str, payload: PortalCouponMutationRequest) -> list[PortalCouponResponse]:
        """Update one coupon campaign for the authenticated internal tenant."""

        await self._require_user(subject)
        record = await self._require_coupon_campaign(tenant_id=str(subject.tenant_id), coupon_id=coupon_id)
        record.code = self._normalize_coupon_code(payload.code)
        record.title = payload.title
        record.description = payload.description
        record.discount_type = payload.discount_type
        record.shipping_discount_mode = payload.shipping_discount_mode
        record.discount_value = payload.discount_value
        record.minimum_order_value = payload.minimum_order_value
        record.max_discount_value = payload.max_discount_value
        record.starts_at_label = payload.starts_at
        record.ends_at_label = payload.ends_at
        record.usage_limit = payload.usage_limit
        record.per_customer_limit = payload.per_customer_limit
        record.audience = payload.audience
        record.scope_type = payload.scope_type
        record.target_categories_json = self._json_dump(payload.target_categories)
        record.target_products_json = self._json_dump(payload.target_products)
        record.first_purchase_only = payload.first_purchase_only
        record.stackable = payload.stackable
        record.is_active = payload.active
        record.notes = payload.notes
        await self.session.commit()
        return await self._list_coupon_campaigns(tenant_id=str(subject.tenant_id), active_only=False)

    async def delete_coupon_campaign(self, subject: TokenSubject, coupon_id: str) -> list[PortalCouponResponse]:
        """Delete one coupon campaign for the authenticated internal tenant."""

        await self._require_user(subject)
        record = await self._require_coupon_campaign(tenant_id=str(subject.tenant_id), coupon_id=coupon_id)
        await self.session.delete(record)
        await self.session.commit()
        return await self._list_coupon_campaigns(tenant_id=str(subject.tenant_id), active_only=False)

    # ------------------------------------------------------------------------
    # Pricing promotions
    # ------------------------------------------------------------------------

    async def list_pricing_promotions(self, subject: TokenSubject) -> list[PortalPricingPromotionResponse]:
        """Return all pricing promotions for the authenticated internal tenant."""

        await self._require_user(subject)
        return await self._list_pricing_promotions(tenant_id=str(subject.tenant_id))

    async def create_pricing_promotion(
        self, subject: TokenSubject, payload: PortalPricingPromotionMutationRequest
    ) -> list[PortalPricingPromotionResponse]:
        """Persist one pricing promotion for the authenticated internal tenant."""

        await self._require_user(subject)
        tenant_id = str(subject.tenant_id)
        record = PricingPromotion(tenant_id=tenant_id)
        self._apply_pricing_promotion_payload(record, payload)
        self.session.add(record)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self._list_pricing_promotions(tenant_id=tenant_id)

    async def update_pricing_promotion(
        self, subject: TokenSubject, promotion_id: str, payload: PortalPricingPromotionMutationRequest
    ) -> list[PortalPricingPromotionResponse]:
        """Update one pricing promotion for the authenticated internal tenant."""

        await self._require_user(subject)
        record = await self._require_pricing_promotion(tenant_id=str(subject.tenant_id), promotion_id=promotion_id)
        self._apply_pricing_promotion_payload(record, payload)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self._list_pricing_promotions(tenant_id=str(subject.tenant_id))

    async def delete_pricing_promotion(self, subject: TokenSubject, promotion_id: str) -> list[PortalPricingPromotionResponse]:
        """Delete one pricing promotion for the authenticated internal tenant."""

        await self._require_user(subject)
        record = await self._require_pricing_promotion(tenant_id=str(subject.tenant_id), promotion_id=promotion_id)
        await self.session.delete(record)
        await self.session.commit()
        await apply_tenant_context(self.session, subject)
        return await self._list_pricing_promotions(tenant_id=str(subject.tenant_id))

    async def estimate_pricing_promotion_audience(
        self, subject: TokenSubject, payload: PortalPricingPromotionAudienceEstimateRequest
    ) -> PortalPricingPromotionAudienceEstimateResponse:
        """Return how many active customers match a draft promotion's audience filters."""

        await self._require_user(subject)
        tenant_id = str(subject.tenant_id)
        total_statement = select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id, Customer.is_active.is_(True))
        total_active_customers = int((await self.session.execute(total_statement)).scalar_one() or 0)
        matching_customers = await estimate_audience_size(
            self.session,
            tenant_id=tenant_id,
            min_age=payload.min_age,
            max_age=payload.max_age,
            regions=payload.regions,
            device_types=payload.device_types,
            marital_statuses=payload.marital_statuses,
            min_children=payload.min_children,
            max_children=payload.max_children,
            customer_segment=payload.customer_segment,
        )
        return PortalPricingPromotionAudienceEstimateResponse(
            matching_customers=matching_customers,
            total_active_customers=total_active_customers,
        )

    async def list_product_reviews(self, product_ref: str) -> PortalProductReviewCollectionResponse:
        """Return published reviews for one marketplace product reference."""

        return await self._build_product_review_collection(product_ref=product_ref, inventory_ids=[], listing_id='')

    async def create_product_review(self, subject: TokenSubject, payload: PortalProductReviewCreateRequest) -> PortalProductReviewCollectionResponse:
        """Persist one marketplace product review for the authenticated customer."""

        customer = await self._require_customer(subject)
        verified_order_id, inventory_item_id, listing_id = await self._resolve_review_purchase_match(customer=customer, product_ref=payload.product_ref)
        reviewer_name = str(customer.name or customer.email or 'Cliente Farmaura').strip()
        record = ProductReview(
            tenant_id=customer.tenant_id,
            customer_id=customer.id,
            order_id=verified_order_id,
            inventory_item_id=inventory_item_id,
            marketplace_listing_id=listing_id,
            product_ref=payload.product_ref.strip(),
            reviewer_name_snapshot=reviewer_name,
            reviewer_avatar_initials=self._initials(reviewer_name),
            title=payload.title,
            body=payload.body,
            rating=payload.rating,
            helpful_count=0,
            is_verified_purchase=bool(verified_order_id),
            is_published=True,
            submitted_at_label=datetime.now(tz=UTC).astimezone().strftime('%d/%m/%Y'),
        )
        self.session.add(record)
        await self.session.commit()
        return await self._build_product_review_collection(product_ref=payload.product_ref.strip(), inventory_ids=[inventory_item_id] if inventory_item_id else [], listing_id=listing_id or '')

    async def list_favorites(self, subject: TokenSubject) -> list[PortalFavoriteResponse]:
        """Return saved marketplace products for the authenticated customer."""

        customer = await self._require_customer(subject)
        return await self._list_saved_products(customer=customer)

    async def save_favorite(self, subject: TokenSubject, payload: PortalFavoriteMutationRequest) -> list[PortalFavoriteResponse]:
        """Persist one favorite product reference for the authenticated customer."""

        customer = await self._require_customer(subject)
        product_ref = payload.product_ref.strip()
        saved_products = await self._fetch_saved_product_models(customer=customer)
        if any(self._saved_product_ref(item) == product_ref for item in saved_products):
            return await self._list_saved_products(customer=customer)
        listing_ref, inventory_ref = self._split_product_ref(product_ref)
        record = SavedProduct(
            id=str(uuid4()),
            tenant_id=customer.tenant_id,
            customer_id=customer.id,
            marketplace_listing_id=listing_ref,
            inventory_item_id=inventory_ref,
            saved_from_channel='marketplace',
            product_name_snapshot=product_ref,
        )
        self.session.add(record)
        await self.session.commit()
        return await self._list_saved_products(customer=customer)

    async def delete_favorite(self, subject: TokenSubject, product_ref: str) -> list[PortalFavoriteResponse]:
        """Delete one favorite product reference for the authenticated customer."""

        customer = await self._require_customer(subject)
        saved_products = await self._fetch_saved_product_models(customer=customer)
        normalized_ref = product_ref.strip()
        for record in saved_products:
            if self._saved_product_ref(record) == normalized_ref:
                await self.session.delete(record)
        await self.session.commit()
        return await self._list_saved_products(customer=customer)

    async def list_subscriptions(self, subject: TokenSubject) -> list[PortalSubscriptionResponse]:
        """Return marketplace subscriptions for the authenticated customer."""

        customer = await self._require_customer(subject)
        return await self._list_subscriptions(customer=customer)

    async def create_subscription(self, subject: TokenSubject, payload: PortalSubscriptionCreateRequest) -> list[PortalSubscriptionResponse]:
        """Persist one marketplace subscription for the authenticated customer."""

        customer = await self._require_customer(subject)
        product_ref = payload.product_ref.strip()
        subscriptions = await self._fetch_subscription_models(customer=customer)
        existing = next((record for record in subscriptions if self._subscription_ref(record) == product_ref), None)
        if existing is not None:
            existing.quantity = payload.quantity
            existing.frequency_days = payload.frequency_days
            existing.is_paused = False
            existing.subscription_status = 'active'
        else:
            listing_ref, inventory_ref = self._split_product_ref(product_ref)
            record = Subscription(
                id=str(uuid4()),
                tenant_id=customer.tenant_id,
                customer_id=customer.id,
                marketplace_listing_id=listing_ref,
                inventory_item_id=inventory_ref,
                subscription_code='SUB-' + uuid4().hex[:8].upper(),
                subscription_status='active',
                product_name_snapshot=product_ref,
                quantity=payload.quantity,
                frequency_days=payload.frequency_days,
                next_cycle_in_days=max(1, payload.frequency_days // 4),
                next_cycle_date_label='',
                started_at_label='Assinatura recente',
                paused_at_label='',
                cancelled_at_label='',
                unit_price_snapshot=Decimal('0.00'),
                discount_percent=Decimal('15.00'),
                is_paused=False,
            )
            self.session.add(record)
        await self.session.commit()
        return await self._list_subscriptions(customer=customer)

    async def update_subscription(self, subject: TokenSubject, product_ref: str, payload: PortalSubscriptionUpdateRequest) -> list[PortalSubscriptionResponse]:
        """Update one marketplace subscription for the authenticated customer."""

        customer = await self._require_customer(subject)
        subscriptions = await self._fetch_subscription_models(customer=customer)
        record = next((item for item in subscriptions if self._subscription_ref(item) == product_ref.strip()), None)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Subscription not found.')
        if payload.quantity is not None:
            record.quantity = payload.quantity
        if payload.frequency_days is not None:
            record.frequency_days = payload.frequency_days
            if not payload.skip_next_cycle:
                record.next_cycle_in_days = max(1, payload.frequency_days // 4)
        if payload.is_paused is not None:
            record.is_paused = payload.is_paused
            record.subscription_status = 'paused' if payload.is_paused else 'active'
        if payload.skip_next_cycle:
            record.next_cycle_in_days = int(record.next_cycle_in_days or 0) + int(record.frequency_days or 0)
        await self.session.commit()
        return await self._list_subscriptions(customer=customer)

    async def delete_subscription(self, subject: TokenSubject, product_ref: str) -> list[PortalSubscriptionResponse]:
        """Delete one marketplace subscription for the authenticated customer."""

        customer = await self._require_customer(subject)
        subscriptions = await self._fetch_subscription_models(customer=customer)
        for record in subscriptions:
            if self._subscription_ref(record) == product_ref.strip():
                await self.session.delete(record)
        await self.session.commit()
        return await self._list_subscriptions(customer=customer)

    async def create_health_appointment(
        self, subject: TokenSubject, payload: PortalHealthAppointmentCreateRequest
    ) -> list[PortalHealthHistoryResponse]:
        """Persist one real health service booking for the authenticated customer."""

        customer = await self._require_customer(subject)
        service_statement = select(HealthService).where(
            HealthService.id == payload.service_id,
            HealthService.tenant_id == customer.tenant_id,
            HealthService.is_active.is_(True),
        )
        service = (await self.session.execute(service_statement)).scalar_one_or_none()
        if service is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Health service not found.')
        appointment = HealthServiceAppointment(
            id=str(uuid4()),
            tenant_id=customer.tenant_id,
            service_id=service.id,
            customer_id=customer.id,
            appointment_code='AGD-' + uuid4().hex[:8].upper(),
            source_channel='marketplace',
            appointment_status='scheduled',
            service_name_snapshot=service.service_name,
            professional_name_snapshot='',
            store_id=payload.store_id,
            store_name_snapshot=payload.store_name.strip(),
            scheduled_date_label=payload.scheduled_date_label.strip(),
            scheduled_time_label=payload.scheduled_time_label.strip(),
            price_amount=Decimal(service.price_amount or 0),
        )
        self.session.add(appointment)
        await self.session.commit()
        return await self._list_health_history(customer=customer)

    async def _require_user(self, subject: TokenSubject) -> User:
        """Load the authenticated user for the current subject."""

        statement = select(User).where(User.id == str(subject.user_id), User.tenant_id == str(subject.tenant_id), User.is_active.is_(True))
        result = await self.session.execute(statement)
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Authenticated user not found.')
        return user

    async def _require_customer(self, subject: TokenSubject) -> Customer:
        """Load the customer linked to the authenticated subject."""

        user = await self._require_user(subject)
        statement = select(Customer).where(Customer.tenant_id == str(subject.tenant_id), Customer.email == user.email, Customer.is_active.is_(True))
        result = await self.session.execute(statement)
        customer = result.scalar_one_or_none()
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Customer profile not found.')
        return customer

    async def _require_coupon_campaign(self, *, tenant_id: str, coupon_id: str) -> CouponCampaign:
        """Return one coupon campaign or fail with not found."""

        statement = select(CouponCampaign).where(CouponCampaign.tenant_id == tenant_id, CouponCampaign.id == coupon_id)
        result = await self.session.execute(statement)
        coupon = result.scalar_one_or_none()
        if coupon is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Coupon campaign not found.')
        return coupon

    async def _require_pricing_promotion(self, *, tenant_id: str, promotion_id: str) -> PricingPromotion:
        """Return one pricing promotion or fail with not found."""

        statement = select(PricingPromotion).where(PricingPromotion.tenant_id == tenant_id, PricingPromotion.id == promotion_id)
        result = await self.session.execute(statement)
        promotion = result.scalar_one_or_none()
        if promotion is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Pricing promotion not found.')
        return promotion

    async def _resolve_public_tenant_id(self) -> str:
        """Return the tenant that owns the public storefront.

        Runs through the same SECURITY DEFINER lookup catalog_service uses
        (app_private.resolve_public_marketplace_tenant_id): an anonymous caller has no
        tenant context yet, so identifying which tenant to scope to is inherently a
        cross-tenant read that must bypass RLS narrowly — it returns only a tenant id,
        never any row data.
        """

        tenant_id = (await self.session.execute(text("SELECT app_private.resolve_public_marketplace_tenant_id()"))).scalar_one_or_none()
        return str(tenant_id or '')

    async def _list_marketplace_categories(self, *, tenant_id: str | None) -> list[PortalCategoryResponse]:
        """Return every active category the admin has registered, one menu entry each.

        Mirrors the Categoria admin screen 1:1 — id is a stable slug of the category
        name (unique per tenant, per Category.uq_categories_tenant_name), the same slug
        resolve_marketplace_category_id() assigns to each product's `cat` field in
        marketplace_projection.py, so clicking a menu entry always finds the matching
        products. A category shows up as soon as it's created, even with zero products
        yet — deactivating it removes it immediately.
        """

        if not tenant_id:
            return [PortalCategoryResponse(id="medicamentos", label="Medicamentos", description="Catálogo geral.", icon="pill")]
        categories = [
            category
            for category in await CategoryRepository(self.session).list_categories(tenant_id=tenant_id, active_only=True)
            if not category.is_discarded
        ]
        if not categories:
            return [PortalCategoryResponse(id="medicamentos", label="Medicamentos", description="Catálogo geral.", icon="pill")]
        responses: list[PortalCategoryResponse] = []
        seen_ids: set[str] = set()
        for category in categories:
            category_id = resolve_marketplace_category_id(category.name)
            if category_id in seen_ids:
                continue
            seen_ids.add(category_id)
            responses.append(
                PortalCategoryResponse(
                    id=category_id,
                    label=category.name,
                    description=category.description or "Categoria do catálogo do marketplace.",
                    icon=self._category_icon(category_id),
                )
            )
        return responses

    async def _list_store_snapshots(self, *, tenant_id: str | None) -> list[PortalStoreResponse]:
        """Return persisted physical store snapshots for portal chrome."""

        if not tenant_id:
            return []
        stores = await StoreRepository(self.session).list_stores(tenant_id=tenant_id, active_only=True)
        return [
            PortalStoreResponse(
                id=store.id,
                name=store.name,
                address=store.address_line,
                postal_code=store.postal_code,
                district=store.district,
                city=store.city,
                state_code=store.state_code,
                ready_minutes=20,
                open_status_label='Loja operando',
                latitude=store.latitude,
                longitude=store.longitude,
            )
            for store in stores
        ]

    async def _resolve_primary_pharmacist(self, *, tenant_id: str | None, include_contact: bool = True) -> PortalPharmacistResponse:
        """Return the primary pharmacist display snapshot from persisted records.

        include_contact=False strips the staff email from the response — used for the
        anonymous public bootstrap, which must never expose internal user information,
        even as a defense-in-depth measure independent of what RLS currently allows.
        """

        thread_statement = select(ChatThread).where(ChatThread.pharmacist_name_snapshot != '', ChatThread.is_active.is_(True))
        if tenant_id:
            thread_statement = thread_statement.where(ChatThread.tenant_id == tenant_id)
        thread_statement = thread_statement.order_by(desc(ChatThread.created_at))
        thread = (await self.session.execute(thread_statement)).scalars().first()
        if thread is not None:
            name = str(thread.pharmacist_name_snapshot or '').strip()
            return PortalPharmacistResponse(name=name, role_label='Farmacêutica responsável', registration_code='', email='', avatar_initials=self._initials(name))
        user_statement = select(User).where(User.role == 'pharmacist', User.is_active.is_(True))
        if tenant_id:
            user_statement = user_statement.where(User.tenant_id == tenant_id)
        user_statement = user_statement.order_by(desc(User.created_at))
        user = (await self.session.execute(user_statement)).scalars().first()
        if user is None:
            return PortalPharmacistResponse()
        return await self._build_pharmacist_profile(user=user, include_contact=include_contact)

    async def _build_pharmacist_profile(self, user: User, *, include_contact: bool = True) -> PortalPharmacistResponse:
        """Build the display payload for one pharmacist or operator."""

        return PortalPharmacistResponse(name=str(user.full_name or ''), role_label='Operação interna' if user.role != 'pharmacist' else 'Farmacêutica responsável', registration_code='', email=str(user.email or '') if include_contact else '', avatar_initials=self._initials(str(user.full_name or '')))

    async def _resolve_marketplace_meta(self, *, tenant_id: str | None) -> PortalMarketplaceMetaResponse:
        """Return marketplace institutional metadata resolved from settings and listings."""

        derived = await self._derive_marketplace_meta_from_listing(tenant_id=tenant_id)
        if not tenant_id:
            return derived
        stored_value = await self._get_setting_payload(tenant_id=tenant_id, portal_name=PORTAL_NAME_INTERNAL, setting_key=SETTING_KEY_MARKETPLACE_META, default={})
        if not stored_value:
            return derived
        merged = {**derived.model_dump(mode='json'), **stored_value}
        return PortalMarketplaceMetaResponse.model_validate(merged)

    async def _resolve_pdv_discount_settings(self, *, tenant_id: str) -> PortalPdvDiscountSettingsResponse:
        """Return the tenant's minimum average margin required to grant a PDV discount, defaulting to 20%."""

        stored_value = await self._get_setting_payload(tenant_id=tenant_id, portal_name=PORTAL_NAME_INTERNAL, setting_key=SETTING_KEY_PDV_DISCOUNT_SETTINGS, default=None)
        if not stored_value:
            return PortalPdvDiscountSettingsResponse()
        return PortalPdvDiscountSettingsResponse.model_validate(stored_value)

    async def _resolve_cnae_settings(self, *, tenant_id: str) -> PortalCnaeSettingsResponse:
        """Return the tenant's registered CNAEs and their pricing ICMS rates."""

        stored_value = await self._get_setting_payload(tenant_id=tenant_id, portal_name=PORTAL_NAME_INTERNAL, setting_key=SETTING_KEY_CNAE_SETTINGS, default=None)
        if not stored_value:
            return PortalCnaeSettingsResponse()
        return PortalCnaeSettingsResponse.model_validate(stored_value)

    async def _resolve_delivery_pricing(self, *, tenant_id: str) -> PortalDeliveryPricingResponse:
        """Return the tenant's delivery pricing configuration, defaulting to the legacy flat rule."""

        stored_value = await self._get_setting_payload(tenant_id=tenant_id, portal_name=PORTAL_NAME_INTERNAL, setting_key=SETTING_KEY_DELIVERY_PRICING, default=None)
        if not stored_value:
            return PortalDeliveryPricingResponse()
        return PortalDeliveryPricingResponse.model_validate(stored_value)

    async def _resolve_delivery_areas(self, *, tenant_id: str) -> PortalDeliveryAreasResponse:
        """Return the tenant's per-store delivery-area configuration, defaulting to zero-config (no restrictions)."""

        stored_value = await self._get_setting_payload(tenant_id=tenant_id, portal_name=PORTAL_NAME_INTERNAL, setting_key=SETTING_KEY_DELIVERY_AREAS, default=None)
        if not stored_value:
            return PortalDeliveryAreasResponse()
        try:
            return PortalDeliveryAreasResponse.model_validate(stored_value)
        except ValidationError:
            return PortalDeliveryAreasResponse()

    async def _resolve_marketplace_delivery_estimate(self, *, tenant_id: str | None) -> PortalMarketplaceDeliveryEstimateResponse:
        """Return the primary store's free-shipping threshold and a base fee estimate, mirroring the checkout fee resolution priority."""

        if not tenant_id:
            return PortalMarketplaceDeliveryEstimateResponse()
        areas = await self._resolve_delivery_areas(tenant_id=tenant_id)
        pricing = await self._resolve_delivery_pricing(tenant_id=tenant_id)
        primary_store_id = await InventoryRepository(self.session).get_primary_store_id(tenant_id=tenant_id)
        store_config = next((entry for entry in areas.stores if entry.store_id == primary_store_id), None)
        if store_config is not None and (store_config.neighborhoods or store_config.radius_tiers):
            fixed_fees = [
                entry.price.fixed_fee
                for entry in (*store_config.neighborhoods, *store_config.radius_tiers)
                if entry.is_active and entry.price.mode == 'fixed'
            ]
            base_fee = min(fixed_fees) if fixed_fees else pricing.fee_beyond_last_tier
            return PortalMarketplaceDeliveryEstimateResponse(free_above_subtotal=store_config.free_above_subtotal, base_fee=base_fee)
        base_fee = pricing.tiers[0].fee if pricing.tiers else pricing.fee_beyond_last_tier
        return PortalMarketplaceDeliveryEstimateResponse(free_above_subtotal=pricing.free_above_subtotal, base_fee=base_fee)

    async def _derive_marketplace_meta_from_listing(self, *, tenant_id: str | None) -> PortalMarketplaceMetaResponse:
        """Return marketplace metadata derived from published listings."""

        statement = select(MarketplaceListing).where(MarketplaceListing.is_published.is_(True))
        if tenant_id:
            statement = statement.where(MarketplaceListing.tenant_id == tenant_id)
        statement = statement.order_by(desc(MarketplaceListing.created_at))
        listing = (await self.session.execute(statement)).scalars().first()
        if listing is None:
            return PortalMarketplaceMetaResponse()
        return PortalMarketplaceMetaResponse(name=str(listing.marketplace_name or 'Marketplace Farmaura'), commission_percent=Decimal(listing.commission_percent or 0), payment_fee_percent=Decimal(listing.payment_fee_percent or 0), fixed_fee=Decimal(listing.fixed_fee or 0), minimum_margin_percent=Decimal(listing.target_margin_percent or 0), legal_name='', cnpj='', state_registration='', footer_note='Dados operacionais sincronizados do portal.')

    async def _list_health_services(self, *, tenant_id: str | None) -> list[PortalHealthServiceResponse]:
        """Return active health services from the database."""

        statement = select(HealthService).where(HealthService.is_active.is_(True))
        if tenant_id:
            statement = statement.where(HealthService.tenant_id == tenant_id)
        statement = statement.order_by(HealthService.service_group.asc(), HealthService.service_name.asc())
        services = (await self.session.execute(statement)).scalars().all()
        return [PortalHealthServiceResponse(id=service.id, name=service.service_name, group=service.service_group, icon=service.icon_name or 'activity', description=service.description, duration_label=service.duration_label, duration_minutes=int(service.duration_minutes or 0), price_amount=Decimal(service.price_amount or 0)) for service in services]

    async def _list_health_history(self, customer: Customer) -> list[PortalHealthHistoryResponse]:
        """Return persisted health service appointments for one customer."""

        statement = select(HealthServiceAppointment).where(HealthServiceAppointment.customer_id == customer.id, HealthServiceAppointment.tenant_id == customer.tenant_id).order_by(desc(HealthServiceAppointment.created_at))
        appointments = (await self.session.execute(statement)).scalars().all()
        return [PortalHealthHistoryResponse(id=appointment.id, service=appointment.service_name_snapshot, store=appointment.store_name_snapshot, professional=appointment.professional_name_snapshot, date=appointment.scheduled_date_label, time=appointment.scheduled_time_label, status='upcoming' if appointment.appointment_status == 'scheduled' else 'completed') for appointment in appointments]

    async def _fetch_saved_product_models(self, customer: Customer) -> list[SavedProduct]:
        """Return saved product models for one customer."""

        statement = select(SavedProduct).where(SavedProduct.customer_id == customer.id, SavedProduct.tenant_id == customer.tenant_id).order_by(desc(SavedProduct.created_at))
        return list((await self.session.execute(statement)).scalars().all())

    async def _list_saved_products(self, customer: Customer) -> list[PortalFavoriteResponse]:
        """Return serialized saved product references for one customer."""

        return [PortalFavoriteResponse(product_ref=self._saved_product_ref(item)) for item in await self._fetch_saved_product_models(customer=customer)]

    async def _fetch_subscription_models(self, customer: Customer) -> list[Subscription]:
        """Return subscription models for one customer."""

        statement = select(Subscription).where(Subscription.customer_id == customer.id, Subscription.tenant_id == customer.tenant_id).order_by(desc(Subscription.created_at))
        return list((await self.session.execute(statement)).scalars().all())

    async def _list_subscriptions(self, customer: Customer) -> list[PortalSubscriptionResponse]:
        """Return serialized subscriptions for one customer."""

        return [PortalSubscriptionResponse(product_ref=self._subscription_ref(item), quantity=int(item.quantity or 1), frequency_days=int(item.frequency_days or 30), is_paused=bool(item.is_paused), next_cycle_in_days=int(item.next_cycle_in_days or 0), started_at_label=item.started_at_label or '') for item in await self._fetch_subscription_models(customer=customer)]

    async def _list_coupon_campaigns(self, *, tenant_id: str, active_only: bool) -> list[PortalCouponResponse]:
        """Return coupon campaigns for one tenant."""

        if not tenant_id:
            return []
        statement = select(CouponCampaign).where(CouponCampaign.tenant_id == tenant_id)
        if active_only:
            statement = statement.where(CouponCampaign.is_active.is_(True))
        statement = statement.order_by(desc(CouponCampaign.created_at))
        campaigns = (await self.session.execute(statement)).scalars().all()
        return [self._serialize_coupon_campaign(item) for item in campaigns]

    async def _list_pricing_promotions(self, *, tenant_id: str) -> list[PortalPricingPromotionResponse]:
        """Return pricing promotions for one tenant."""

        if not tenant_id:
            return []
        statement = select(PricingPromotion).where(PricingPromotion.tenant_id == tenant_id).order_by(desc(PricingPromotion.created_at))
        promotions = (await self.session.execute(statement)).scalars().all()
        return [self._serialize_pricing_promotion(item) for item in promotions]

    async def _resolve_financial_settings(self, *, tenant_id: str) -> PortalFinancialSettingsResponse:
        """Return tenant-scoped financial settings, defaulting missing months to zero."""

        stored_value = await self._get_setting_payload(tenant_id=tenant_id, portal_name=PORTAL_NAME_INTERNAL, setting_key=SETTING_KEY_FINANCIAL_SETTINGS, default={'months': {}})
        stored_months = dict(stored_value.get('months', {}))
        current_month_key = datetime.now(tz=UTC).astimezone().strftime('%Y-%m')
        if current_month_key not in stored_months:
            stored_months[current_month_key] = dict(ZERO_FINANCIAL_MONTH)
        return PortalFinancialSettingsResponse.model_validate({'months': stored_months})

    async def _resolve_construction_costs(self, *, tenant_id: str) -> PortalConstructionCostsResponse:
        """Return per-store construction cost entries merged with real-sales ROI figures."""

        stored_value = await self._get_setting_payload(tenant_id=tenant_id, portal_name=PORTAL_NAME_INTERNAL, setting_key=SETTING_KEY_CONSTRUCTION_COSTS, default={'stores': {}})
        stored_stores = dict(stored_value.get('stores', {}))

        stores = await StoreRepository(self.session).list_stores(tenant_id=tenant_id, active_only=False)

        orders_statement = select(Order.store_id, Order.total_amount, Order.created_at).where(
            Order.tenant_id == tenant_id, Order.status.notin_(NON_REVENUE_ORDER_STATUSES),
        )
        pdv_statement = select(PdvSale.store_id, PdvSale.total_amount, PdvSale.created_at).where(
            PdvSale.tenant_id == tenant_id, PdvSale.sale_status == 'completed',
        )
        order_rows = (await self.session.execute(orders_statement)).all()
        pdv_rows = (await self.session.execute(pdv_statement)).all()
        sales_by_store: dict[str, list[tuple[Decimal, datetime]]] = {}
        for store_id, amount, created_at in [*order_rows, *pdv_rows]:
            sales_by_store.setdefault(store_id, []).append((amount, created_at))

        now = datetime.now(tz=UTC)
        result_stores: dict[str, PortalStoreConstructionCostsResponse] = {}
        for store in stores:
            raw_entry = stored_stores.get(store.id) or {}
            entry = PortalStoreConstructionCostsInput.model_validate(raw_entry)
            total_invested = sum((item.amount for item in entry.items), Decimal('0.00'))
            total_days = sum((item.days for item in entry.items), 0)

            opened_at = self._parse_iso_date(entry.opened_at)
            revenue_since_opening = Decimal('0.00')
            sales_count = 0
            months_since_opening = Decimal('0.00')
            avg_monthly_revenue = Decimal('0.00')
            estimated_profit_since_opening = Decimal('0.00')
            roi_pct: Decimal | None = None
            payback_months: Decimal | None = None
            if opened_at is not None:
                relevant = [amount for amount, created_at in sales_by_store.get(store.id, []) if created_at.astimezone().date() >= opened_at]
                revenue_since_opening = sum(relevant, Decimal('0.00'))
                sales_count = len(relevant)
                days_elapsed = max((now.astimezone().date() - opened_at).days, 0)
                months_since_opening = Decimal(max(days_elapsed, 1)) / Decimal('30.44')
                avg_monthly_revenue = revenue_since_opening / months_since_opening
                estimated_profit_since_opening = revenue_since_opening * entry.net_margin_pct / Decimal('100')
                if total_invested > 0:
                    roi_pct = (estimated_profit_since_opening - total_invested) / total_invested * Decimal('100')
                monthly_profit = avg_monthly_revenue * entry.net_margin_pct / Decimal('100')
                if total_invested > 0 and monthly_profit > 0:
                    payback_months = total_invested / monthly_profit

            result_stores[store.id] = PortalStoreConstructionCostsResponse(
                opened_at=entry.opened_at,
                construction_started_at=entry.construction_started_at,
                net_margin_pct=entry.net_margin_pct,
                items=entry.items,
                total_invested=total_invested,
                total_days=total_days,
                revenue_since_opening=revenue_since_opening,
                sales_count=sales_count,
                months_since_opening=months_since_opening,
                avg_monthly_revenue=avg_monthly_revenue,
                estimated_profit_since_opening=estimated_profit_since_opening,
                roi_pct=roi_pct,
                payback_months=payback_months,
            )
        return PortalConstructionCostsResponse(stores=result_stores)

    @staticmethod
    def _parse_iso_date(value: str) -> date | None:
        """Parse one 'YYYY-MM-DD' string into a date, or None when blank/invalid."""

        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None

    async def _build_chart_seed(self, *, tenant_id: str) -> dict[str, list[dict[str, int | str]]]:
        """Return hourly and weekly chart data derived from orders and PDV sales."""

        now = datetime.now(tz=UTC)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = day_start - timedelta(days=6)
        orders_statement = select(Order.created_at).where(Order.tenant_id == tenant_id, Order.created_at >= week_start)
        sales_statement = select(PdvSale.created_at).where(PdvSale.tenant_id == tenant_id, PdvSale.created_at >= week_start)
        order_rows = list((await self.session.execute(orders_statement)).scalars().all())
        sale_rows = list((await self.session.execute(sales_statement)).scalars().all())
        week_dates = [(day_start - timedelta(days=offset)).date() for offset in range(6, -1, -1)]
        week_counts = {item: 0 for item in week_dates}
        by_hour_counts = {hour: 0 for hour in range(8, 21)}
        for timestamp in [*order_rows, *sale_rows]:
            if timestamp is None:
                continue
            local_time = timestamp.astimezone()
            if local_time.date() in week_counts:
                week_counts[local_time.date()] += 1
            if local_time >= day_start.astimezone() and local_time.hour in by_hour_counts:
                by_hour_counts[local_time.hour] += 1
        return {
            'byHour': [{'h': f'{hour:02d}h', 'v': by_hour_counts[hour]} for hour in range(8, 21)],
            'week': [{'d': WEEKDAY_LABELS[item.weekday()], 'v': week_counts[item]} for item in week_dates],
        }

    async def _resolve_delivery_route(self, *, tenant_id: str, store: PortalStoreResponse) -> PortalDeliveryRouteResponse:
        """Return the active internal delivery route, or an empty hub-only snapshot."""

        route_statement = (
            select(DeliveryRoute)
            .where(DeliveryRoute.tenant_id == tenant_id, DeliveryRoute.route_status.in_(['planned', 'dispatched']))
            .order_by(desc(DeliveryRoute.created_at))
            .limit(1)
        )
        route = (await self.session.execute(route_statement)).scalar_one_or_none()
        if route is None:
            return PortalDeliveryRouteResponse(hub_name=store.name, hub_address=store.address)
        stops_statement = (
            select(DeliveryRouteStop, Order.order_code)
            .join(Order, Order.id == DeliveryRouteStop.order_id)
            .where(DeliveryRouteStop.route_id == route.id)
            .order_by(DeliveryRouteStop.stop_sequence)
        )
        stop_rows = (await self.session.execute(stops_statement)).all()
        stops = [
            PortalDeliveryRouteStopResponse(
                id=stop.id,
                order_id=stop.order_id,
                order_code=order_code or '',
                customer=stop.customer_name_snapshot,
                address=stop.address_line_snapshot,
                district=stop.district_snapshot,
                cep=stop.postal_code_snapshot,
                status=stop.stop_status,
                lat=stop.latitude,
                lng=stop.longitude,
                dist=stop.distance_from_origin_km,
                navigation_url=stop.navigation_url,
            )
            for stop, order_code in stop_rows
        ]
        return PortalDeliveryRouteResponse(
            id=route.id,
            code=route.route_code,
            status=route.route_status,
            driver=route.driver_name_snapshot,
            driver_user_id=route.driver_user_id or "",
            vehicle=route.vehicle_label,
            total_km=route.total_distance_km,
            total_min=route.estimated_duration_minutes,
            saved_km=route.saved_distance_km,
            provider=route.route_provider,
            hub_name=route.origin_name or store.name,
            hub_address=route.origin_address or store.address,
            hub_lat=route.origin_latitude,
            hub_lng=route.origin_longitude,
            stops=stops,
        )

    async def _build_product_review_collection(self, *, product_ref: str, inventory_ids: list[str], listing_id: str) -> PortalProductReviewCollectionResponse:
        """Return the review summary and comment list for one product scope."""

        statement = select(ProductReview).where(ProductReview.is_published.is_(True))
        predicates = [ProductReview.product_ref == product_ref]
        if inventory_ids:
            predicates.append(ProductReview.inventory_item_id.in_([item for item in inventory_ids if item]))
        if listing_id:
            predicates.append(ProductReview.marketplace_listing_id == listing_id)
        statement = statement.where(or_(*predicates)).order_by(desc(ProductReview.created_at))
        reviews = list((await self.session.execute(statement)).scalars().all())
        review_items = [PortalProductReviewResponse(id=item.id, product_ref=item.product_ref, reviewer_name=item.reviewer_name_snapshot, reviewer_avatar_initials=item.reviewer_avatar_initials, title=item.title, body=item.body, rating=int(item.rating or 0), helpful_count=int(item.helpful_count or 0), is_verified_purchase=bool(item.is_verified_purchase), submitted_at=item.submitted_at_label or self._format_datetime_label(item.created_at)) for item in reviews[:8]]
        if reviews:
            average = Decimal(sum(int(item.rating or 0) for item in reviews) / len(reviews)).quantize(Decimal('0.1'))
        else:
            average = Decimal('0.0')
        return PortalProductReviewCollectionResponse(product_ref=product_ref, rating_average=average, review_count=len(reviews), items=review_items)

    async def _resolve_review_purchase_match(self, *, customer: Customer, product_ref: str) -> tuple[str | None, str | None, str | None]:
        """Resolve whether the customer has a matching paid order for the reviewed product."""

        listing_id, inventory_id = self._split_product_ref(product_ref.strip())
        statement = select(OrderItem, Order).join(Order, Order.id == OrderItem.order_id).where(Order.tenant_id == customer.tenant_id, Order.customer_id == customer.id)
        if inventory_id:
            statement = statement.where(OrderItem.inventory_item_id == inventory_id)
        elif listing_id:
            statement = statement.where(OrderItem.marketplace_listing_id == listing_id)
        else:
            statement = statement.where(OrderItem.item_name_snapshot == product_ref.strip())
        row = (await self.session.execute(statement.order_by(desc(Order.created_at)))).first()
        if row is None:
            return None, inventory_id, listing_id
        order_item, order = row
        return order.id, order_item.inventory_item_id, order_item.marketplace_listing_id

    async def _get_setting_payload(self, *, tenant_id: str, portal_name: str, setting_key: str, default: dict | list | str | int | float | None) -> dict | list | str | int | float | None:
        """Return one decoded portal setting payload or the provided default."""

        statement = select(PortalSetting).where(PortalSetting.tenant_id == tenant_id, PortalSetting.portal_name == portal_name, PortalSetting.setting_key == setting_key)
        record = (await self.session.execute(statement)).scalar_one_or_none()
        if record is None:
            return default
        return self._json_load(record.value_json, default)

    async def _upsert_setting_payload(self, *, tenant_id: str, portal_name: str, setting_key: str, value: dict | list | str | int | float | None) -> None:
        """Create or update one portal setting payload."""

        statement = select(PortalSetting).where(PortalSetting.tenant_id == tenant_id, PortalSetting.portal_name == portal_name, PortalSetting.setting_key == setting_key)
        record = (await self.session.execute(statement)).scalar_one_or_none()
        if record is None:
            record = PortalSetting(tenant_id=tenant_id, portal_name=portal_name, setting_key=setting_key, value_json=self._json_dump(value))
            self.session.add(record)
            return
        record.value_json = self._json_dump(value)

    def _serialize_coupon_campaign(self, record: CouponCampaign) -> PortalCouponResponse:
        """Return one coupon campaign response payload."""

        return PortalCouponResponse(
            id=record.id,
            code=record.code,
            title=record.title,
            description=record.description,
            discount_type=record.discount_type,
            shipping_discount_mode=record.shipping_discount_mode,
            discount_value=Decimal(record.discount_value or 0),
            minimum_order_value=Decimal(record.minimum_order_value or 0),
            max_discount_value=Decimal(record.max_discount_value) if record.max_discount_value is not None else None,
            starts_at=record.starts_at_label,
            ends_at=record.ends_at_label,
            usage_limit=record.usage_limit,
            usage_count=int(record.usage_count or 0),
            per_customer_limit=int(record.per_customer_limit or 1),
            audience=record.audience,
            scope_type=record.scope_type,
            target_categories=self._json_load(record.target_categories_json, []),
            target_products=self._json_load(record.target_products_json, []),
            first_purchase_only=bool(record.first_purchase_only),
            stackable=bool(record.stackable),
            active=bool(record.is_active),
            notes=record.notes,
            created_at=self._serialize_datetime_iso(record.created_at),
            updated_at=self._serialize_datetime_iso(record.updated_at),
        )

    def _serialize_pricing_promotion(self, record: PricingPromotion) -> PortalPricingPromotionResponse:
        """Return one pricing promotion response payload."""

        return PortalPricingPromotionResponse(
            id=record.id,
            name=record.name,
            description=record.description,
            active=bool(record.is_active),
            discount_type=record.discount_type,
            discount_value=Decimal(record.discount_value or 0),
            max_discount_value=Decimal(record.max_discount_value) if record.max_discount_value is not None else None,
            scope_type=record.scope_type,
            target_categories=list(record.target_categories or []),
            target_products=list(record.target_products or []),
            starts_at=self._serialize_datetime_iso(record.starts_at),
            ends_at=self._serialize_datetime_iso(record.ends_at),
            daily_start_time=record.daily_start_time,
            daily_end_time=record.daily_end_time,
            days_of_week=list(record.days_of_week or []),
            min_age=record.min_age,
            max_age=record.max_age,
            regions=list(record.regions or []),
            device_types=list(record.device_types or []),
            marital_statuses=list(record.marital_statuses or []),
            min_children=record.min_children,
            max_children=record.max_children,
            customer_segment=record.customer_segment,
            priority=int(record.priority or 0),
            notes=record.notes,
            created_at=self._serialize_datetime_iso(record.created_at),
            updated_at=self._serialize_datetime_iso(record.updated_at),
        )

    def _apply_pricing_promotion_payload(self, record: PricingPromotion, payload: PortalPricingPromotionMutationRequest) -> None:
        """Copy one mutation payload onto a pricing promotion record."""

        record.name = payload.name.strip()
        record.description = payload.description.strip()
        record.is_active = payload.active
        record.discount_type = payload.discount_type
        record.discount_value = payload.discount_value
        record.max_discount_value = payload.max_discount_value
        record.scope_type = payload.scope_type
        record.target_categories = list(payload.target_categories)
        record.target_products = list(payload.target_products)
        record.starts_at = self._parse_promotion_datetime(payload.starts_at)
        record.ends_at = self._parse_promotion_datetime(payload.ends_at)
        record.daily_start_time = payload.daily_start_time.strip()
        record.daily_end_time = payload.daily_end_time.strip()
        record.days_of_week = list(payload.days_of_week)
        record.min_age = payload.min_age
        record.max_age = payload.max_age
        record.regions = list(payload.regions)
        record.device_types = list(payload.device_types)
        record.marital_statuses = list(payload.marital_statuses)
        record.min_children = payload.min_children
        record.max_children = payload.max_children
        record.customer_segment = payload.customer_segment
        record.priority = payload.priority
        record.notes = payload.notes.strip()

    def _parse_promotion_datetime(self, value: str) -> datetime | None:
        """Return one timezone-aware datetime parsed from a datetime-local string, if any."""

        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
        return parsed if parsed.tzinfo is not None else parsed.astimezone()

    def _saved_product_ref(self, record: SavedProduct) -> str:
        """Return the product reference used by the frontend for one saved product."""

        if record.inventory_item_id:
            return 'inv-' + str(record.inventory_item_id)
        if record.marketplace_listing_id:
            return 'listing-' + str(record.marketplace_listing_id)
        return str(record.product_name_snapshot or record.id)

    def _subscription_ref(self, record: Subscription) -> str:
        """Return the product reference used by the frontend for one subscription."""

        if record.inventory_item_id:
            return 'inv-' + str(record.inventory_item_id)
        if record.marketplace_listing_id:
            return 'listing-' + str(record.marketplace_listing_id)
        return str(record.product_name_snapshot or record.id)

    def _split_product_ref(self, product_ref: str) -> tuple[str | None, str | None]:
        """Split one frontend product reference into persisted foreign keys."""

        if product_ref.startswith('inv-'):
            return None, product_ref[4:]
        if product_ref.startswith('listing-'):
            return product_ref[8:], None
        return None, product_ref

    def _normalize_coupon_code(self, value: str) -> str:
        """Return a normalized coupon code identifier."""

        normalized = ''.join(character for character in str(value or '').upper().strip() if character.isalnum() or character in {'_', '-'})
        if not normalized:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Coupon code is required.')
        return normalized[:24]

    def _category_icon(self, category_id: str) -> str:
        """Return the icon name for one normalized category identifier."""

        if 'perfum' in category_id or 'beleza' in category_id:
            return 'sparkle'
        if 'bem' in category_id or 'suplement' in category_id or 'vitamin' in category_id:
            return 'leaf'
        if 'higiene' in category_id or 'cuidado' in category_id or 'infantil' in category_id:
            return 'heart'
        return 'pill'

    def _initials(self, value: str) -> str:
        """Return a short avatar-style initials string."""

        parts = [part for part in str(value or '').strip().split() if part]
        return ''.join(part[0] for part in parts[:2]).upper() or 'FA'

    def _json_dump(self, value: object) -> str:
        """Return one compact JSON string."""

        return json.dumps(value, ensure_ascii=True, separators=(',', ':'))

    def _json_load(self, raw: str | None, default: object) -> object:
        """Return one decoded JSON payload or the provided default."""

        if not raw:
            return default
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default

    def _serialize_datetime_iso(self, value: datetime | None) -> str:
        """Return one ISO string for a timestamp when available."""

        if value is None:
            return ''
        return value.astimezone().isoformat(timespec='seconds')

    def _format_datetime_label(self, value: datetime | None) -> str:
        """Return one friendly date label when available."""

        if value is None:
            return ''
        return value.astimezone().strftime('%d/%m/%Y')
