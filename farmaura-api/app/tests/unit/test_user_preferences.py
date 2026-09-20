"""
farmaura-api/app/tests/unit/test_user_preferences.py

Unit tests for the per-account console preferences contract.

Responsibilities:
- validate the accepted color-theme values;
- reject unknown values, unknown fields, and missing fields;
- keep the session contract defaulting to the automatic theme;

Observations:
- persistence and RLS behavior need database-backed fixtures and are not covered here;
"""

import pytest
from pydantic import ValidationError

from app.domain.enums import UiTheme
from app.models.user import User
from app.schemas.auth import UserPreferencesRequest


# ============================================================================
# PREFERENCES REQUEST TESTS
# ============================================================================


@pytest.mark.parametrize("value", ["auto", "light", "dark"])
def test_preferences_request_accepts_every_supported_theme(value: str) -> None:
    """Ensure each documented theme value is accepted and normalized to the enum."""

    assert UserPreferencesRequest(ui_theme=value).ui_theme == UiTheme(value)


@pytest.mark.parametrize("value", ["", "blue", "Dark", "DARK", "system", "<script>", None, 1])
def test_preferences_request_rejects_unknown_theme_values(value: object) -> None:
    """Ensure anything outside the theme allowlist is rejected, including case variants."""

    with pytest.raises(ValidationError):
        UserPreferencesRequest(ui_theme=value)


def test_preferences_request_rejects_missing_theme() -> None:
    """Ensure an empty payload cannot silently reset the stored theme."""

    with pytest.raises(ValidationError):
        UserPreferencesRequest()


def test_preferences_request_rejects_extra_fields() -> None:
    """Ensure overposting fields such as role or tenant are rejected, not ignored."""

    with pytest.raises(ValidationError):
        UserPreferencesRequest(ui_theme="dark", role="admin")


# ============================================================================
# PERSISTENCE CONTRACT TESTS
# ============================================================================


def test_user_model_constrains_theme_to_the_enum_values() -> None:
    """Ensure the database check constraint lists exactly the enum values."""

    constraint = next(c for c in User.__table__.constraints if str(c.name).endswith("users_ui_theme_allowed"))
    sql = str(constraint.sqltext)

    assert all(f"'{theme.value}'" in sql for theme in UiTheme)
    assert sql.count("'") == 2 * len(UiTheme)
