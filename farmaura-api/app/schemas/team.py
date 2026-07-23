"""
farmaura-api/app/schemas/team.py

Internal team schemas for Farmaura.

Responsibilities:
- expose internal staff (admin/manager/pharmacist/cashier/driver) projections for the admin console;
- validate team member creation, update, store-assignment, and status payloads.

Observations:
- team members are never hard-deleted, only deactivated via the status endpoint,
  mirroring the supplier/brand soft-delete convention.
"""

from pydantic import Field, field_validator

from app.domain.enums import UserRole
from app.domain.validators import is_strong_password
from app.schemas.common import StrictModel

ASSIGNABLE_STAFF_ROLES = {role.value for role in UserRole if role != UserRole.CUSTOMER}


# ============================================================================
# TEAM INPUT SCHEMAS
# ============================================================================


class TeamMemberStoreUpdateRequest(StrictModel):
    """Validate a store-assignment update for one team member."""

    store_id: str | None = Field(default=None)


class TeamMemberStatusUpdateRequest(StrictModel):
    """Validate an activation/deactivation request for one team member."""

    is_active: bool


class TeamMemberCreateRequest(StrictModel):
    """Validate a new internal staff account creation payload."""

    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=320)
    role: str
    password: str = Field(min_length=8, max_length=128)
    store_id: str | None = Field(default=None)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        """Reject any role outside the assignable internal staff set."""

        if value not in ASSIGNABLE_STAFF_ROLES:
            raise ValueError("Cargo inválido.")
        return value

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        """Require lowercase, uppercase, digit, and special characters."""

        if not is_strong_password(value):
            raise ValueError("A senha deve conter letra minúscula, letra maiúscula, número e caractere especial.")
        return value


class TeamMemberUpdateRequest(StrictModel):
    """Validate an update to an existing team member's identity fields."""

    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=320)
    role: str
    store_id: str | None = Field(default=None)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        """Reject any role outside the assignable internal staff set."""

        if value not in ASSIGNABLE_STAFF_ROLES:
            raise ValueError("Cargo inválido.")
        return value


# ============================================================================
# TEAM RESPONSE SCHEMAS
# ============================================================================


class TeamMemberResponse(StrictModel):
    """Represent one internal staff member and their store assignment."""

    id: str
    name: str
    email: str
    role: str
    store_id: str | None = None
    store_name: str = ""
    is_active: bool = True


class TeamMemberListResponse(StrictModel):
    """Represent the team member list payload."""

    items: list[TeamMemberResponse]
