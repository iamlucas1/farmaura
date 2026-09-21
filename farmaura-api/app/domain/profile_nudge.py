"""
farmaura-api/app/domain/profile_nudge.py

Pure rules for the marketplace "complete your profile" popup.

Responsibilities:
- name the profile fields promotions can target (gender, marital status, children, region);
- list which of them a customer has not filled yet;
- decide whether the popup is due, given what is missing and when the customer last snoozed it;

Observations:
- no I/O: the service loads the customer/addresses and persists the snooze timestamp
  (customers.profile_nudge_dismissed_at); keeping the decision server-side means a cleared
  browser, a second device or a tampered client can never change whether the popup shows;
- this only drives a friendly nudge. Promotion eligibility is always re-evaluated from the
  persisted customer record (see pricing_promotion_service.py), never from these flags;
"""

from datetime import UTC, datetime, timedelta
from enum import StrEnum

# How long "Agora não" keeps the popup away before the customer is asked again.
PROFILE_NUDGE_COOLDOWN = timedelta(days=14)


# ============================================================================
# PROFILE NUDGE RULES
# ============================================================================


class ProfileNudgeField(StrEnum):
    """Profile fields the popup asks the customer to complete."""

    GENDER = "gender"
    MARITAL_STATUS = "marital_status"
    CHILDREN = "children"
    ADDRESS = "address"


def missing_promotion_profile_fields(
    *,
    gender: str | None,
    marital_status: str | None,
    children_count: int | None,
    has_primary_address: bool,
) -> list[ProfileNudgeField]:
    """Return the promotion-relevant profile fields the customer has not filled yet, in display order."""

    missing: list[ProfileNudgeField] = []
    if not (gender or "").strip():
        missing.append(ProfileNudgeField.GENDER)
    if not (marital_status or "").strip():
        missing.append(ProfileNudgeField.MARITAL_STATUS)
    if children_count is None:
        missing.append(ProfileNudgeField.CHILDREN)
    if not has_primary_address:
        missing.append(ProfileNudgeField.ADDRESS)
    return missing


def is_profile_nudge_due(
    *,
    missing: list[ProfileNudgeField],
    dismissed_at: datetime | None,
    now: datetime,
) -> bool:
    """Return whether the popup should be shown: something is missing and no snooze is still running."""

    if not missing:
        return False
    if dismissed_at is None:
        return True
    if dismissed_at.tzinfo is None:
        dismissed_at = dismissed_at.replace(tzinfo=UTC)
    return now - dismissed_at >= PROFILE_NUDGE_COOLDOWN
