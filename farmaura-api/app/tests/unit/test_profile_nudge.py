"""
farmaura-api/app/tests/unit/test_profile_nudge.py

Unit tests for the server-side "complete your profile" popup rules.

Responsibilities:
- cover which profile fields count as missing;
- cover the 14-day snooze window, including its edges and naive timestamps;
- cover the service verdict built from persisted customer data and addresses;

Observations:
- the persistence of the snooze (POST /customers/me/profile-nudge/dismiss) needs a real
  database and is exercised end to end against Postgres, not here;
"""

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.domain.profile_nudge import (
    PROFILE_NUDGE_COOLDOWN,
    ProfileNudgeField,
    is_profile_nudge_due,
    missing_promotion_profile_fields,
)
from app.schemas.customers import ProfileNudgeResponse
from app.services.customer_service import CustomerService

NOW = datetime(2026, 9, 20, 12, 0, tzinfo=UTC)
ALL_MISSING = list(ProfileNudgeField)


# ============================================================================
# MISSING FIELDS
# ============================================================================


def test_everything_blank_reports_all_seven_fields_in_display_order() -> None:
    """Ensure an empty profile lists every field, phone through address, in display order."""

    missing = missing_promotion_profile_fields(
        phone="", cpf="", birth_date="", gender="", marital_status="",
        children_count=None, has_primary_address=False,
    )

    assert missing == [
        ProfileNudgeField.PHONE,
        ProfileNudgeField.CPF,
        ProfileNudgeField.BIRTH_DATE,
        ProfileNudgeField.GENDER,
        ProfileNudgeField.MARITAL_STATUS,
        ProfileNudgeField.CHILDREN,
        ProfileNudgeField.ADDRESS,
    ]


def test_complete_profile_reports_nothing_missing() -> None:
    """Ensure a fully filled profile leaves the list empty."""

    assert missing_promotion_profile_fields(
        phone="+55 61 99999-0000",
        cpf="123.456.789-00",
        birth_date="1990-01-01",
        gender="Feminino",
        marital_status="solteiro",
        children_count=2,
        has_primary_address=True,
    ) == []


def test_zero_children_counts_as_answered() -> None:
    """Ensure "no children" (0) is an answer, not a gap; only None means unanswered."""

    missing = missing_promotion_profile_fields(
        phone="x", cpf="x", birth_date="x", gender="x", marital_status="x",
        children_count=0, has_primary_address=True,
    )

    assert ProfileNudgeField.CHILDREN not in missing


@pytest.mark.parametrize("blank", ["", "   ", None])
def test_blank_or_whitespace_text_counts_as_missing(blank: str | None) -> None:
    """Ensure empty, whitespace-only and null text fields are treated as not filled."""

    missing = missing_promotion_profile_fields(
        phone="x", cpf="x", birth_date="x", gender=blank, marital_status=blank,
        children_count=1, has_primary_address=True,
    )

    assert missing == [ProfileNudgeField.GENDER, ProfileNudgeField.MARITAL_STATUS]


@pytest.mark.parametrize("blank", ["", "   ", None])
def test_contact_and_document_fields_blank_counts_as_missing(blank: str | None) -> None:
    """Ensure phone, CPF and birth date follow the same blank-or-whitespace rule as the rest."""

    missing = missing_promotion_profile_fields(
        phone=blank, cpf=blank, birth_date=blank, gender="x", marital_status="x",
        children_count=1, has_primary_address=True,
    )

    assert missing == [ProfileNudgeField.PHONE, ProfileNudgeField.CPF, ProfileNudgeField.BIRTH_DATE]


# ============================================================================
# SNOOZE WINDOW
# ============================================================================


def test_due_when_something_is_missing_and_never_dismissed() -> None:
    """Ensure a customer who never snoozed the popup is asked."""

    assert is_profile_nudge_due(missing=ALL_MISSING, dismissed_at=None, now=NOW) is True


def test_never_due_when_nothing_is_missing() -> None:
    """Ensure a complete profile is never asked, dismissed or not."""

    assert is_profile_nudge_due(missing=[], dismissed_at=None, now=NOW) is False
    assert is_profile_nudge_due(missing=[], dismissed_at=NOW - timedelta(days=90), now=NOW) is False


def test_not_due_inside_the_snooze_window() -> None:
    """Ensure a customer who snoozed a moment ago, or 13 days ago, is left alone."""

    assert is_profile_nudge_due(missing=ALL_MISSING, dismissed_at=NOW, now=NOW) is False
    assert is_profile_nudge_due(
        missing=ALL_MISSING, dismissed_at=NOW - timedelta(days=13), now=NOW,
    ) is False


