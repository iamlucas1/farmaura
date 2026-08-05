"""
farmaura-api/scripts/populate_demo_content.py

Populate marketplace merchandising demo content (home banner, home brands, ofertas do
dia) against a running Farmaura API instance, over its real HTTP API.

Responsibilities:
- authenticate as an internal admin and configure a promotional home banner slide
  (sanitized HTML, no image asset needed);
- configure the "marcas em destaque" strip from the static placeholder logos in
  scripts/assets/demo_brands/ (generated once, committed as plain PNGs — no image
  library is a runtime dependency of this script or of the API itself);
- curate "ofertas do dia" from the real bestseller ranking, in manual mode;

Observations:
- deliberately does not create or touch any user account — credential provisioning is a
  separate, per-environment decision and must never be scripted into something that could
  run unattended against production;
- talks to the API exactly like any other admin client (login, then PUT the same
  endpoints the internal console itself calls) — no direct DB/session access — so the
  same script and the same command are safe to point at local dev, the lumos-dev staging
  environment, or (once the content itself is reviewed) production;
- placeholder brand logos are made-up names/colors, not real trademarked logos, matching
  the demo/investor-preview intent this was built for;
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
from pathlib import Path

import httpx


ASSETS_DIR = Path(__file__).parent / "assets" / "demo_brands"

FAKE_BRANDS = [
    ("VitaPlus", "vitaplus.png"),
    ("NovaSaude", "novasaude.png"),
    ("BioCare", "biocare.png"),
    ("MedLeve", "medleve.png"),
    ("PharmaVida", "pharmavida.png"),
    ("Essencia Natural", "essencia_natural.png"),
]

BANNER_HTML = (
    '<div style="background-color:#6B1530;color:#ffffff;height:100%;padding:0 60px;'
    'display:flex;flex-direction:column;justify-content:center;gap:14px;text-align:left">'
    '<div style="font-size:38px;font-weight:700;line-height:1.15">'
    "Sua farmácia, do jeito que você precisa</div>"
    '<div style="font-size:19px;color:#F3D9C6">'
    "Entrega rápida, preços justos e cuidado de verdade</div>"
    '<div style="display:inline-block;background-color:#F2B705;color:#3D0B1C;'
    'padding:10px 26px;border-radius:999px;font-weight:700;font-size:15px">'
    "Até 30% OFF na semana de lançamento</div>"
    "</div>"
)


# ============================================================================
# PLACEHOLDER LOGO LOADING
# ============================================================================


def _brand_logo_data_uri(filename: str) -> str:
    """Return a base64 PNG data URI for one committed placeholder brand logo."""

    raw = (ASSETS_DIR / filename).read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:image/png;base64,{encoded}"


# ============================================================================
# API CALLS
# ============================================================================


def _login(client: httpx.Client, email: str, password: str) -> str:
    """Authenticate against the internal portal and return a bearer access token."""

    response = client.post(
        "/auth/login",
        json={"email": email, "password": password, "portal": "internal"},
    )
    response.raise_for_status()
    return response.json()["token_pair"]["access_token"]


def _update_home_banner(client: httpx.Client) -> None:
    """Configure a single sanitized-HTML promotional slide as the home banner."""

    payload = {
        "mode": "image",
        "slides": [
            {
                "kind": "html",
                "html": BANNER_HTML,
                "alt_text": "Banner promocional Farmaura",
                "link_type": "offers",
            }
        ],
        "target_width": 1600,
        "target_height": 480,
    }
    response = client.put("/portal/internal/home-banner", json=payload)
    response.raise_for_status()
    body = response.json()
    print(f"home-banner: mode={body['mode']}, slides={len(body['slides'])}")


def _update_home_brands(client: httpx.Client) -> None:
    """Configure the "marcas em destaque" strip with the committed placeholder logos."""

    circles = [
        {"image": _brand_logo_data_uri(filename), "alt_text": f"Logo {name}", "brand_name": name}
        for name, filename in FAKE_BRANDS
    ]
    response = client.put("/portal/internal/home-brands", json={"mode": "on", "circles": circles})
    response.raise_for_status()
    body = response.json()
    names = [circle["brand_name"] for circle in body["circles"]]
    print(f"home-brands: mode={body['mode']}, brands={names}")


def _update_deal_of_the_day(client: httpx.Client, limit: int) -> None:
    """Curate "ofertas do dia" (manual mode) from the real bestseller ranking."""

    suggestions = client.get("/portal/internal/deal-suggestions/bestsellers", params={"limit": limit})
    suggestions.raise_for_status()
    refs = [item["ref"] for item in suggestions.json()["items"][:limit]]
    if not refs:
        print("deal-of-the-day: no bestseller suggestions available, skipping")
        return
    response = client.put("/portal/internal/deal-of-the-day", json={"mode": "manual", "product_refs": refs})
    response.raise_for_status()
    body = response.json()
    print(f"deal-of-the-day: mode={body['mode']}, refs={len(body['product_refs'])}")


# ============================================================================
# ENTRYPOINT
# ============================================================================


def main() -> None:
    """Populate the home banner, home brands, and deal-of-the-day for a demo/preview build."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=os.environ.get("POPULATE_BASE_URL", "http://localhost:8080/api/v1"),
        help="Farmaura API base URL (default: local dev, or $POPULATE_BASE_URL).",
    )
    parser.add_argument(
        "--email",
        default=os.environ.get("POPULATE_ADMIN_EMAIL", "adriana.lima@farmaura.com.br"),
        help="Internal admin email (default: local seed admin, or $POPULATE_ADMIN_EMAIL).",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("POPULATE_ADMIN_PASSWORD", "Farmaura@123"),
        help="Internal admin password (default: local seed password, or $POPULATE_ADMIN_PASSWORD).",
    )
    parser.add_argument("--deal-limit", type=int, default=6, help="How many bestsellers to curate (default: 6).")
    parser.add_argument("--skip-banner", action="store_true")
    parser.add_argument("--skip-brands", action="store_true")
    parser.add_argument("--skip-deal-of-the-day", action="store_true")
    args = parser.parse_args()

    print(f"populate_demo_content: targeting {args.base_url} as {args.email}")

    with httpx.Client(base_url=args.base_url, timeout=30.0) as client:
        try:
            token = _login(client, args.email, args.password)
        except httpx.HTTPStatusError as error:
            print(f"ERROR: login failed ({error.response.status_code}): {error.response.text}", file=sys.stderr)
            raise SystemExit(1) from error

        client.headers["Authorization"] = f"Bearer {token}"

        if not args.skip_banner:
            _update_home_banner(client)
        if not args.skip_brands:
            _update_home_brands(client)
        if not args.skip_deal_of_the_day:
            _update_deal_of_the_day(client, args.deal_limit)


if __name__ == "__main__":
    main()
