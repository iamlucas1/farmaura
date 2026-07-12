"""
farmaura-api/app/services/marketplace_projection.py

Marketplace catalog projection helpers for Farmaura.

Responsibilities:
- normalize inventory items into customer-facing marketplace products;
- keep grouping rules consistent between catalog and checkout flows;
- centralize effective pricing and product identity derivation;

Observations:
- grouping intentionally hides lot-level operational data from customers;
- operational flows can still expand grouped products back into inventory lines.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


# ============================================================================
# MARKETPLACE PROJECTION CONSTANTS
# ============================================================================


MARKETPLACE_CATEGORY_MAP: dict[str, str] = {
    "medicamentos": "medicamentos",
    "medicamento": "medicamentos",
    "remedios": "medicamentos",
    "remedio": "medicamentos",
    "perfumaria": "perfumaria",
    "beleza": "perfumaria",
    "cosmeticos": "perfumaria",
    "cosmetico": "perfumaria",
    "dermocosmeticos": "perfumaria",
    "suplementos": "bem-estar",
    "vitaminas": "bem-estar",
    "vitamina": "bem-estar",
    "bemestar": "bem-estar",
    "bem-estar": "bem-estar",
    "higiene": "cuidados",
    "cuidados": "cuidados",
    "infantil": "cuidados",
    "mamaebebe": "cuidados",
    "mamaeebebe": "cuidados",
}

MARKETPLACE_CLASS_PLACEHOLDER_MAP: dict[str, str] = {
    "antibiotico": "PlaceHolder-generico.png",
    "analgesico": "PlaceHolder-generico.png",
    "antiinflamatorio": "PlaceHolder-generico.png",
    "antialergico": "PlaceHolder-generico.png",
    "antigripal": "PlaceHolder-generico.png",
    "hipertensao": "PlaceHolder-generico.png",
    "pressaoarterial": "PlaceHolder-generico.png",
    "cardiovascular": "PlaceHolder-generico.png",
    "diabetes": "PlaceHolder-generico.png",
    "vitamina": "PlaceHolder-generico.png",
    "vitaminas": "PlaceHolder-generico.png",
    "suplemento": "PlaceHolder-generico.png",
    "suplementos": "PlaceHolder-generico.png",
    "dermocosmetico": "PlaceHolder.png",
    "dermocosmeticos": "PlaceHolder.png",
    "higiene": "PlaceHolder.png",
    "infantil": "PlaceHolder.png",
}

MARKETPLACE_CATEGORY_PLACEHOLDER_MAP: dict[str, str] = {
    "medicamentos": "PlaceHolder-generico.png",
    "perfumaria": "PlaceHolder.png",
    "bem-estar": "PlaceHolder.png",
    "cuidados": "PlaceHolder.png",
}

MARKETPLACE_RESTRICTED_IMAGE_POLICY = "prescription_restricted"
MARKETPLACE_BRAND_IMAGE_POLICY = "brand_or_placeholder"
MARKETPLACE_PLACEHOLDER_IMAGE_POLICY = "placeholder_only"
MARKETPLACE_RESTRICTED_IMAGE_ALT = "Imagem padrao de restricao sanitaria para medicamento sujeito a prescricao."


# ============================================================================
# MARKETPLACE PROJECTION HELPERS
# ============================================================================


def normalize_marketplace_text(value: str | None) -> str:
    """Return a normalized lowercase string without separators."""

    text = str(value or "")
    replacements = str.maketrans(
        {
            "á": "a",
            "à": "a",
            "ã": "a",
            "â": "a",
            "ä": "a",
            "é": "e",
            "è": "e",
            "ê": "e",
            "ë": "e",
            "í": "i",
            "ì": "i",
            "î": "i",
            "ï": "i",
            "ó": "o",
            "ò": "o",
            "õ": "o",
            "ô": "o",
            "ö": "o",
            "ú": "u",
            "ù": "u",
            "û": "u",
            "ü": "u",
            "ç": "c",
        }
    )
    cleaned = text.strip().lower().translate(replacements)
    return "".join(character for character in cleaned if character.isalnum())


def slug_marketplace_value(value: str | None) -> str:
    """Return a URL-safe marketplace slug fragment."""

    text = str(value or "")
    replacements = str.maketrans(
        {
            "á": "a",
            "à": "a",
            "ã": "a",
            "â": "a",
            "ä": "a",
            "é": "e",
            "è": "e",
            "ê": "e",
            "ë": "e",
            "í": "i",
            "ì": "i",
            "î": "i",
            "ï": "i",
            "ó": "o",
            "ò": "o",
            "õ": "o",
            "ô": "o",
            "ö": "o",
            "ú": "u",
            "ù": "u",
            "û": "u",
            "ü": "u",
            "ç": "c",
        }
    )
    cleaned = text.strip().lower().translate(replacements)
    pieces: list[str] = []
    last_dash = False
    for character in cleaned:
        if character.isalnum():
            pieces.append(character)
            last_dash = False
            continue
        if not last_dash:
            pieces.append("-")
            last_dash = True
    slug = "".join(pieces).strip("-")
    return slug[:64]


def resolve_marketplace_category(*values: str | None) -> str:
    """Return the customer-facing marketplace category for the given values."""

    for value in values:
        normalized = normalize_marketplace_text(value)
        if normalized and normalized in MARKETPLACE_CATEGORY_MAP:
            return MARKETPLACE_CATEGORY_MAP[normalized]
    return "medicamentos"


def quantize_money(value: Decimal | int | float | str) -> Decimal:
    """Return a two-decimal monetary value."""

    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_effective_price(base_price: Decimal, promotional_discount_percent: Decimal) -> Decimal:
    """Return the effective sale price after promotional discount."""

    base = quantize_money(base_price)
    promo = Decimal(promotional_discount_percent or 0)
    if promo <= 0:
        return base
    return quantize_money(base * (Decimal("1.00") - (promo / Decimal("100"))))


def build_marketplace_product_id(name: str | None, brand: str | None, fallback: str = "produto") -> str:
    """Return the stable grouped marketplace product identifier."""

    name_slug = slug_marketplace_value(name) or slug_marketplace_value(fallback) or "produto"
    brand_slug = slug_marketplace_value(brand) or "sem-marca"
    return "mkt-" + (name_slug + "-" + brand_slug)[:96]


def build_marketplace_asset_url(asset_name: str) -> str:
    """Return the relative URL for one marketplace placeholder asset."""

    return "/static/marketplace/placeholders/" + asset_name


def resolve_marketplace_placeholder_asset(category: str | None, medication_class: str | None) -> str:
    """Return the placeholder asset filename that matches the catalog classification."""

    normalized_class = normalize_marketplace_text(medication_class)
    if normalized_class and normalized_class in MARKETPLACE_CLASS_PLACEHOLDER_MAP:
        return MARKETPLACE_CLASS_PLACEHOLDER_MAP[normalized_class]
    normalized_category = resolve_marketplace_category(category, medication_class)
    return MARKETPLACE_CATEGORY_PLACEHOLDER_MAP.get(normalized_category, "PlaceHolder-generico.png")


def resolve_marketplace_prescription_placeholder_asset(
    name: str | None,
    category: str | None,
    medication_class: str | None,
) -> str:
    """Return the restrictive placeholder asset for prescription medicines."""

    normalized_name = normalize_marketplace_text(name)
    normalized_category = normalize_marketplace_text(category)
    normalized_class = normalize_marketplace_text(medication_class)
    joined = " ".join([normalized_name, normalized_category, normalized_class])
    if "tarjapreta" in joined or "controladoespecial" in joined or "psicotropico" in joined:
        if "retencao" in joined or "receita" in joined:
            return "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png"
        return "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta-generico.png"
    if "retencao" in joined or "receita" in joined:
        if "generico" in joined:
            return "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-generico.png"
        return "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png"
    if "generico" in joined:
        return "PlaceHolder-venda-sob-prescricao-medica-generico.png"
    return "PlaceHolder-venda-sob-prescricao-medica.png"


def build_marketplace_image_payload(
    *,
    item: object,
    name: str,
    category: str | None,
    medication_class: str | None,
    requires_prescription: bool,
) -> dict[str, str]:
    """Return the image payload allowed for one marketplace item."""

    if requires_prescription:
        asset_name = resolve_marketplace_prescription_placeholder_asset(name, category, medication_class)
        return {
            "image_url": build_marketplace_asset_url(asset_name),
            "image_alt": MARKETPLACE_RESTRICTED_IMAGE_ALT,
            "image_policy": MARKETPLACE_RESTRICTED_IMAGE_POLICY,
        }
    custom_image_url = str(getattr(item, "marketplace_image_url", "") or "").strip()
    if custom_image_url:
        return {
            "image_url": custom_image_url,
            "image_alt": name,
            "image_policy": MARKETPLACE_BRAND_IMAGE_POLICY,
        }
    asset_name = resolve_marketplace_placeholder_asset(category, medication_class)
    return {
        "image_url": build_marketplace_asset_url(asset_name),
        "image_alt": name,
        "image_policy": MARKETPLACE_PLACEHOLDER_IMAGE_POLICY,
    }


def build_marketplace_catalog_groups(items: list[object]) -> list[dict[str, object]]:
    """Return grouped marketplace products from active inventory items."""

    grouped: dict[str, dict[str, object]] = {}
    for item in items:
        name = str(getattr(item, "name", "") or "Produto de estoque").strip() or "Produto de estoque"
        brand = str(getattr(item, "brand_name", "") or "Farmaura").strip() or "Farmaura"
        sku = str(getattr(item, "sku", "") or "").strip()
        ean = str(getattr(item, "ean_code", "") or "").strip()
        base_price = quantize_money(getattr(item, "sale_price", Decimal("0.00")) or Decimal("0.00"))
        promo = quantize_money(getattr(item, "promotional_discount_percent", Decimal("0.00")) or Decimal("0.00"))
        effective_price = compute_effective_price(base_price, promo)
        available_stock = max(0, int(getattr(item, "quantity", 0) or 0))
        category = str(getattr(item, "category_name", "") or "Medicamentos")
        medication_class = str(getattr(item, "medication_class_name", "") or category or "Medicamentos")
        requires_prescription = bool(getattr(item, "is_controlled", False))
        image_payload = build_marketplace_image_payload(
            item=item,
            name=name,
            category=category,
            medication_class=medication_class,
            requires_prescription=requires_prescription,
        )
        gallery = [] if requires_prescription else [
            str(url).strip() for url in (getattr(item, "marketplace_gallery_urls", None) or []) if str(url).strip()
        ]
        group_key = "::".join([
            slug_marketplace_value(name) or slug_marketplace_value(sku) or str(getattr(item, "id", "produto")),
            slug_marketplace_value(brand) or "sem-marca",
        ])
        tags: list[str] = []
        if promo > 0:
            tags.append("oferta")
        if requires_prescription:
            tags.append("receita")
        component = {
            "inventory_item_id": str(getattr(item, "id")),
            "sku": sku,
            "ean": ean,
            "quantity": available_stock,
            "storage_location": str(getattr(item, "storage_location", "") or ""),
            "batch_code": str(getattr(item, "batch_code", "") or ""),
            "expiry_label": str(getattr(item, "expiry_label", "") or ""),
            "sale_price": base_price,
            "effective_price": effective_price,
            "promo_percent": int(promo),
            "is_controlled": requires_prescription,
            "item": item,
        }
        if group_key not in grouped:
            grouped[group_key] = {
                "id": build_marketplace_product_id(name, brand, getattr(item, "id", "produto")),
                "name": name,
                "brand": brand,
                "sku": sku,
                "ean": ean,
                "cat": resolve_marketplace_category(category, medication_class, name),
                "sub": medication_class or category or "Medicamentos",
                "description": name,
                "info": "Disponivel no marketplace Farmaura",
                "image_url": image_payload["image_url"],
                "image_alt": image_payload["image_alt"],
                "image_policy": image_payload["image_policy"],
                "gallery": gallery,
                "price": effective_price,
                "old_price": base_price if promo > 0 else None,
                "discount_percent": int(promo) if promo > 0 else 0,
                "requires_prescription": requires_prescription,
                "stock": available_stock,
                "is_available": available_stock > 0,
                "tags": tags[:],
                "aliases": ["inv-" + str(getattr(item, "id"))],
                "inventory_ids": [str(getattr(item, "id"))],
                "components": [component],
                "source_count": 1,
                "primary_component_stock": available_stock,
            }
            continue
        current = grouped[group_key]
        current["stock"] = int(current["stock"]) + available_stock
        current["is_available"] = bool(current["stock"])
        current["requires_prescription"] = bool(current["requires_prescription"] or component["is_controlled"])
        if current["requires_prescription"]:
            current["image_url"] = build_marketplace_asset_url(
                resolve_marketplace_prescription_placeholder_asset(current["name"], current["cat"], current["sub"])
            )
            current["image_alt"] = MARKETPLACE_RESTRICTED_IMAGE_ALT
            current["image_policy"] = MARKETPLACE_RESTRICTED_IMAGE_POLICY
            current["gallery"] = []
        current["source_count"] = int(current["source_count"]) + 1
        current["components"].append(component)
        current["inventory_ids"] = sorted({*current["inventory_ids"], str(getattr(item, "id"))})
        current["aliases"] = sorted({*current["aliases"], "inv-" + str(getattr(item, "id"))})
        current["tags"] = sorted({*current["tags"], *tags})
        should_replace_primary = (
            effective_price < current["price"]
            or (effective_price == current["price"] and int(component["promo_percent"]) > int(current["discount_percent"]))
            or (
                effective_price == current["price"]
                and int(component["promo_percent"]) == int(current["discount_percent"])
                and available_stock > int(current["primary_component_stock"])
            )
        )
        if should_replace_primary:
            current["sku"] = sku or current["sku"]
            current["ean"] = ean or current["ean"]
            current["cat"] = resolve_marketplace_category(category, medication_class, name)
            current["sub"] = medication_class or category or current["sub"]
            current["price"] = effective_price
            current["old_price"] = base_price if promo > 0 else None
            current["discount_percent"] = int(promo) if promo > 0 else 0
            if not current["requires_prescription"]:
                current["image_url"] = image_payload["image_url"]
                current["image_alt"] = image_payload["image_alt"]
                current["image_policy"] = image_payload["image_policy"]
                current["gallery"] = gallery
            current["primary_component_stock"] = available_stock
    rows = list(grouped.values())
    for row in rows:
        row["components"].sort(
            key=lambda component: (
                Decimal(component["effective_price"]),
                -int(component["quantity"]),
                str(component["inventory_item_id"]),
            )
        )
    rows.sort(key=lambda row: (str(row["name"]).lower(), str(row["brand"]).lower()))
    return rows
