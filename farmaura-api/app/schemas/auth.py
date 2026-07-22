"""
farmaura-api/app/schemas/auth.py

Authentication schemas for Farmaura.

Responsibilities:
- validate auth requests and responses;
- define the authenticated subject contract;
- keep token payload mapping explicit;

Observations:
- refresh rotation metadata can be added later without changing access shape;
- all auth payloads reject unknown fields by default;
"""

from uuid import UUID

from pydantic import AliasChoices, Field, field_validator

from app.domain.enums import AccessScope, PortalName, UserRole
from app.domain.validators import is_strong_password
from app.schemas.common import StrictModel


# ============================================================================
# AUTH SCHEMAS
# ============================================================================


class LoginRequest(StrictModel):
    """Validate login credentials."""

    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    remember_session: bool = False
    portal: PortalName


class TokenSubject(StrictModel):
    """Represent the authenticated token subject."""

    user_id: UUID = Field(validation_alias=AliasChoices("sub", "user_id"))
    tenant_id: UUID
    role: UserRole
    access_scope: AccessScope
    session_version: int
    store_id: UUID | None = None


class AuthSessionResponse(StrictModel):
    """Represent the current authenticated session context."""

    subject: TokenSubject
    full_name: str
    email: str
    allowed_portals: list[str]
    allowed_modules: list[str]
    two_factor_enabled: bool


class RefreshRequest(StrictModel):
    """Validate a refresh token rotation request."""

    refresh_token: str = Field(min_length=32, max_length=4096)


class LogoutRequest(StrictModel):
    """Validate a logout request."""

    refresh_token: str = Field(min_length=32, max_length=4096)


class TwoFactorVerifyRequest(StrictModel):
    """Validate a second-factor verification request."""

    challenge_token: str = Field(min_length=32, max_length=4096)
    code: str = Field(min_length=6, max_length=8)


class TwoFactorEnableRequest(StrictModel):
    """Validate two-factor activation with an authenticator code."""

    code: str = Field(min_length=6, max_length=8)


class TwoFactorDisableRequest(StrictModel):
    """Validate two-factor deactivation with an authenticator code."""

    code: str = Field(min_length=6, max_length=8)


class AuthenticatedResponse(StrictModel):
    """Represent a successful authentication stage."""

    stage: str = "authenticated"
    token_pair: "TokenPair"


class TwoFactorChallengeResponse(StrictModel):
    """Represent a pending two-factor authentication stage."""

    stage: str = "two_factor_required"
    challenge_token: str
    challenge_expires_in_seconds: int


class PasswordChangeRequiredResponse(StrictModel):
    """Represent a pending mandatory password-change stage."""

    stage: str = "password_change_required"
    challenge_token: str
    challenge_expires_in_seconds: int


class CompletePasswordResetRequest(StrictModel):
    """Validate a mandatory first-access password-reset completion request."""

    challenge_token: str = Field(min_length=32, max_length=4096)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password_strength(cls, value: str) -> str:
        """Require lowercase, uppercase, digit, and special characters."""

        if not is_strong_password(value):
            raise ValueError("A senha deve conter letra minúscula, letra maiúscula, número e caractere especial.")
        return value


class UnlockAccountRequest(StrictModel):
    """Validate a self-service account-unlock request."""

    token: str = Field(min_length=16, max_length=256)


class UnlockAccountResponse(StrictModel):
    """Represent the outcome of a self-service account-unlock request."""

    detail: str


class TwoFactorSetupResponse(StrictModel):
    """Represent a new authenticator-app enrollment payload."""

    stage: str = "setup"
    enabled: bool = False
    issuer: str
    account_name: str
    manual_entry_key: str
    provisioning_uri: str


class TwoFactorOperationResponse(StrictModel):
    """Represent a two-factor activation or deactivation result."""

    status: str = "ok"
    detail: str
    two_factor_enabled: bool


class LogoutResponse(StrictModel):
    """Represent a logout operation result."""

    status: str = "ok"
    detail: str


class LogoutAllResponse(StrictModel):
    """Represent a global session invalidation result."""

    status: str = "ok"
    detail: str


class TokenPair(StrictModel):
    """Represent an issued token pair."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    subject: TokenSubject
