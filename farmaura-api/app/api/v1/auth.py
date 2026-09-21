"""
farmaura-api/app/api/v1/auth.py

Authentication routes for Farmaura.

Responsibilities:
- expose credential-based login;
- return validated access and refresh token pairs;
- keep transport logic thin and service-driven;

Observations:
- refresh, logout, and revoke routes should be added next;
- public auth endpoints are protected by a per-IP rate limit
  (app.core.rate_limit) and login additionally by a per-account exponential
  lockout (app.core.login_guard).
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_app_settings,
    get_current_subject,
    get_session,
    get_subject_session,
    require_internal_subject,
    require_marketplace_subject,
)
from app.core.config import Settings
from app.core.google_identity import verify_google_id_token
from app.core.rate_limit import AUTH_RATE_LIMIT, rate_limit
from app.domain.enums import PortalName, UiTheme
from app.domain.permissions import get_allowed_modules, get_allowed_portals
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AuthSessionResponse,
    AuthenticatedResponse,
    CompletePasswordResetRequest,
    GoogleAccountStatusResponse,
    GoogleLinkRequest,
    GoogleLoginRequest,
    LoginRequest,
    LogoutAllResponse,
    LogoutRequest,
    LogoutResponse,
    PasswordChangeRequiredResponse,
    RefreshRequest,
    TokenPair,
    TokenSubject,
    TwoFactorChallengeResponse,
    TwoFactorDisableRequest,
    TwoFactorEnableRequest,
    TwoFactorOperationResponse,
    TwoFactorSetupResponse,
    TwoFactorVerifyRequest,
    UnlockAccountRequest,
    UnlockAccountResponse,
    UserPreferencesRequest,
    UserPreferencesResponse,
)
from app.schemas.portal import PortalRegisterRequest
from app.services.auth_service import AuthService
from app.services.portal_service import PortalService


# ============================================================================
# AUTH ROUTES
# ============================================================================


router = APIRouter()


@router.post(
    "/login",
    response_model=AuthenticatedResponse | TwoFactorChallengeResponse | PasswordChangeRequiredResponse,
    dependencies=[Depends(rate_limit(AUTH_RATE_LIMIT))],
)
async def login(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> AuthenticatedResponse | TwoFactorChallengeResponse | PasswordChangeRequiredResponse:
    """Authenticate a user and issue tokens."""

    service = AuthService(session=session, settings=settings)
    return await service.login(
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.post("/verify-2fa", response_model=AuthenticatedResponse, dependencies=[Depends(rate_limit(AUTH_RATE_LIMIT))])
async def verify_two_factor(
    payload: TwoFactorVerifyRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> AuthenticatedResponse:
    """Validate a second-factor challenge and issue tokens."""

    service = AuthService(session=session, settings=settings)
    return await service.verify_two_factor(
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.post("/complete-first-access", response_model=AuthenticatedResponse, dependencies=[Depends(rate_limit(AUTH_RATE_LIMIT))])
async def complete_first_access(
    payload: CompletePasswordResetRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> AuthenticatedResponse:
    """Set a new password for a mandatory first-access reset and issue tokens."""

    service = AuthService(session=session, settings=settings)
    return await service.complete_password_reset(
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.post("/register", response_model=AuthenticatedResponse, dependencies=[Depends(rate_limit(AUTH_RATE_LIMIT))])
async def register(
    payload: PortalRegisterRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> AuthenticatedResponse:
    """Create a self-service marketplace account and issue tokens."""

    portal_service = PortalService(session)
    user = await portal_service.register_marketplace_account(payload)
    auth_service = AuthService(session=session, settings=settings)
    return await auth_service.issue_session_for_user(
        user,
        remember_session=payload.remember_session,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.post(
    "/login/google",
    response_model=AuthenticatedResponse | TwoFactorChallengeResponse | PasswordChangeRequiredResponse,
    dependencies=[Depends(rate_limit(AUTH_RATE_LIMIT))],
)
async def login_google(
    payload: GoogleLoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> AuthenticatedResponse | TwoFactorChallengeResponse | PasswordChangeRequiredResponse:
    """Authenticate (creating the account on first use) via Google Sign-In. Marketplace only."""

    identity = await verify_google_id_token(token=payload.id_token, client_id=settings.google_oauth_client_id)
    portal_service = PortalService(session)
    user, is_new_account = await portal_service.resolve_or_link_marketplace_account_via_google(identity)
    auth_service = AuthService(session=session, settings=settings)
    result = await auth_service.continue_login(
        user,
        portal=PortalName.MARKETPLACE,
        remember_session=payload.remember_session,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )
    if is_new_account and isinstance(result, AuthenticatedResponse):
        result.is_new_google_account = True
    return result


@router.post("/google/link", response_model=GoogleAccountStatusResponse)
async def link_google_account(
    payload: GoogleLinkRequest,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> GoogleAccountStatusResponse:
    """Link the authenticated marketplace account to a verified Google identity."""

    service = AuthService(session=session, settings=settings)
    return await service.link_google_account(subject, payload)


@router.post("/google/unlink", response_model=GoogleAccountStatusResponse)
async def unlink_google_account(
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> GoogleAccountStatusResponse:
    """Remove the Google Sign-In link from the authenticated marketplace account."""

    service = AuthService(session=session, settings=settings)
    return await service.unlink_google_account(subject)


@router.post("/unlock-account", response_model=UnlockAccountResponse, dependencies=[Depends(rate_limit(AUTH_RATE_LIMIT))])
async def unlock_account(
    payload: UnlockAccountRequest,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> UnlockAccountResponse:
    """End an active brute-force lockout using the token from the lockout notification e-mail."""

    service = AuthService(session=session, settings=settings)
    return await service.unlock_account(payload)


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
async def begin_two_factor_setup(
    subject: TokenSubject = Depends(get_current_subject),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> TwoFactorSetupResponse:
    """Generate a fresh authenticator-app setup payload for the current user."""

    service = AuthService(session=session, settings=settings)
    return await service.begin_two_factor_setup(subject)


@router.post("/2fa/enable", response_model=TwoFactorOperationResponse)
async def enable_two_factor(
    payload: TwoFactorEnableRequest,
    subject: TokenSubject = Depends(get_current_subject),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> TwoFactorOperationResponse:
    """Enable two-factor authentication for the current user."""

    service = AuthService(session=session, settings=settings)
    return await service.enable_two_factor(subject, payload)


@router.post("/2fa/disable", response_model=TwoFactorOperationResponse)
async def disable_two_factor(
    payload: TwoFactorDisableRequest,
    subject: TokenSubject = Depends(get_current_subject),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> TwoFactorOperationResponse:
    """Disable two-factor authentication for the current user."""

    service = AuthService(session=session, settings=settings)
    return await service.disable_two_factor(subject, payload)


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(rate_limit(AUTH_RATE_LIMIT))])
async def refresh(
    payload: RefreshRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> TokenPair:
    """Rotate a refresh token and issue a new pair."""

    service = AuthService(session=session, settings=settings)
    return await service.refresh(
        payload,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    payload: LogoutRequest,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> LogoutResponse:
    """Revoke the presented refresh token."""

    service = AuthService(session=session, settings=settings)
    return await service.logout(payload)


@router.post("/logout-all", response_model=LogoutAllResponse)
async def logout_all(
    subject: TokenSubject = Depends(get_current_subject),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> LogoutAllResponse:
    """Invalidate every session for the authenticated user."""

    service = AuthService(session=session, settings=settings)
    return await service.logout_all(subject)


@router.get("/session", response_model=AuthSessionResponse)
async def get_session_context(
    subject: TokenSubject = Depends(get_current_subject),
    session: AsyncSession = Depends(get_subject_session),
) -> AuthSessionResponse:
    """Return the current authenticated session context."""

    user = await UserRepository(session).get_by_id(str(subject.user_id))
    return AuthSessionResponse(
        subject=subject,
        full_name=user.full_name if user else "",
        email=user.email if user else "",
        allowed_portals=get_allowed_portals(subject.access_scope, subject.role),
        allowed_modules=get_allowed_modules(subject.role, subject.access_scope),
        two_factor_enabled=bool(user and user.two_factor_enabled),
        ui_theme=UiTheme(user.ui_theme) if user else UiTheme.AUTO,
        google_linked=bool(user and user.google_sub),
        has_password=bool(user.has_password) if user else True,
    )


@router.patch("/preferences", response_model=UserPreferencesResponse)
async def update_preferences(
    payload: UserPreferencesRequest,
    subject: TokenSubject = Depends(require_internal_subject()),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> UserPreferencesResponse:
    """Save the console preferences (color theme) on the authenticated staff account."""

    service = AuthService(session=session, settings=settings)
    return await service.update_preferences(subject, payload)
