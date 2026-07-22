"""
farmaura-api/app/domain/validators.py

Domain-level document validators for Farmaura.

Responsibilities:
- validate Brazilian document identifiers using their official check-digit algorithms;
- validate contact identifiers such as e-mail addresses;
- keep validation logic independent from transport and persistence layers;

Observations:
- validators reject known placeholder sequences (e.g. all-repeated digits);
- callers are responsible for normalizing user input before validation.
"""

import re


# ============================================================================
# CPF VALIDATION
# ============================================================================


def normalize_cpf(value: str) -> str:
    """Return only the numeric digits of one CPF candidate."""

    return "".join(char for char in str(value or "") if char.isdigit())


def is_valid_cpf(value: str) -> bool:
    """Return whether one CPF candidate satisfies the official check-digit algorithm."""

    digits = normalize_cpf(value)
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    numbers = [int(digit) for digit in digits]
    for check_index in (9, 10):
        total = sum(numbers[index] * (check_index + 1 - index) for index in range(check_index))
        remainder = (total * 10) % 11
        if remainder == 10:
            remainder = 0
        if remainder != numbers[check_index]:
            return False
    return True


# ============================================================================
# E-MAIL VALIDATION
# ============================================================================


_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(value: str) -> bool:
    """Return whether one e-mail candidate satisfies a basic shape check."""

    return bool(_EMAIL_PATTERN.match((value or "").strip()))


# ============================================================================
# PASSWORD STRENGTH VALIDATION
# ============================================================================


_PASSWORD_LOWERCASE_PATTERN = re.compile(r"[a-z]")
_PASSWORD_UPPERCASE_PATTERN = re.compile(r"[A-Z]")
_PASSWORD_DIGIT_PATTERN = re.compile(r"\d")
_PASSWORD_SPECIAL_PATTERN = re.compile(r"[^A-Za-z0-9]")


def is_strong_password(value: str) -> bool:
    """Return whether one password candidate has lowercase, uppercase, digit, and special characters.

    Length is already enforced by each schema's own Field(min_length=...); this only
    checks character-class variety, applied everywhere a human chooses their own
    password (registration, password reset) — never to system-generated temporary
    passwords, which already carry far more entropy than any human-memorable string.
    """

    password = value or ""
    return bool(
        _PASSWORD_LOWERCASE_PATTERN.search(password)
        and _PASSWORD_UPPERCASE_PATTERN.search(password)
        and _PASSWORD_DIGIT_PATTERN.search(password)
        and _PASSWORD_SPECIAL_PATTERN.search(password)
    )
