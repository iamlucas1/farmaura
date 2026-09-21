"""
farmaura-api/scripts/asaas_simulate_webhook.py

Simulate an Asaas payment webhook against a LOCAL Farmaura API.

Responsibilities:
- send `PAYMENT_CONFIRMED` (or another payment event) for an order's `gateway_payment_id`, authenticated exactly
  like the real webhook (header `asaas-access-token`);

Observations:
- for local development, where Asaas cannot reach `localhost`: it lets you exercise "Pix pago -> pedido
  aprovado" without a tunnel. The real webhook path (staging/tunnel) is documented in the sandbox POP;
- it refuses any host except loopback: pointing it at a real environment would forge a payment confirmation;
- the backend deduplicates by (event, payment id): sending the same event twice is applied only once;

Usage:
    python scripts/asaas_simulate_webhook.py --payment-id pay_XXXXXXXX
    python scripts/asaas_simulate_webhook.py --payment-id pay_XXXXXXXX --event PAYMENT_OVERDUE
"""

from __future__ import annotations

import argparse
import sys
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

EVENTS = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED"]
LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate an Asaas webhook on a local API.")
    parser.add_argument("--payment-id", required=True, help="the order's gateway_payment_id (pay_...)")
    parser.add_argument("--event", default="PAYMENT_CONFIRMED", choices=EVENTS)
    parser.add_argument("--url", default="http://127.0.0.1:8080/api/v1/payments/asaas/webhook")
    args = parser.parse_args()

    if (urlparse(args.url).hostname or "") not in LOOPBACK:
        print("[FALHA] Só é permitido simular contra localhost. Nada foi enviado.")
        return 2
    token = str(get_settings().asaas_webhook_auth_token or "").strip()
    if not token:
        print("[FALHA] APP_ASAAS_WEBHOOK_AUTH_TOKEN não está configurado.")
        return 1
    body = {"event": args.event, "payment": {"id": args.payment_id, "object": "payment", "status": args.event.removeprefix("PAYMENT_")}}
    try:
        response = httpx.post(args.url, json=body, headers={"asaas-access-token": token}, timeout=15)
    except httpx.HTTPError as error:
        print(f"[FALHA] não consegui falar com a API local: {error.__class__.__name__}")
        return 1
    if response.status_code == 204:
        print(f"[ OK ] webhook aplicado ({args.event} em {args.payment_id}). Reenviar o mesmo evento é ignorado (idempotência).")
        return 0
    print(f"[FALHA] HTTP {response.status_code}: {response.text[:200]}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
