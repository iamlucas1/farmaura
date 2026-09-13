"""
farmaura-api/app/services/customer_access_service.py

Shared provisioning of marketplace login access ("first access") for a customer record.

Responsibilities:
- create (or renew, if still pending) a CUSTOMER-role User with a temporary password for a
  given e-mail, and send the first-access e-mail through NotificationService;
- stay a safe no-op when the account already completed its first access — callers never need
  to check this themselves before calling.

Observations:
- used both by the public self-service request (PortalService.request_marketplace_first_access,
  for a customer who already has a CRM record but no login yet) and by internal staff flows that
  register a customer with a real e-mail up front (CrmService.create_customer, via PDV) and want
  the same temporary-password e-mail sent immediately as part of that same registration — one
  User-provisioning implementation, not two;
- does not commit the session — callers are responsible for their own transaction boundary
  (matches every other repository/service method in this codebase).
"""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.password_hashing import generate_temporary_password, hash_password
from app.domain.enums import AccessScope, UserRole
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.notification_service import NotificationService

logger = get_logger("customer_access")


async def provision_first_access(session: AsyncSession, *, tenant_id: str, email: str, full_name: str) -> None:
    """Create/renew a marketplace login for `email` and send the first-access e-mail.

    No-op when `email` is blank, or when the account already exists and has already completed
    its first access (`must_change_password` already False) — same anti-spam behavior already
    relied upon by the public self-service endpoint.
    """

    normalized_email = email.strip().lower()
    if not normalized_email:
        return
    user_repository = UserRepository(session)
    user = await user_repository.get_by_email(normalized_email)
    temporary_password = generate_temporary_password()
    if user is None:
        user = User(
            id=str(uuid4()),
            tenant_id=tenant_id,
            email=normalized_email,
            password_hash=hash_password(temporary_password),
            full_name=full_name,
            role=UserRole.CUSTOMER.value,
            access_scope=AccessScope.MARKETPLACE.value,
            must_change_password=True,
        )
        await user_repository.add(user)
    elif user.must_change_password:
        user.password_hash = hash_password(temporary_password)
        await user_repository.save(user)
    else:
        return

    sent, detail = NotificationService().send_first_access_email(
        email=normalized_email,
        full_name=full_name,
        temporary_password=temporary_password,
    )
    log = logger.info if sent else logger.warning
    log("first_access.email_dispatch", email=normalized_email, sent=sent, detail=detail)
