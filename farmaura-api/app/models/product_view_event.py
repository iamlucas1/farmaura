"""
farmaura-api/app/models/product_view_event.py

Product view event ORM model for Farmaura.

Responsibilities:
- log one marketplace product-detail page view by an identified customer;
- feed a browsing-interest signal into the PDV upsell engine
  (PurchaseHistoryService), alongside real purchases, favorites, and
  back-in-stock requests — a customer who keeps looking at a product without
  buying it yet is still a real cross-sell signal.

Observations:
- logged only for authenticated marketplace customers — anonymous browsing
  carries no customer_id to attribute a signal to, so it is never logged;
- inventory_product_id links to the canonical cross-store product
  (InventoryProduct), the same "prod-<id>" alias the marketplace frontend
  already carries per product — no name/brand matching needed to resolve
  this signal back to a real product later, unlike several other
  demand-signal tables in this codebase that only kept a name snapshot.
"""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRODUCT VIEW EVENT MODEL
# ============================================================================


class ProductViewEvent(Base, UuidModel, TimestampedModel):
    """Persist one customer's view of one product's detail page."""

    __tablename__ = "product_view_events"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    inventory_product_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    product_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
