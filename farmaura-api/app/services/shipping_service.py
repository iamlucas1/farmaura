"""
farmaura-api/app/services/shipping_service.py

Real carrier shipping service for Farmaura, backed by Melhor Envio.

Responsibilities:
- quote a real shipping rate from one store to one customer address at checkout;
- purchase the shipment and generate a real tracking code + label at dispatch time;
- expose tracking lookups for customer/staff order status.

Observations:
- package weight/dimensions use a fixed default per order (see DEFAULT_PACKAGE_*)
  since InventoryItem has no per-product weight/dimension fields yet — real
  per-product freight calculation is a natural follow-up once that data exists;
- purchasing a shipment is a multi-step Melhor Envio flow (cart -> checkout ->
  generate -> print), then tracking is queried separately once dispatched.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from app.core.config import get_settings
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.store import Store
from app.services.melhor_envio_client import MelhorEnvioClient, MelhorEnvioError

DEFAULT_PACKAGE_WEIGHT_KG = Decimal("0.30")
DEFAULT_PACKAGE_HEIGHT_CM = 4
DEFAULT_PACKAGE_WIDTH_CM = 12
DEFAULT_PACKAGE_LENGTH_CM = 17


def _digits(value: str) -> str:
    """Return only the digit characters of one free-form postal code string."""

    return "".join(character for character in str(value or "") if character.isdigit())


def _address_payload(
    *, name: str, document: str, phone: str, postal_code: str, address: str, district: str, city: str, state_abbr: str,
) -> dict[str, Any]:
    """Return one Melhor Envio from/to address payload."""

    return {
        "name": name or "Farmaura",
        "document": _digits(document),
        "phone": _digits(phone),
        "address": address,
        "district": district,
        "city": city,
        "state_abbr": (state_abbr or "").upper(),
        "postal_code": _digits(postal_code),
        "country_id": "BR",
    }


# ============================================================================
# SHIPPING SERVICE
# ============================================================================


@dataclass(frozen=True, slots=True)
class ShippingQuote:
    """Represent one real Melhor Envio shipping quote."""

    service_id: str
    service_name: str
    price: Decimal
    delivery_days: int


@dataclass(frozen=True, slots=True)
class ShippingPurchaseResult:
    """Represent the outcome of buying and labeling one real shipment."""

    tracking_code: str
    label_url: str
    provider_order_id: str
    carrier_name: str


class ShippingService:
    """Provide real carrier shipping quote, purchase, and tracking use-cases."""

    def __init__(self) -> None:
        """Build the underlying Melhor Envio client."""

        self.client = MelhorEnvioClient()

    def quote(self, *, origin_postal_code: str, destination_postal_code: str) -> ShippingQuote | None:
        """Return the cheapest real shipping quote for the default package size, or None if unavailable."""

        try:
            options = self.client.calculate_shipment({
                "from": {"postal_code": _digits(origin_postal_code)},
                "to": {"postal_code": _digits(destination_postal_code)},
                "package": {
                    "height": DEFAULT_PACKAGE_HEIGHT_CM,
                    "width": DEFAULT_PACKAGE_WIDTH_CM,
                    "length": DEFAULT_PACKAGE_LENGTH_CM,
                    "weight": float(DEFAULT_PACKAGE_WEIGHT_KG),
                },
            })
        except MelhorEnvioError:
            return None
        viable = [option for option in options if not option.get("error") and option.get("price")]
        if not viable:
            return None
        cheapest = min(viable, key=lambda option: Decimal(str(option["price"])))
        return ShippingQuote(
            service_id=str(cheapest.get("id") or ""),
            service_name=str(cheapest.get("name") or "Transportadora"),
            price=Decimal(str(cheapest["price"])),
            delivery_days=int(cheapest.get("delivery_time") or 0),
        )

    def purchase_and_label(
        self, *, service_id: str, store: Store, fulfillment: OrderFulfillment, order: Order,
    ) -> ShippingPurchaseResult:
        """Buy the real shipment, generate its label, and return the tracking result."""

        cart_response = self.client.add_to_cart({
            "service": service_id,
            "from": _address_payload(
                name=store.name,
                document=get_settings().melhor_envio_from_document,
                phone="",
                postal_code=store.postal_code,
                address=store.address_line,
                district=store.district,
                city=store.city,
                state_abbr=store.state_code,
            ),
            "to": _address_payload(
                name=fulfillment.recipient_name,
                document=fulfillment.recipient_document_snapshot,
                phone=fulfillment.recipient_phone,
                postal_code=fulfillment.postal_code,
                address=fulfillment.address_line,
                district=fulfillment.district,
                city=fulfillment.city,
                state_abbr=fulfillment.state_code,
            ),
            "products": [{"name": "Produtos farmacêuticos", "quantity": 1, "unitary_value": float(order.subtotal_amount)}],
            "volumes": [{
                "height": DEFAULT_PACKAGE_HEIGHT_CM,
                "width": DEFAULT_PACKAGE_WIDTH_CM,
                "length": DEFAULT_PACKAGE_LENGTH_CM,
                "weight": float(DEFAULT_PACKAGE_WEIGHT_KG),
            }],
            "options": {
                "insurance_value": float(order.subtotal_amount),
                "receipt": False,
                "own_hand": False,
                "non_commercial": True,
            },
        })
        provider_order_id = str(cart_response.get("id") or "")
        if not provider_order_id:
            raise MelhorEnvioError("melhor_envio_cart_failed", "Não foi possível reservar o frete no Melhor Envio.", 502)
        self.client.checkout_cart([provider_order_id])
        self.client.generate_label([provider_order_id])
        printed = self.client.print_label([provider_order_id])
        label_url = str(printed.get("url") or "")
        tracking = self.client.track_shipment([provider_order_id])
        tracking_entry = tracking.get(provider_order_id) if isinstance(tracking, dict) else None
        tracking_code = str((tracking_entry or {}).get("tracking") or "")
        return ShippingPurchaseResult(
            tracking_code=tracking_code,
            label_url=label_url,
            provider_order_id=provider_order_id,
            carrier_name="Melhor Envio",
        )
