"""
farmaura-api/app/fiscal/snapshot.py

Immutable fiscal snapshot of a sale.

Responsibilities:
- freeze, at sale time, everything needed to build the NFC-e (items, tax profiles, payments, consumer);
- (de)serialize that snapshot to plain JSON stored on the fiscal document;

Observations:
- the snapshot is taken inside the sale request, where the operator's row-level-security context can read
  products and profiles; the emission worker then needs nothing but the fiscal tables;
- a retry after a timeout or a SEFAZ rejection rebuilds the XML from this snapshot, never from live rows, so a
  later price or profile edit cannot silently change a note that was already numbered;
- the consumer CPF is stored here (LGPD): access to the fiscal endpoints is authenticated and role-limited;
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any

from app.fiscal.inputs import ItemData, PaymentData, RecipientData, TaxProfile

_DECIMAL_TAX_FIELDS = ("icms_rate", "pis_rate", "cofins_rate", "ibs_uf_rate", "ibs_mun_rate", "cbs_rate")


@dataclass(frozen=True)
class FiscalSnapshot:
    """Everything variable about one sale that the NFC-e needs."""

    items: list[ItemData]
    payments: list[PaymentData]
    change_amount: Decimal
    recipient: RecipientData | None
    additional_info: str


def snapshot_to_dict(snapshot: FiscalSnapshot) -> dict[str, Any]:
    """Serialize a snapshot into JSON-safe values (Decimals as strings)."""

    items = []
    for item in snapshot.items:
        tax = asdict(item.tax)
        for name in _DECIMAL_TAX_FIELDS:
            tax[name] = None if tax[name] is None else str(tax[name])
        items.append(
            {
                "code": item.code, "ean": item.ean, "description": item.description,
                "quantity": str(item.quantity), "unit_price": str(item.unit_price),
                "discount": str(item.discount), "tax": tax,
            }
        )
    return {
        "items": items,
        "payments": [
            {"tpag": p.tpag, "amount": str(p.amount), "card_integration": p.card_integration} for p in snapshot.payments
        ],
        "change_amount": str(snapshot.change_amount),
        "recipient": None if snapshot.recipient is None else {"cpf": snapshot.recipient.cpf, "name": snapshot.recipient.name},
        "additional_info": snapshot.additional_info,
    }


def snapshot_from_dict(data: dict[str, Any]) -> FiscalSnapshot:
    """Rebuild a snapshot from its stored JSON form."""

    items: list[ItemData] = []
    for raw in data["items"]:
        tax_raw = dict(raw["tax"])
        for name in _DECIMAL_TAX_FIELDS:
            tax_raw[name] = None if tax_raw.get(name) is None else Decimal(tax_raw[name])
        items.append(
            ItemData(
                code=raw["code"], ean=raw["ean"], description=raw["description"],
                quantity=Decimal(raw["quantity"]), unit_price=Decimal(raw["unit_price"]),
                discount=Decimal(raw["discount"]), tax=TaxProfile(**tax_raw),
            )
        )
    recipient = data.get("recipient")
    return FiscalSnapshot(
        items=items,
        payments=[
            PaymentData(tpag=p["tpag"], amount=Decimal(p["amount"]), card_integration=p.get("card_integration", ""))
            for p in data["payments"]
        ],
        change_amount=Decimal(data.get("change_amount", "0.00")),
        recipient=None if not recipient else RecipientData(cpf=recipient["cpf"], name=recipient.get("name", "")),
        additional_info=data.get("additional_info", ""),
    )