def test_due_again_exactly_when_the_window_ends() -> None:
    """Ensure the popup returns at 14 days, and not one second before."""

    one_second_short = NOW - PROFILE_NUDGE_COOLDOWN + timedelta(seconds=1)

    assert is_profile_nudge_due(
        missing=ALL_MISSING, dismissed_at=one_second_short, now=NOW,
    ) is False
    assert is_profile_nudge_due(
        missing=ALL_MISSING, dismissed_at=NOW - PROFILE_NUDGE_COOLDOWN, now=NOW,
    ) is True


def test_naive_timestamp_is_read_as_utc() -> None:
    """Ensure a timezone-less stored value (e.g. from SQLite) does not crash the comparison."""

    naive = (NOW - timedelta(days=1)).replace(tzinfo=None)

    assert is_profile_nudge_due(missing=ALL_MISSING, dismissed_at=naive, now=NOW) is False


# ============================================================================
# SERVICE VERDICT
# ============================================================================


class _FakeAddressRepository:
    """Return a fixed address list regardless of the customer asked for."""

    def __init__(self, addresses: list[object]) -> None:
        self._addresses = addresses

    async def list_for_customer(self, *, customer_id: str) -> list[object]:
        return self._addresses


def _service_with(addresses: list[object]) -> CustomerService:
    service = CustomerService(session=None)  # type: ignore[arg-type]
    service.address_repository = _FakeAddressRepository(addresses)  # type: ignore[assignment]
    return service


def _verdict_for(customer: object, addresses: list[object]) -> ProfileNudgeResponse:
    return asyncio.run(_service_with(addresses)._build_profile_nudge(customer))


def _customer(**overrides: object) -> SimpleNamespace:
    # phone/cpf/birth_date default to filled here so the existing gender/marital/children-focused
    # tests below don't need to change — a dedicated test covers the three new fields blank.
    base = {
        "id": "c1",
        "phone": "x",
        "cpf": "x",
        "birth_date": "x",
        "gender": "",
        "marital_status": "",
        "children_count": None,
        "profile_nudge_dismissed_at": None,
    }
    return SimpleNamespace(**{**base, **overrides})


def test_service_without_a_customer_row_never_shows() -> None:
    """Ensure a subject with no customer record gets a quiet verdict (nowhere to snooze)."""

    verdict = _verdict_for(None, [])

    assert verdict.should_show is False
    assert verdict.missing_fields == []


def test_service_shows_for_incomplete_customer_and_lists_the_gaps() -> None:
    """Ensure the verdict reads gender/civil/children, plus address from the repository."""

    customer = _customer(gender="Feminino")
    verdict = _verdict_for(customer, [SimpleNamespace(is_primary=True)])

    assert verdict.should_show is True
    assert verdict.missing_fields == [ProfileNudgeField.MARITAL_STATUS, ProfileNudgeField.CHILDREN]


def test_service_reads_phone_cpf_and_birth_date_from_the_customer() -> None:
    """Ensure a Google-only customer (name/e-mail) is asked for phone, CPF and birth date too."""

    customer = _customer(
        phone="", cpf="", birth_date="", gender="x", marital_status="x", children_count=0,
    )
    verdict = _verdict_for(customer, [SimpleNamespace(is_primary=True)])

    assert verdict.should_show is True
    assert verdict.missing_fields == [
        ProfileNudgeField.PHONE, ProfileNudgeField.CPF, ProfileNudgeField.BIRTH_DATE,
    ]


def test_service_a_non_primary_address_does_not_count() -> None:
    """Ensure only a primary address satisfies the address field."""

    customer = _customer(gender="x", marital_status="x", children_count=0)
    verdict = _verdict_for(customer, [SimpleNamespace(is_primary=False)])

    assert verdict.missing_fields == [ProfileNudgeField.ADDRESS]


def test_service_respects_a_recent_snooze_and_a_stale_one() -> None:
    """Ensure the stored timestamp, read at the real clock, snoozes the popup for 14 days only."""

    recent = _customer(profile_nudge_dismissed_at=datetime.now(UTC) - timedelta(days=1))
    stale = _customer(profile_nudge_dismissed_at=datetime.now(UTC) - timedelta(days=15))

    assert _verdict_for(recent, []).should_show is False
    assert _verdict_for(stale, []).should_show is True


def test_service_complete_customer_is_quiet() -> None:
    """Ensure a complete customer is never shown the popup."""

    customer = _customer(gender="x", marital_status="x", children_count=0)
    verdict = _verdict_for(customer, [SimpleNamespace(is_primary=True)])

    assert verdict.should_show is False
