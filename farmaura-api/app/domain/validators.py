"""
farmaura-api/app/domain/validators.py

Domain-level document validators for Farmaura.

Responsibilities:
- validate Brazilian document identifiers using their official check-digit algorithms;
- keep validation logic independent from transport and persistence layers;

Observations:
- validators reject known placeholder sequences (e.g. all-repeated digits);
- callers are responsible for normalizing user input before validation.
"""


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
