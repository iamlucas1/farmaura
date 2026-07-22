"""
farmaura-api/app/domain/enums.py

Domain enumerations for Farmaura.

Responsibilities:
- define stable domain-level enumerations;
- keep status and role values explicit;
- prevent magic strings across layers;

Observations:
- enum values are part of API and persistence contracts;
- additions should be reviewed carefully for compatibility;
"""

from enum import StrEnum


# ============================================================================
# DOMAIN ENUMS
# ============================================================================


class UserRole(StrEnum):
    """Supported user roles."""

    ADMIN = "admin"
    CUSTOMER = "customer"
    MANAGER = "manager"
    PHARMACIST = "pharmacist"
    CASHIER = "cashier"
    DRIVER = "driver"


class AccessScope(StrEnum):
    """Supported authenticated access scopes."""

    MARKETPLACE = "marketplace"
    INTERNAL = "internal"
    HYBRID = "hybrid"


class PortalName(StrEnum):
    """Supported authentication portal names."""

    MARKETPLACE = "marketplace"
    INTERNAL = "internal"


class OrderStatus(StrEnum):
    """Supported order statuses."""

    DRAFT = "draft"
    SUBMITTED = "submitted"
    PAID = "paid"
    NEW = "new"
    SEPARATING = "separating"
    READY = "ready"
    DISPATCHED = "dispatched"
    DELIVERED = "delivered"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"


class FileStatus(StrEnum):
    """Supported file lifecycle states."""

    PENDING_SCAN = "pending_scan"
    ACCEPTED = "accepted"
    QUARANTINED = "quarantined"
