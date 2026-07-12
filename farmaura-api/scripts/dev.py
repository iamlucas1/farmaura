"""
farmaura-api/scripts/dev.py

Development entrypoint for Farmaura.

Responsibilities:
- start the FastAPI development server;
- keep local bootstrap explicit and reproducible;
- provide a single script target for local execution;

Observations:
- production deployment should use a dedicated ASGI process manager;
- this script intentionally keeps startup arguments conservative;
"""

import uvicorn


# ============================================================================
# DEVELOPMENT ENTRYPOINT
# ============================================================================


def main() -> None:
    """Run the local development server."""

    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)


if __name__ == "__main__":
    main()
