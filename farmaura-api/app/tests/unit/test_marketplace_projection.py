"""
app/tests/unit/test_marketplace_projection.py

Marketplace catalog projection tests.

Responsibilities:
- verify hidden inventory items remain represented in the marketplace catalog;
- verify hidden inventory contributes no purchasable stock;
- verify visible equivalent inventory remains purchasable;

Observations:
- tests use in-memory item objects to isolate marketplace projection rules;
- no database or HTTP dependency is required.
"""

from decimal import Decimal
from types import SimpleNamespace

from app.services.marketplace_projection import build_marketplace_catalog_groups


# ============================================================================
# TEST HELPERS
# ============================================================================


def build_inventory_item(
    *,
    item_id: str,
    quantity: int,
    is_marketplace_visible: bool,
    name: str = "Produto de teste",
    controlled_category: str = "none",
    is_controlled: bool = False,
    marketplace_image_url: str = "",
    marketplace_gallery_urls: list[str] | None = None,
    is_generic: bool = False,
) -> SimpleNamespace:
    """Build an inventory item compatible with the marketplace projection."""

    return SimpleNamespace(
        id=item_id,
        name=name,
        brand_name="Marca de teste",
        sku=f"SKU-{item_id}",
        ean_code=f"EAN-{item_id}",
        sale_price=Decimal("10.00"),
        promotional_discount_percent=Decimal("0.00"),
        quantity=quantity,
        category_name="Medicamentos",
        medication_class_name="Geral",
        is_controlled=is_controlled,
        is_marketplace_visible=is_marketplace_visible,
        controlled_category=controlled_category,
        marketplace_image_url=marketplace_image_url,
        is_generic=is_generic,
        marketplace_gallery_urls=marketplace_gallery_urls or [],
    )


# ============================================================================
# MARKETPLACE VISIBILITY TESTS
# ============================================================================


def test_hidden_item_remains_listed_as_unavailable() -> None:
    """Keep a hidden product in the catalog with zero purchasable stock."""

    hidden_item = build_inventory_item(item_id="hidden", quantity=5, is_marketplace_visible=False)

    product = build_marketplace_catalog_groups([hidden_item])[0]

    assert product["stock"] == 0
    assert product["is_available"] is False
    assert product["components"][0]["quantity"] == 0


def test_visible_equivalent_stock_keeps_group_purchasable() -> None:
    """Sum only published stock when equivalent hidden and visible items coexist."""

    hidden_item = build_inventory_item(item_id="hidden", quantity=5, is_marketplace_visible=False)
    visible_item = build_inventory_item(item_id="visible", quantity=3, is_marketplace_visible=True)

    product = build_marketplace_catalog_groups([hidden_item, visible_item])[0]

    assert product["stock"] == 3
    assert product["is_available"] is True


# ============================================================================
# MARKETPLACE IMAGE COMPLIANCE TESTS
# ============================================================================


def test_black_stripe_uses_black_stripe_placeholder() -> None:
    """Use the black-stripe placeholder from the explicit regulatory category."""

    item = build_inventory_item(
        item_id="black-stripe",
        quantity=2,
        is_marketplace_visible=True,
        controlled_category="black_stripe",
        is_controlled=True,
        is_generic=False,
        marketplace_image_url="https://example.test/prohibited-image.png",
        marketplace_gallery_urls=["https://example.test/prohibited-gallery.png"],
    )

    product = build_marketplace_catalog_groups([item])[0]

    assert product["image_policy"] == "prescription_restricted"
    assert product["image_url"].endswith("PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png")
    assert product["gallery"] == []


def test_antimicrobial_uses_retention_placeholder() -> None:
    """Use the retention placeholder for antimicrobial medicines."""

    item = build_inventory_item(
        item_id="antimicrobial",
        quantity=2,
        is_marketplace_visible=True,
        controlled_category="prescription_retention",
        is_controlled=True,
        is_generic=False,
    )

    product = build_marketplace_catalog_groups([item])[0]

    assert product["image_policy"] == "prescription_restricted"
    assert product["image_url"].endswith("PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png")


def test_red_stripe_uses_prescription_placeholder() -> None:
    """Use the standard prescription placeholder for red-stripe medicines."""

    item = build_inventory_item(
        item_id="red-stripe",
        quantity=2,
        is_marketplace_visible=True,
        controlled_category="prescription",
        is_controlled=True,
        is_generic=False,
    )

    product = build_marketplace_catalog_groups([item])[0]

    assert product["image_policy"] == "prescription_restricted"
    assert product["image_url"].endswith("PlaceHolder-venda-sob-prescricao-medica.png")
