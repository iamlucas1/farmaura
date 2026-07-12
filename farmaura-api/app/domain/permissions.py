"""
farmaura-api/app/domain/permissions.py

Permission declarations for Farmaura.

Responsibilities:
- define named permission constants;
- centralize authorization vocabulary;
- support explicit role-to-capability mapping;

Observations:
- permissions complement role checks and ownership validation;
- tenant scope must still be enforced separately;
"""


# ============================================================================
# PERMISSIONS
# ============================================================================


from app.domain.enums import AccessScope, PortalName, UserRole


CATALOG_READ = "catalog:read"
ORDER_CREATE = "order:create"
INVENTORY_WRITE = "inventory:write"
PRESCRIPTION_UPLOAD = "prescription:upload"
CRM_READ = "crm:read"

MARKETPLACE_MODULES = (
    "catalog",
    "cart",
    "orders",
    "prescriptions",
    "uploads",
    "account",
)

INTERNAL_MODULES_BY_ROLE: dict[UserRole, tuple[str, ...]] = {
    UserRole.ADMIN: (
        "dashboard",
        "pdv",
        "orders",
        "deliveries",
        "prescriptions",
        "chat",
        "crm",
        "sales",
        "analytics",
        "inventory",
        "pricing",
    ),
    UserRole.PHARMACIST: (
        "dashboard",
        "pdv",
        "orders",
        "deliveries",
        "prescriptions",
        "chat",
        "crm",
        "analytics",
        "inventory",
        "pricing",
    ),
    UserRole.CASHIER: (
        "dashboard",
        "pdv",
        "sales",
    ),
    UserRole.CUSTOMER: (),
}


# ============================================================================
# ACCESS HELPERS
# ============================================================================


def can_access_marketplace_portal(role: UserRole, access_scope: AccessScope) -> bool:
    """Return whether the actor can authenticate into the marketplace portal."""

    return role is UserRole.CUSTOMER and access_scope is AccessScope.MARKETPLACE


def can_access_internal_portal(role: UserRole, access_scope: AccessScope) -> bool:
    """Return whether the actor can authenticate into the internal portal."""

    return role in {UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER} and access_scope in {
        AccessScope.INTERNAL,
        AccessScope.HYBRID,
    }


def can_access_portal(role: UserRole, access_scope: AccessScope, portal: PortalName) -> bool:
    """Return whether the actor can authenticate into the requested portal."""

    if portal is PortalName.MARKETPLACE:
        return can_access_marketplace_portal(role, access_scope)
    return can_access_internal_portal(role, access_scope)


def get_allowed_portals(access_scope: AccessScope, role: UserRole) -> list[str]:
    """Return the portals enabled for the authenticated user."""

    if can_access_internal_portal(role, access_scope):
        return [PortalName.INTERNAL.value]
    if can_access_marketplace_portal(role, access_scope):
        return [PortalName.MARKETPLACE.value]
    return []


def get_allowed_modules(role: UserRole, access_scope: AccessScope) -> list[str]:
    """Return the modules visible to the authenticated user."""

    modules: list[str] = []
    if can_access_marketplace_portal(role, access_scope):
        modules.extend(MARKETPLACE_MODULES)
    if can_access_internal_portal(role, access_scope):
        modules.extend(INTERNAL_MODULES_BY_ROLE.get(role, ()))
    return modules
