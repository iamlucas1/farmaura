"""
farmaura-api/app/api/__init__.py

HTTP layer package for Farmaura.

Responsibilities:
- group API routers and dependencies;
- host HTTP-specific middleware and composition;
- isolate transport concerns from business logic;

Observations:
- routes call services instead of embedding business rules;
- versioned endpoints live under app.api.v1;
"""
