"""
farmaura-api/app/core/pricing.py

Shared purchase-quote pricing helpers for Farmaura.

Responsibilities:
- compute the best effective price for a quoted line given its payment terms;

Observations:
- both the supplier comparison view (purchase_quote_service) and the purchase
  analytics/suggestion view (purchase_analytics_service) need this exact
  calculation, so it lives here instead of being duplicated.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Protocol


class _PaymentTermLike(Protocol):
    """Structural type for anything exposing a payment method and discount."""

    method: str
    discount_percent: Decimal | None


def best_payment_offer(
    unit_price: Decimal, payment_terms: Sequence[_PaymentTermLike]
) -> tuple[Decimal, str, Decimal]:
    """Return (effective_price, best_method, best_discount_percent) for a quoted unit price."""

    best_method = ""
    best_discount = Decimal("0.00")
    for term in payment_terms:
        discount = term.discount_percent or Decimal("0.00")
        if discount > best_discount:
            best_discount = discount
            best_method = term.method
    effective_price = (
        unit_price * (Decimal("100.00") - best_discount) / Decimal("100.00")
    ).quantize(Decimal("0.01"))
    return effective_price, best_method, best_discount


def payment_offers(
    unit_price: Decimal, payment_terms: Sequence[_PaymentTermLike]
) -> list[tuple[str, Decimal, Decimal]]:
    """Return (method, effective_price, discount_percent) for every offered payment term.

    Used where the caller needs the price for a *specific* payment method (e.g. the supplier
    comparison view recalculating "best offer" once the user filters by one method), not just the
    single overall-best one returned by best_payment_offer.
    """

    offers: list[tuple[str, Decimal, Decimal]] = []
    for term in payment_terms:
        discount = term.discount_percent or Decimal("0.00")
        effective_price = (
            unit_price * (Decimal("100.00") - discount) / Decimal("100.00")
        ).quantize(Decimal("0.01"))
        offers.append((term.method, effective_price, discount))
    return offers
