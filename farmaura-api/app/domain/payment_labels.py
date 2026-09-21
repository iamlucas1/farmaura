"""
farmaura-api/app/domain/payment_labels.py

Human-readable payment method labels for online (marketplace) orders.

Responsibilities:
- map the raw payment method values orders are stored/created with to the
  Portuguese label shown to the customer;
- give order_service.py and scripts/seed.py one shared source of truth,
  so a demo/seed order can never end up with a raw method key ("credit_card")
  displayed as its label instead of "Cartão de crédito";

Observations:
- covers online checkout methods (app.schemas.orders.CheckoutPaymentRequest,
  pattern pix|credit_card|debit_card|pickup_cash) plus "cash", which only
  appears in seed data variety, never in a real online checkout payload;
- PDV/counter sales have their own "(balcão)" label set in pdv_service.py —
  deliberately not merged here, since "Cartão de crédito" (online) and
  "Cartão de crédito (balcão)" (counter) are different customer-facing facts.
"""

ONLINE_PAYMENT_METHOD_LABELS = {
    "pix": "Pix",
    "credit_card": "Cartão de crédito",
    "debit_card": "Cartão de débito",
    "pickup_cash": "Pagamento na retirada",
    "cash": "Dinheiro",
}


def build_online_payment_label(method: str) -> str:
    """Return the customer-facing Portuguese label for an online order's payment method."""

    return ONLINE_PAYMENT_METHOD_LABELS.get(method, "Pagamento")
