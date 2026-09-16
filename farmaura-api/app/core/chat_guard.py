"""
farmaura-api/app/core/chat_guard.py

Per-customer chat spam guard for Farmaura.

Responsibilities:
- count customer chat messages in a rolling one-minute window and reject the
  ones that exceed the per-customer limit;
- escalate repeat offenders through an exponential temporary block, then a
  permanent block once they keep tripping the limit after unblocking;
- expose the block state so a pharmacist can see it and lift it.

Observations:
- mirrors the two-tier split already used elsewhere in this codebase: the
  high-frequency, low-stakes signal (the rolling message count) lives in
  Valkey and fails open exactly like app.core.rate_limit, while the
  consequence that actually matters (a block, especially a permanent one)
  is a persisted Customer column so it survives a restart, is visible to
  staff, and is seedable for testing — Valkey alone would lose a permanent
  block the moment its TTL-managed key expired or the cache was flushed;
- structured the same way as app.core.login_guard's exponential lockout
  (BASE * multiplier per step, capped, then a hard stop) rather than a raw
  `2 ** n` formula, so the four concrete step durations stay easy to read
  and to tune independently of each other.
"""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.valkey_client import get_valkey
from app.models.customer import Customer

NORMAL_MESSAGES_PER_MINUTE = 5
FLAGGED_MESSAGES_PER_MINUTE = 2
MESSAGE_WINDOW_SECONDS = 60

# Duration applied for the Nth violation (1-indexed) while chat_violation_count
# stays at or below this list's length; one more violation past the end makes
# the block permanent instead of picking a 5th duration.
BLOCK_DURATIONS_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60]


def _message_window_key(customer_id: str) -> str:
    """Return the Valkey key tracking one customer's rolling one-minute message count."""

    return f"chat:msgs:{customer_id}"


def _effective_limit(customer: Customer) -> int:
    """Return the customer's current per-minute message limit."""

    return FLAGGED_MESSAGES_PER_MINUTE if customer.chat_flagged_spam else NORMAL_MESSAGES_PER_MINUTE


def _format_minutes(seconds: int) -> str:
    """Return a short pt-BR duration label for a block's remaining time."""

    minutes = max(1, round(seconds / 60))
    return "1 minuto" if minutes == 1 else f"{minutes} minutos"


async def check_and_register_customer_message(session: AsyncSession, customer: Customer) -> None:
    """Reject the message with 429 if the customer is blocked or just tripped the limit.

    Call this once, before persisting any customer-authored chat message or prescription
    upload. On the branch that registers a fresh violation, this commits `session` itself
    (there is nothing else pending yet at that point in the caller) so the escalated block
    survives even though the request then fails — otherwise the session would simply be
    closed without a commit once the raised HTTPException propagates past the route, and
    the violation that just got recorded in memory would silently vanish.
    """

    now = datetime.now(UTC)

    if customer.chat_permanently_blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Seu acesso ao chat foi bloqueado por uso indevido. Fale conosco pelo WhatsApp.",
        )

    if customer.chat_blocked_until is not None and customer.chat_blocked_until > now:
        remaining = int((customer.chat_blocked_until - now).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Você atingiu o limite de mensagens. Tente novamente em {_format_minutes(remaining)}.",
            headers={"Retry-After": str(max(1, remaining))},
        )

    try:
        valkey = get_valkey()
        key = _message_window_key(customer.id)
        current = await valkey.incr(key)
        if current == 1:
            await valkey.expire(key, MESSAGE_WINDOW_SECONDS)
    except Exception:
        return

    if current <= _effective_limit(customer):
        return

    # The customer just crossed their limit for the first time since their last
    # unblock — register one violation and apply the next escalation step.
    customer.chat_violation_count = int(customer.chat_violation_count or 0) + 1
    try:
        await get_valkey().delete(_message_window_key(customer.id))
    except Exception:
        pass

    step_index = customer.chat_violation_count - 1
    if step_index < len(BLOCK_DURATIONS_SECONDS):
        lockout_seconds = BLOCK_DURATIONS_SECONDS[step_index]
        customer.chat_blocked_until = now + timedelta(seconds=lockout_seconds)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Você atingiu o limite de mensagens. Tente novamente em {_format_minutes(lockout_seconds)}.",
            headers={"Retry-After": str(lockout_seconds)},
        )

    customer.chat_permanently_blocked = True
    customer.chat_blocked_until = None
    await session.commit()
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Seu acesso ao chat foi bloqueado por uso indevido. Fale conosco pelo WhatsApp.",
    )


def clear_customer_block(customer: Customer) -> None:
    """Lift any active block and reset the violation count — a clean slate.

    Used both by the pharmacist's direct "unblock" override and by approving a
    customer's unblock-request appeal; a denied appeal never calls this.
    """

    customer.chat_blocked_until = None
    customer.chat_permanently_blocked = False
    customer.chat_violation_count = 0


def is_customer_blocked(customer: Customer) -> bool:
    """Return whether the customer is currently under a temporary or permanent block."""

    if customer.chat_permanently_blocked:
        return True
    return customer.chat_blocked_until is not None and customer.chat_blocked_until > datetime.now(UTC)
