"""
farmaura-api/app/core/client_ip.py

Current request client IP for outbound provider calls.

Responsibilities:
- expose the client IP the request-logging middleware already bound to the log context;

Observations:
- Asaas requires `remoteIp` (the payer's device IP, not the server's) on card tokenization and card charges;
- the value is `request.client.host`, like the rest of the app; behind lumos-gateway it is the gateway's address
  unless uvicorn is told which proxies to trust (`--forwarded-allow-ips`), which is a deployment decision;
- outside a request (background jobs) it is empty and callers must omit the field instead of inventing one;
"""

from structlog.contextvars import get_contextvars


def current_client_ip() -> str:
    """Return the IP bound to the current request context, or an empty string."""

    return str(get_contextvars().get("client_ip") or "")
