"""
farmaura-api/app/services/fiscal_profile_service.py

Product fiscal profile service for Farmaura.

Responsibilities:
- read and write the tax classification (NCM, CFOP, CST/CSOSN, PIS/COFINS, IBS/CBS...) of a product;
- report whether a profile is complete for the configured tax regime, and exactly what is missing;

Observations:
- this service only stores what accounting provides: it never suggests or derives a tax treatment;
- an incomplete profile may be saved (accounting can fill it gradually) but it blocks emission of any sale that
  contains the product, with the missing fields listed for the operator;
- writes are admin-only at the route and recorded with the acting user;
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.fiscal_config import get_fiscal_settings
from app.fiscal.inputs import TaxProfile
from app.fiscal.xml_builder import missing_tax_fields
from app.models.fiscal_support_tables import ProductFiscalProfile
from app.models.inventory_product import InventoryProduct
from app.repositories.fiscal_repository import FiscalRepository
from app.schemas.fiscal import ProductFiscalProfileRequest, ProductFiscalProfileResponse

_FIELDS = (
    "ncm", "cest", "cfop", "origin", "commercial_unit", "icms_cst", "icms_csosn", "icms_rate", "pis_cst", "pis_rate",
    "cofins_cst", "cofins_rate", "cbenef", "ibscbs_cst", "ibscbs_cclasstrib", "ibscbs_has_tax_group", "ibs_uf_rate",
    "ibs_mun_rate", "cbs_rate", "notes",
)


class FiscalProfileService:
    """Provide product fiscal profile lookups and writes."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repository = FiscalRepository(session)
        self.fiscal = get_fiscal_settings()

    async def _get_product(self, product_id: str) -> InventoryProduct:
        product = await self.session.get(InventoryProduct, product_id)
        if product is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
        return product

    async def get_profile(self, *, product_id: str) -> ProductFiscalProfileResponse:
        """Return the stored profile, or an empty one listing everything missing."""

        await self._get_product(product_id)
        profile = await self.repository.get_profile(product_id)
        return self._to_response(product_id, profile)

    async def upsert_profile(
        self, *, tenant_id: str, product_id: str, payload: ProductFiscalProfileRequest, actor_user_id: str,
    ) -> ProductFiscalProfileResponse:
        """Create or update the profile of one product of the caller's tenant."""

        product = await self._get_product(product_id)
        if str(product.tenant_id) != tenant_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
        if payload.icms_cst and payload.icms_csosn:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Informe CST do ICMS ou CSOSN, nunca os dois.")
        profile = await self.repository.get_profile(product_id)
        if profile is None:
            profile = ProductFiscalProfile(id=str(uuid4()), tenant_id=tenant_id, product_id=product_id)
            for name in _FIELDS:
                setattr(profile, name, getattr(payload, name))
            profile.updated_by_user_id = actor_user_id
            await self.repository.add_profile(profile)
        else:
            for name in _FIELDS:
                setattr(profile, name, getattr(payload, name))
            profile.updated_by_user_id = actor_user_id
            profile.updated_at = datetime.now(UTC)
        await self.session.commit()
        return self._to_response(product_id, profile)

    def _to_response(self, product_id: str, profile: ProductFiscalProfile | None) -> ProductFiscalProfileResponse:
        values = {name: getattr(profile, name) if profile is not None else ProductFiscalProfileRequest.model_fields[name].default for name in _FIELDS}
        for name in ("ncm", "cfop", "origin", "commercial_unit", "pis_cst", "cofins_cst"):
            values[name] = values[name] or ""
        tax = TaxProfile(
            ncm=values["ncm"], cest=values["cest"], cfop=values["cfop"], origin=values["origin"],
            unit=values["commercial_unit"], icms_cst=values["icms_cst"], icms_csosn=values["icms_csosn"],
            icms_rate=values["icms_rate"], pis_cst=values["pis_cst"], pis_rate=values["pis_rate"],
            cofins_cst=values["cofins_cst"], cofins_rate=values["cofins_rate"], cbenef=values["cbenef"],
            ibscbs_cst=values["ibscbs_cst"], ibscbs_cclasstrib=values["ibscbs_cclasstrib"],
            ibscbs_has_tax_group=values["ibscbs_has_tax_group"], ibs_uf_rate=values["ibs_uf_rate"],
            ibs_mun_rate=values["ibs_mun_rate"], cbs_rate=values["cbs_rate"],
        )
        missing = missing_tax_fields(tax, crt=self.fiscal.nfce_crt)
        return ProductFiscalProfileResponse.model_construct(
            product_id=product_id, complete=not missing, missing=missing, **values,
        )
