"""
farmaura-api/app/schemas/__init__.py

Schema package for Farmaura.

Responsibilities:
- define request and response contracts;
- keep API payloads explicit and validated;
- isolate transport schemas from ORM models;

Observations:
- schemas default to strict validation for sensitive flows;
- shared contracts are reused across route modules;
"""
