"""
farmaura-api/app/services/customer_loyalty_service.py

Customer purchase-history bookkeeping for Farmaura.

Responsibilities:
- keep Customer.orders_count/total_spent/average_ticket/is_recurring/loyalty_tier in sync
  with real purchase activity, recomputed at the same commit an order is created;

Observations:
- before this existed, these fields were only set once at customer creation and never
  updated again — silently breaking new_customers/recurring targeting on PricingPromotion
  and leaving loyalty_tier stuck at "Novo" forever. See dev-obsidian ADR for this session.
"""

from __future__ import annotations

from decimal import Decimal

from app.models.customer import Customer
from app.services.marketplace_projection import quantize_money
from app.services.pricing_promotion_service import compute_loyalty_tier


# ============================================================================
# PURCHASE BOOKKEEPING
# ============================================================================


def record_customer_purchase(customer: Customer, *, order_total: Decimal) -> None:
    """Update one customer's purchase history counters after a new order is placed."""

    customer.orders_count = int(customer.orders_count or 0) + 1
    customer.total_spent = quantize_money(Decimal(customer.total_spent or 0) + order_total)
    customer.average_ticket = quantize_money(customer.total_spent / customer.orders_count)
    customer.is_recurring = customer.orders_count >= 2
    customer.loyalty_tier = compute_loyalty_tier(customer.orders_count)
