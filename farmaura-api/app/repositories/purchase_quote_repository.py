"""
farmaura-api/app/repositories/purchase_quote_repository.py

Purchase quote repository for Farmaura.

Responsibilities:
- persist tenant-scoped purchase quotes (orçamentos de compra) and their
  payment terms/items;
- expose filtered read models for the internal console list/compare screens;
- suggest catalog product and supplier matches for AI-extracted quote lines,
  never creating or mutating those records itself;

Observations:
- business validation remains in services even when repository queries are rich;
"""

from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory_product import InventoryProduct
from app.models.purchase_quote import PurchaseQuote
from app.models.purchase_quote_item import PurchaseQuoteItem
from app.models.purchase_quote_payment_term import PurchaseQuotePaymentTerm
from app.models.supplier import Supplier

# ============================================================================
# PURCHASE QUOTE REPOSITORY
# ============================================================================


class PurchaseQuoteRepository:
    """Provide purchase quote persistence and lookup operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_quotes(
        self,
        *,
        tenant_id: str,
        supplier_id: str = "",
        product_query: str = "",
        date_from: date | None = None,
        date_to: date | None = None,
        payment_method: str = "",
        freight_type: str = "",
        status: str = "",
    ) -> list[PurchaseQuote]:
        """Return tenant purchase quotes, optionally filtered for the list screen."""

        statement: Select[tuple[PurchaseQuote]] = (
            select(PurchaseQuote)
            .options(selectinload(PurchaseQuote.items), selectinload(PurchaseQuote.payment_terms))
            .where(PurchaseQuote.tenant_id == tenant_id)
        )
        if supplier_id:
            statement = statement.where(PurchaseQuote.supplier_id == supplier_id)
        if date_from:
            statement = statement.where(PurchaseQuote.quote_date >= date_from)
        if date_to:
            statement = statement.where(PurchaseQuote.quote_date <= date_to)
        if freight_type:
            statement = statement.where(PurchaseQuote.freight_type == freight_type)
        if status:
            statement = statement.where(PurchaseQuote.status == status)
        if product_query:
            pattern = "%" + product_query.strip().lower() + "%"
            statement = statement.where(
                PurchaseQuote.id.in_(
                    select(PurchaseQuoteItem.quote_id).where(
                        PurchaseQuoteItem.tenant_id == tenant_id,
                        or_(
                            func.lower(PurchaseQuoteItem.description).like(pattern),
                            func.lower(PurchaseQuoteItem.brand_name).like(pattern),
                            func.lower(PurchaseQuoteItem.sku_snapshot).like(pattern),
                            func.lower(PurchaseQuoteItem.ean_code_snapshot).like(pattern),
                        ),
                    )
                )
            )
        if payment_method:
            statement = statement.where(
                PurchaseQuote.id.in_(
                    select(PurchaseQuotePaymentTerm.quote_id).where(
                        PurchaseQuotePaymentTerm.tenant_id == tenant_id,
                        PurchaseQuotePaymentTerm.method == payment_method,
                    )
                )
            )
        statement = statement.order_by(
            PurchaseQuote.quote_date.desc(), PurchaseQuote.created_at.desc()
        )
        result = await self.session.execute(statement)
        return list(result.scalars().unique().all())

    async def get_by_id(self, *, tenant_id: str, quote_id: str) -> PurchaseQuote | None:
        """Return a purchase quote by identifier for the tenant, with its terms and items loaded."""

        statement = (
            select(PurchaseQuote)
            .options(selectinload(PurchaseQuote.items), selectinload(PurchaseQuote.payment_terms))
            .where(PurchaseQuote.id == quote_id, PurchaseQuote.tenant_id == tenant_id)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_quote(self, quote: PurchaseQuote) -> PurchaseQuote:
        """Persist a new purchase quote (with its terms/items already attached)."""

        self.session.add(quote)
        await self.session.flush()
        await self.session.refresh(quote, attribute_names=["items", "payment_terms"])
        return quote

    async def search_candidate_products(
        self,
        *,
        tenant_id: str,
        query: str,
        ean_code: str = "",
        limit: int = 6,
    ) -> list[InventoryProduct]:
        """Return likely catalog product matches for a quoted line, for reference only."""

        cleaned_ean = str(ean_code or "").strip()
        cleaned_query = str(query or "").strip().lower()
        statement = select(InventoryProduct).where(
            InventoryProduct.tenant_id == tenant_id,
            InventoryProduct.is_active.is_(True),
        )
        if cleaned_ean:
            statement = statement.where(InventoryProduct.ean_code == cleaned_ean)
        elif cleaned_query:
            pattern = "%" + cleaned_query + "%"
            statement = statement.where(
                or_(
                    func.lower(InventoryProduct.name).like(pattern),
                    func.lower(InventoryProduct.sku).like(pattern),
                )
            )
        else:
            return []
        statement = statement.order_by(InventoryProduct.name.asc()).limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().unique().all())

    async def find_supplier_match(
        self, *, tenant_id: str, cnpj: str, name: str
    ) -> Supplier | None:
        """Suggest an existing supplier match for an extracted quote header, by CNPJ then name."""

        cleaned_cnpj = str(cnpj or "").strip()
        if cleaned_cnpj:
            statement = select(Supplier).where(
                Supplier.tenant_id == tenant_id, Supplier.cnpj == cleaned_cnpj
            )
            result = await self.session.execute(statement)
            match = result.scalar_one_or_none()
            if match is not None:
                return match
        cleaned_name = str(name or "").strip().lower()
        if not cleaned_name:
            return None
        statement = select(Supplier).where(
            Supplier.tenant_id == tenant_id,
            or_(
                func.lower(Supplier.legal_name) == cleaned_name,
                func.lower(Supplier.trade_name) == cleaned_name,
            ),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def compare_items_by_product(
        self,
        *,
        tenant_id: str,
        product_id: str = "",
        brand_name: str = "",
        query: str = "",
    ) -> list[tuple[PurchaseQuoteItem, PurchaseQuote]]:
        """Return quoted lines matching a product/brand/text filter, paired with their quote header.

        Priority: exact `product_id` match, then case-insensitive exact `brand_name` match, then the
        free-text `query` fallback. When none of the three is given, returns every confirmed quoted
        line for the tenant — the compare screen's default "show everything" view.
        """

        statement = (
            select(PurchaseQuoteItem, PurchaseQuote)
            .join(PurchaseQuote, PurchaseQuote.id == PurchaseQuoteItem.quote_id)
            .options(selectinload(PurchaseQuote.payment_terms))
            .where(
                PurchaseQuoteItem.tenant_id == tenant_id,
                PurchaseQuote.status == "confirmed",
            )
        )
        cleaned_product_id = product_id.strip()
        cleaned_brand_name = brand_name.strip()
        cleaned_query = query.strip()
        if cleaned_product_id:
            statement = statement.where(PurchaseQuoteItem.product_id == cleaned_product_id)
        elif cleaned_brand_name:
            statement = statement.where(
                func.lower(PurchaseQuoteItem.brand_name) == cleaned_brand_name.lower()
            )
        elif cleaned_query:
            pattern = "%" + cleaned_query.lower() + "%"
            statement = statement.where(
                or_(
                    func.lower(PurchaseQuoteItem.description).like(pattern),
                    func.lower(PurchaseQuoteItem.brand_name).like(pattern),
                    func.lower(PurchaseQuoteItem.sku_snapshot).like(pattern),
                    func.lower(PurchaseQuoteItem.ean_code_snapshot).like(pattern),
                )
            )
        statement = statement.order_by(PurchaseQuote.quote_date.desc())
        result = await self.session.execute(statement)
        return [(row[0], row[1]) for row in result.unique().all()]

    async def list_confirmed_items_by_product_ids(
        self,
        *,
        tenant_id: str,
        product_ids: list[str],
        as_of: date,
    ) -> list[tuple[PurchaseQuoteItem, PurchaseQuote]]:
        """Return confirmed, non-expired quoted lines linked to any of the given catalog products.

        Used to find the best active offer per product for purchase suggestions — only items an
        operator explicitly linked to a catalog product during quote review are matched here.
        """

        if not product_ids:
            return []
        statement = (
            select(PurchaseQuoteItem, PurchaseQuote)
            .join(PurchaseQuote, PurchaseQuote.id == PurchaseQuoteItem.quote_id)
            .options(selectinload(PurchaseQuote.payment_terms))
            .where(
                PurchaseQuoteItem.tenant_id == tenant_id,
                PurchaseQuoteItem.product_id.in_(product_ids),
                PurchaseQuote.status == "confirmed",
                or_(PurchaseQuote.valid_until.is_(None), PurchaseQuote.valid_until >= as_of),
            )
        )
        result = await self.session.execute(statement)
        return [(row[0], row[1]) for row in result.unique().all()]
