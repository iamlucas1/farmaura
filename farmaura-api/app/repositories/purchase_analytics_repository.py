"""
farmaura-api/app/repositories/purchase_analytics_repository.py

Purchase analytics repository for Farmaura.

Responsibilities:
- aggregate realized demand (online orders + PDV sales) per product per month,
  for ABC/XYZ classification;
- expose current tenant-wide stock and product identity lookups needed to
  build the purchase-planning view;

Observations:
- demand is aggregated at the InventoryProduct level (shared across stores),
  matching how purchase_quotes are tenant-wide rather than store-scoped;
- only paid, non-cancelled online orders count as realized demand; every
  PdvSale already represents a completed, paid sale (pdv_service only ever
  creates them with sale_status="completed"/payment_status="paid"), so no
  extra status filter is needed on that side.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_item import InventoryItem
from app.models.inventory_product import InventoryProduct
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem

# ============================================================================
# VALUE OBJECTS
# ============================================================================


@dataclass(frozen=True, slots=True)
class MonthlySalesRow:
    """Represent realized demand for one product in one calendar month."""

    product_id: str
    month: date
    quantity: int
    revenue: Decimal


# ============================================================================
# PURCHASE ANALYTICS REPOSITORY
# ============================================================================


class PurchaseAnalyticsRepository:
    """Aggregate realized demand and stock data for purchase planning."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def monthly_sales_by_product(
        self,
        *,
        tenant_id: str,
        since: datetime,
        category_id: str = "",
    ) -> list[MonthlySalesRow]:
        """Return monthly quantity/revenue totals per product from orders and PDV sales."""

        order_bucket = func.date_trunc("month", OrderItem.created_at).label("bucket")
        order_statement = (
            select(
                InventoryItem.product_id,
                order_bucket,
                func.sum(OrderItem.quantity).label("quantity"),
                func.sum(OrderItem.line_total).label("revenue"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .join(InventoryItem, InventoryItem.id == OrderItem.inventory_item_id)
            .join(InventoryProduct, InventoryProduct.id == InventoryItem.product_id)
            .where(
                Order.tenant_id == tenant_id,
                Order.status != "cancelled",
                Order.payment_status == "paid",
                OrderItem.inventory_item_id.is_not(None),
                OrderItem.created_at >= since,
            )
            .group_by(InventoryItem.product_id, order_bucket)
        )
        pdv_bucket = func.date_trunc("month", PdvSaleItem.created_at).label("bucket")
        pdv_statement = (
            select(
                InventoryItem.product_id,
                pdv_bucket,
                func.sum(PdvSaleItem.quantity).label("quantity"),
                func.sum(PdvSaleItem.line_total).label("revenue"),
            )
            .join(PdvSale, PdvSale.id == PdvSaleItem.pdv_sale_id)
            .join(InventoryItem, InventoryItem.id == PdvSaleItem.inventory_item_id)
            .join(InventoryProduct, InventoryProduct.id == InventoryItem.product_id)
            .where(
                PdvSale.tenant_id == tenant_id,
                PdvSaleItem.inventory_item_id.is_not(None),
                PdvSaleItem.created_at >= since,
            )
            .group_by(InventoryItem.product_id, pdv_bucket)
        )
        if category_id:
            order_statement = order_statement.where(InventoryProduct.category_id == category_id)
            pdv_statement = pdv_statement.where(InventoryProduct.category_id == category_id)

        order_rows = (await self.session.execute(order_statement)).all()
        pdv_rows = (await self.session.execute(pdv_statement)).all()

        quantity_by_key: dict[tuple[str, date], int] = defaultdict(int)
        revenue_by_key: dict[tuple[str, date], Decimal] = defaultdict(lambda: Decimal("0.00"))
        for product_id, bucket, quantity, revenue in [*order_rows, *pdv_rows]:
            month = bucket.date() if isinstance(bucket, datetime) else bucket
            key = (product_id, month)
            quantity_by_key[key] += int(quantity or 0)
            revenue_by_key[key] += Decimal(revenue or 0)

        rows: list[MonthlySalesRow] = []
        for key, quantity in quantity_by_key.items():
            product_id, month = key
            rows.append(
                MonthlySalesRow(
                    product_id=product_id,
                    month=month,
                    quantity=quantity,
                    revenue=revenue_by_key[key],
                )
            )
        return rows

    async def current_stock_by_product(self, *, tenant_id: str) -> dict[str, int]:
        """Return the tenant-wide current stock quantity for every active product."""

        statement = (
            select(InventoryItem.product_id, func.sum(InventoryItem.quantity))
            .where(InventoryItem.tenant_id == tenant_id, InventoryItem.is_active.is_(True))
            .group_by(InventoryItem.product_id)
        )
        result = await self.session.execute(statement)
        return {product_id: int(quantity or 0) for product_id, quantity in result.all()}

    async def product_identity_by_ids(
        self, *, tenant_id: str, product_ids: list[str]
    ) -> dict[str, InventoryProduct]:
        """Return catalog product identity (name/category/brand) for the given product ids."""

        if not product_ids:
            return {}
        statement = select(InventoryProduct).where(
            InventoryProduct.tenant_id == tenant_id,
            InventoryProduct.id.in_(product_ids),
        )
        result = await self.session.execute(statement)
        return {product.id: product for product in result.scalars().unique().all()}
