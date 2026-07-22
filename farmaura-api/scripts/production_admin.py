"""
farmaura-api/scripts/production_admin.py

Production admin bootstrap for Farmaura.

Responsibilities:
- create the single real administrator account on first boot in production;
- keep production databases free of scripts/seed.py's fictional dataset.

Observations:
- runs only from bootstrap_database.py, only when APP_ENV=production and the
  users table is empty (see should_seed_database in bootstrap_database.py);
- idempotent: a second call is a no-op once the account exists;
- creates no store, customer, or operational data — the real store/CNPJ is
  registered by the admin afterwards through the internal portal (/stores).
"""

from __future__ import annotations

from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.password_hashing import hash_password
from app.domain.enums import AccessScope, UserRole
from app.models.user import User
from app.repositories.user_repository import UserRepository


PRODUCTION_TENANT_ID = str(uuid5(NAMESPACE_URL, "https://drogariafarmaura.com.br/tenant/main"))


async def ensure_production_admin(*, session_factory: async_sessionmaker[AsyncSession]) -> None:
    """Create the configured production administrator account if it does not exist yet."""

    settings = get_settings()
    email = settings.initial_admin_email.strip().lower()
    password = settings.initial_admin_password

    if not email or not password:
        raise RuntimeError(
            "APP_INITIAL_ADMIN_EMAIL and APP_INITIAL_ADMIN_PASSWORD must be set to bootstrap "
            "the production database — refusing to boot with no way to log in."
        )

    async with session_factory() as session:
        repository = UserRepository(session)
        existing_user = await repository.get_by_email(email)
        if existing_user is not None:
            return

        admin = User(
            id=str(uuid5(NAMESPACE_URL, "https://drogariafarmaura.com.br/user/" + email)),
            tenant_id=PRODUCTION_TENANT_ID,
            email=email,
            password_hash=hash_password(password),
            full_name="Administrador Farmaura",
            role=UserRole.ADMIN.value,
            access_scope=AccessScope.HYBRID.value,
            two_factor_enabled=False,
            two_factor_secret="",
            session_version=1,
            is_active=True,
        )
        await repository.add(admin)
        await session.commit()
