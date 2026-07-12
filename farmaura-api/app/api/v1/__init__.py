"""
farmaura-api/app/api/v1/__init__.py

Version 1 route package for Farmaura.

Responsibilities:
- organize first-generation API endpoints;
- keep endpoint modules isolated by domain;
- support explicit versioned API evolution;

Observations:
- v1 modules are mounted by app.api.router;
- endpoint handlers delegate business logic to services;
"""
