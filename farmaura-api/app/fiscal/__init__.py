"""
farmaura-api/app/fiscal/__init__.py

NFC-e fiscal engine for Farmaura.

Responsibilities:
- hold the pure (no database, no HTTP framework) logic to build, sign, validate, transmit and print NFC-e;

Observations:
- orchestration, persistence and authorization live in `app/services/fiscal_service.py`;
- everything in this package is deterministic and unit-testable offline, except `sefaz_client.py`;
"""
