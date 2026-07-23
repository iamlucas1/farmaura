"""
farmaura-api/app/api/router.py

Root API router composition for Farmaura.

Responsibilities:
- aggregate versioned route modules;
- define shared tags and mounting order;
- keep API registration explicit and auditable;

Observations:
- routes are mounted under the configured v1 prefix in app.main;
- each module exposes a dedicated router instance;
"""

from fastapi import APIRouter

from app.api.v1 import (
    ai,
    auth,
    brands,
    cart,
    catalog,
    categories,
    chat,
    crm,
    customers,
    deliveries,
    fiscal,
    health,
    inventory,
    inventory_lots,
    orders,
    payments,
    pdv,
    portal,
    prescriptions,
    products,
    purchase_analytics,
    purchase_quotes,
    stores,
    suppliers,
    team,
    therapeutic_classes,
    uploads,
)

# ============================================================================
# ROUTER COMPOSITION
# ============================================================================


api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(cart.router, prefix="/cart", tags=["cart"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(prescriptions.router, prefix="/prescriptions", tags=["prescriptions"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(
    purchase_quotes.router, prefix="/purchase-quotes", tags=["purchase-quotes"]
)
api_router.include_router(
    purchase_analytics.router, prefix="/purchase-analytics", tags=["purchase-analytics"]
)
api_router.include_router(brands.router, prefix="/brands", tags=["brands"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(
    therapeutic_classes.router, prefix="/therapeutic-classes", tags=["therapeutic-classes"]
)
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(inventory_lots.router, prefix="/inventory", tags=["inventory-lots"])
api_router.include_router(deliveries.router, prefix="/deliveries", tags=["deliveries"])
api_router.include_router(fiscal.router, prefix="/fiscal-documents", tags=["fiscal-documents"])
api_router.include_router(crm.router, prefix="/crm", tags=["crm"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(pdv.router, prefix="/pdv", tags=["pdv"])
api_router.include_router(portal.router, prefix="/portal", tags=["portal"])
api_router.include_router(stores.router, prefix="/stores", tags=["stores"])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["suppliers"])
api_router.include_router(team.router, prefix="/team", tags=["team"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
