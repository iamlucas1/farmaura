"""
farmaura-api/app/services/auth_service.py

Authentication service for Farmaura.

Responsibilities:
- validate user credentials;
- issue short-lived access tokens and rotating refresh tokens;
- centralize authentication business rules;

Observations:
- refresh token persistence is scaffolded and should be expanded next;
- failed-login lockout is enforced per account via app.core.login_guard
  (Valkey-backed, exponential backoff); per-IP rate limiting on the route
  itself is enforced via app.core.rate_limit.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.jwt import (
    create_access_token,
    create_mfa_challenge_token,
    create_password_reset_challenge_token,
    create_refresh_token,
    decode_mfa_challenge_token,
    decode_password_reset_challenge_token,
    decode_refresh_token,
)
from app.core.login_guard import (
    assert_not_locked,
    clear_failed_attempts,
    register_failed_attempt,
    resolve_and_consume_unlock_token,
)
from app.core.password_hashing import hash_password, verify_password
from app.core.token_fingerprints import hash_refresh_token
from app.core.tenant_context import apply_authenticated_context, apply_login_context
from app.core.two_factor import build_totp_provisioning_uri, generate_totp_secret, verify_totp_code
from app.domain.enums import AccessScope, PortalName, UserRole
from app.domain.errors import AuthenticationError
from app.domain.permissions import can_access_portal
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AuthenticatedResponse,
    CompletePasswordResetRequest,
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
)
from app.services.notification_service import NotificationService


# ============================================================================
# AUTH SERVICE
# ============================================================================


class AuthService:
    """Handle login and token issuance flows."""

    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        """Store dependencies required for authentication."""

        self.session = session
        self.settings = settings
        self.user_repository = UserRepository(session)
        self.refresh_token_repository = RefreshTokenRepository(session)

    async def login(
        self,
        payload: LoginRequest,
        *,
        ip_address: str,
        user_agent: str,
    ) -> AuthenticatedResponse | TwoFactorChallengeResponse | PasswordChangeRequiredResponse:
        """Validate credentials and continue the authentication flow."""

        normalized_email = payload.email.strip().lower()
        await assert_not_locked(normalized_email)
        await apply_login_context(self.session, normalized_email)
        user = await self.user_repository.get_by_email(normalized_email)
        if user is None or not verify_password(payload.password, user.password_hash):
            lockout = await register_failed_attempt(normalized_email)
            if lockout is not None and user is not None:
                unlock_token, lockout_seconds = lockout
                unlock_url = f"{self.settings.marketplace_base_url.rstrip('/')}/marketplace/unlock-account?token={unlock_token}"
                NotificationService().send_account_locked_email(
                    email=user.email,
                    full_name=user.full_name,
                    unlock_url=unlock_url,
                    lockout_minutes=max(1, lockout_seconds // 60),
                )
            raise AuthenticationError()
        await clear_failed_attempts(normalized_email)
        role = UserRole(user.role)
        access_scope = AccessScope(user.access_scope)
        self._ensure_portal_login_allowed(role=role, access_scope=access_scope, portal=payload.portal)
        user_id = UUID(user.id)
        tenant_id = UUID(user.tenant_id)
        if user.must_change_password:
            challenge_token = create_password_reset_challenge_token(
                settings=self.settings,
                user_id=user_id,
                tenant_id=tenant_id,
                role=role,
                access_scope=access_scope,
                portal=payload.portal,
                remember_session=payload.remember_session,
                session_version=user.session_version,
            )
            return PasswordChangeRequiredResponse(
                challenge_token=challenge_token,
                challenge_expires_in_seconds=self.settings.jwt_password_reset_ttl_minutes * 60,
            )
        if user.two_factor_enabled:
            if not user.two_factor_secret.strip():
                raise AuthenticationError("Two-factor authentication is not configured.")
            challenge_token = create_mfa_challenge_token(
                settings=self.settings,
                user_id=user_id,
                tenant_id=tenant_id,
                role=role,
                access_scope=access_scope,
                portal=payload.portal,
                remember_session=payload.remember_session,
                session_version=user.session_version,
            )
            return TwoFactorChallengeResponse(
                challenge_token=challenge_token,
                challenge_expires_in_seconds=self.settings.jwt_mfa_ttl_minutes * 60,
            )
        token_pair = await self._issue_token_pair(
            user_id=user_id,
            tenant_id=tenant_id,
            role=role,
            access_scope=access_scope,
            session_version=user.session_version,
            remember_session=payload.remember_session,
            ip_address=ip_address,
            user_agent=user_agent,
            store_id=user.store_id,
        )
        return AuthenticatedResponse(token_pair=token_pair)

    async def verify_two_factor(
        self,
        payload: TwoFactorVerifyRequest,
        *,
        ip_address: str,
        user_agent: str,
    ) -> AuthenticatedResponse:
        """Validate a second-factor code and issue session tokens."""

        challenge_payload = decode_mfa_challenge_token(token=payload.challenge_token, settings=self.settings)
        user = await self.user_repository.get_by_id(str(challenge_payload["sub"]))
        if user is None:
            raise AuthenticationError()
        if not user.two_factor_enabled or not user.two_factor_secret.strip():
            raise AuthenticationError("Two-factor authentication is not configured.")
        if int(challenge_payload["session_version"]) != user.session_version:
            raise AuthenticationError("Authentication challenge expired.")
        self._ensure_portal_login_allowed(
            role=UserRole(user.role),
            access_scope=AccessScope(user.access_scope),
            portal=PortalName(str(challenge_payload["portal"])),
        )
        if not verify_totp_code(user.two_factor_secret, payload.code):
            raise AuthenticationError("Invalid two-factor code.")
        token_pair = await self._issue_token_pair(
            user_id=UUID(user.id),
            tenant_id=UUID(user.tenant_id),
            role=UserRole(user.role),
            access_scope=AccessScope(user.access_scope),
            session_version=user.session_version,
            remember_session=bool(challenge_payload["remember_session"]),
            ip_address=ip_address,
            user_agent=user_agent,
            store_id=user.store_id,
        )
        return AuthenticatedResponse(token_pair=token_pair)

    async def complete_password_reset(
        self,
        payload: CompletePasswordResetRequest,
        *,
        ip_address: str,
        user_agent: str,
    ) -> AuthenticatedResponse:
        """Set a new password for a mandatory first-access reset and issue session tokens."""

        challenge_payload = decode_password_reset_challenge_token(token=payload.challenge_token, settings=self.settings)
        user = await self.user_repository.get_by_id(str(challenge_payload["sub"]))
        if user is None:
            raise AuthenticationError()
        if not user.must_change_password:
            raise AuthenticationError("Password change is not pending for this account.")
        if int(challenge_payload["session_version"]) != user.session_version:
            raise AuthenticationError("Authentication challenge expired.")
        self._ensure_portal_login_allowed(
            role=UserRole(user.role),
            access_scope=AccessScope(user.access_scope),
            portal=PortalName(str(challenge_payload["portal"])),
        )
        await apply_authenticated_context(self.session, tenant_id=user.tenant_id, user_id=user.id)
        user.password_hash = hash_password(payload.new_password)
        user.must_change_password = False
        await self.user_repository.save(user)
        token_pair = await self._issue_token_pair(
            user_id=UUID(user.id),
            tenant_id=UUID(user.tenant_id),
            role=UserRole(user.role),
            access_scope=AccessScope(user.access_scope),
            session_version=user.session_version,
            remember_session=bool(challenge_payload["remember_session"]),
            ip_address=ip_address,
            user_agent=user_agent,
            store_id=user.store_id,
        )
        return AuthenticatedResponse(token_pair=token_pair)

    async def issue_session_for_user(
        self,
        user: User,
        *,
        remember_session: bool,
        ip_address: str,
        user_agent: str,
    ) -> AuthenticatedResponse:
        """Issue session tokens for an already-provisioned user, such as a fresh registration."""

        token_pair = await self._issue_token_pair(
            user_id=UUID(user.id),
            tenant_id=UUID(user.tenant_id),
            role=UserRole(user.role),
            access_scope=AccessScope(user.access_scope),
            session_version=user.session_version,
            remember_session=remember_session,
            ip_address=ip_address,
            user_agent=user_agent,
            store_id=user.store_id,
        )
        return AuthenticatedResponse(token_pair=token_pair)

    async def begin_two_factor_setup(self, subject: TokenSubject) -> TwoFactorSetupResponse:
        """Create a fresh authenticator-app enrollment secret for the subject."""

        user = await self._get_subject_user(subject)
        if user.two_factor_enabled:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-factor authentication is already enabled.")
        user.two_factor_secret = generate_totp_secret()
        await self.user_repository.save(user)
        await self.session.commit()
        return self._build_two_factor_setup_response(user)

    async def enable_two_factor(self, subject: TokenSubject, payload: TwoFactorEnableRequest) -> TwoFactorOperationResponse:
        """Activate two-factor authentication after verifying the authenticator code."""

        user = await self._get_subject_user(subject)
        if user.two_factor_enabled:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-factor authentication is already enabled.")
        if not user.two_factor_secret.strip():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-factor enrollment has not been started.")
        if not verify_totp_code(user.two_factor_secret, payload.code):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid authenticator code.")
        user.two_factor_enabled = True
        await self.user_repository.save(user)
        await self.session.commit()
        return TwoFactorOperationResponse(
            detail="Two-factor authentication enabled.",
            two_factor_enabled=True,
        )

    async def disable_two_factor(self, subject: TokenSubject, payload: TwoFactorDisableRequest) -> TwoFactorOperationResponse:
        """Disable two-factor authentication after verifying the authenticator code."""

        user = await self._get_subject_user(subject)
        if not user.two_factor_enabled or not user.two_factor_secret.strip():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-factor authentication is not enabled.")
        if not verify_totp_code(user.two_factor_secret, payload.code):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid authenticator code.")
        user.two_factor_enabled = False
        user.two_factor_secret = ""
        await self.user_repository.save(user)
        await self.session.commit()
        return TwoFactorOperationResponse(
            detail="Two-factor authentication disabled.",
            two_factor_enabled=False,
        )

    async def refresh(
        self,
        payload: RefreshRequest,
        *,
        ip_address: str,
        user_agent: str,
    ) -> TokenPair:
        """Rotate a refresh token and issue a new token pair."""

        refresh_payload = decode_refresh_token(token=payload.refresh_token, settings=self.settings)
        await apply_authenticated_context(self.session, tenant_id="", user_id=str(refresh_payload["sub"]))
        refresh_record = await self.refresh_token_repository.get_by_token_id(str(refresh_payload["jti"]))
        if refresh_record is None:
            raise AuthenticationError("Refresh token not recognized.")
        await apply_authenticated_context(self.session, tenant_id=refresh_record.tenant_id, user_id=refresh_record.user_id)
        presented_hash = hash_refresh_token(payload.refresh_token)
        if refresh_record.token_hash != presented_hash:
            await self.refresh_token_repository.revoke_family(
                family_id=refresh_record.family_id,
                reason="refresh_token_reuse_detected",
            )
            await self.session.commit()
            raise AuthenticationError("Refresh token compromised.")
        if refresh_record.is_revoked:
            await self.refresh_token_repository.revoke_family(
                family_id=refresh_record.family_id,
                reason="refresh_token_reuse_detected",
            )
            await self.session.commit()
            raise AuthenticationError("Refresh token revoked.")
        if refresh_record.expires_at <= datetime.now(tz=UTC):
            await self.refresh_token_repository.revoke(refresh_record, reason="refresh_token_expired")
            await self.session.commit()
            raise AuthenticationError("Refresh token expired.")
        user = await self.user_repository.get_by_id(str(refresh_payload["sub"]))
        if user is None:
            raise AuthenticationError()
        if int(refresh_payload["session_version"]) != user.session_version or refresh_record.session_version != user.session_version:
            await self.refresh_token_repository.revoke_family(
                family_id=refresh_record.family_id,
                reason="session_version_mismatch",
            )
            await self.session.commit()
            raise AuthenticationError("Session invalidated.")
        await self.refresh_token_repository.mark_used(refresh_record)
        replacement_token_id = str(uuid4())
        await self.refresh_token_repository.revoke(
            refresh_record,
            reason="refresh_token_rotated",
            replaced_by_token_id=replacement_token_id,
        )
        token_pair = await self._issue_token_pair(
            user_id=UUID(user.id),
            tenant_id=UUID(user.tenant_id),
            role=UserRole(user.role),
            access_scope=AccessScope(user.access_scope),
            session_version=user.session_version,
            remember_session=refresh_record.issued_for_remember_session,
            ip_address=ip_address,
            user_agent=user_agent,
            family_id=UUID(refresh_record.family_id),
            token_id=UUID(replacement_token_id),
            store_id=user.store_id,
        )
        return token_pair

    async def logout(self, payload: LogoutRequest) -> LogoutResponse:
        """Revoke the presented refresh token."""

        refresh_payload = decode_refresh_token(token=payload.refresh_token, settings=self.settings)
        await apply_authenticated_context(self.session, tenant_id="", user_id=str(refresh_payload["sub"]))
        refresh_record = await self.refresh_token_repository.get_by_token_id(str(refresh_payload["jti"]))
        if refresh_record is None:
            raise AuthenticationError("Refresh token not recognized.")
        await apply_authenticated_context(self.session, tenant_id=refresh_record.tenant_id, user_id=refresh_record.user_id)
        if refresh_record.token_hash != hash_refresh_token(payload.refresh_token):
            await self.refresh_token_repository.revoke_family(
                family_id=refresh_record.family_id,
                reason="logout_with_mismatched_token",
            )
            await self.session.commit()
            raise AuthenticationError("Refresh token compromised.")
        if not refresh_record.is_revoked:
            await self.refresh_token_repository.revoke(refresh_record, reason="user_logout")
            await self.session.commit()
        return LogoutResponse(detail="Session terminated.")

    async def logout_all(self, subject: TokenSubject) -> LogoutAllResponse:
        """Invalidate all sessions for the authenticated user."""

        user = await self.user_repository.get_by_id(str(subject.user_id))
        if user is None:
            raise AuthenticationError()
        await self.user_repository.increment_session_version(user)
        await self.refresh_token_repository.revoke_all_for_user(
            user_id=user.id,
            reason="user_logout_all",
        )
        await self.session.commit()
        return LogoutAllResponse(detail="All sessions invalidated.")

    async def unlock_account(self, payload: UnlockAccountRequest) -> UnlockAccountResponse:
        """End an active brute-force lockout using the token from the lockout notification e-mail."""

        email = await resolve_and_consume_unlock_token(payload.token)
        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link de desbloqueio inválido ou expirado.")
        await clear_failed_attempts(email)
        return UnlockAccountResponse(detail="Conta desbloqueada com sucesso. Você já pode tentar entrar novamente.")

    def _ensure_portal_login_allowed(
        self,
        *,
        role: UserRole,
        access_scope: AccessScope,
        portal: PortalName,
    ) -> None:
        """Fail closed when credentials are used against the wrong portal."""

        if not can_access_portal(role, access_scope, portal):
            raise AuthenticationError()

    async def _get_subject_user(self, subject: TokenSubject):
        """Load the authenticated user that owns the current session."""

        user = await self.user_repository.get_by_id(str(subject.user_id))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Authenticated user was not found.")
        return user

    def _build_two_factor_setup_response(self, user: object) -> TwoFactorSetupResponse:
        """Build the authenticator-app enrollment payload for the user."""

        account_name = getattr(user, "email", "") or getattr(user, "full_name", "") or str(getattr(user, "id", "user"))
        issuer = "Farmaura"
        manual_entry_key = getattr(user, "two_factor_secret", "").strip().replace(" ", "").upper()
        provisioning_uri = build_totp_provisioning_uri(
            issuer=issuer,
            account_name=account_name,
            secret=manual_entry_key,
        )
        return TwoFactorSetupResponse(
            enabled=False,
            issuer=issuer,
            account_name=account_name,
            manual_entry_key=manual_entry_key,
            provisioning_uri=provisioning_uri,
        )

    async def _issue_token_pair(
        self,
        *,
        user_id: UUID,
        tenant_id: UUID,
        role: UserRole,
        access_scope: AccessScope,
        session_version: int,
        remember_session: bool,
        ip_address: str,
        user_agent: str,
        family_id: UUID | None = None,
        token_id: UUID | None = None,
        store_id: str | None = None,
    ) -> TokenPair:
        """Create access and refresh tokens and persist refresh state."""

        access_token = create_access_token(
            settings=self.settings,
            user_id=user_id,
            tenant_id=tenant_id,
            role=role,
            access_scope=access_scope,
            session_version=session_version,
            store_id=store_id,
        )
        issued_family_id = family_id or uuid4()
        issued_token_id = token_id or uuid4()
        refresh_ttl_days = (
            self.settings.jwt_refresh_remember_ttl_days
            if remember_session
            else self.settings.jwt_refresh_ttl_days
        )
        refresh_token = create_refresh_token(
            settings=self.settings,
            user_id=user_id,
            family_id=issued_family_id,
            token_id=issued_token_id,
            ttl_days=refresh_ttl_days,
            session_version=session_version,
        )
        expires_at = datetime.now(tz=UTC) + timedelta(days=refresh_ttl_days)
        await apply_authenticated_context(self.session, tenant_id=str(tenant_id), user_id=str(user_id))
        token_record = RefreshToken(
            id=str(uuid4()),
            user_id=str(user_id),
            tenant_id=str(tenant_id),
            token_id=str(issued_token_id),
            family_id=str(issued_family_id),
            token_hash=hash_refresh_token(refresh_token),
            expires_at=expires_at,
            issued_for_remember_session=remember_session,
            session_version=session_version,
            ip_address=ip_address[:64],
            user_agent=user_agent[:512],
            last_used_at=datetime.now(tz=UTC),
        )
        self.session.add(token_record)
        await self.session.commit()
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            subject=TokenSubject(
                user_id=user_id,
                tenant_id=tenant_id,
                role=role,
                access_scope=access_scope,
                session_version=session_version,
                store_id=store_id or None,
            ),
        )
