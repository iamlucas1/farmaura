"""
farmaura-api/app/services/__init__.py

Service package for Farmaura.

Responsibilities:
- host business use-cases and orchestration;
- keep route handlers thin and auditable;
- coordinate repositories, security, and domain rules;

Observations:
- services own business state transitions;
- repositories remain persistence-focused only;
"""
