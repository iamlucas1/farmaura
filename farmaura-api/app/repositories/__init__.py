"""
farmaura-api/app/repositories/__init__.py

Repository package for Farmaura.

Responsibilities:
- isolate persistence operations from services;
- keep query logic auditable and tenant-aware;
- provide focused data access modules by aggregate;

Observations:
- repositories should avoid business orchestration;
- tenant filters are mandatory in sensitive queries;
"""
