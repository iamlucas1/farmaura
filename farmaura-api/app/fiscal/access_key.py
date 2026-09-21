"""
farmaura-api/app/fiscal/access_key.py

NF-e / NFC-e access key (chave de acesso) rules.

Responsibilities:
- compose the 44-digit key from its official parts;
- compute the modulo-11 check digit (DV);
- generate a `cNF` numeric code that respects the MOC formation rules (rule B03-10);

Observations:
- layout: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1);
- the DV maps each character with `ord(c) - 48`, which is identical to the digit for numeric CNPJs and
  is the rule for alphanumeric CNPJs (NT DFe Conjunta 2025.001), so both are handled by one code path;
- `cNF` must be random enough that the key is not guessable and must survive the retransmission of a
  document unchanged (MOC Anexo IV: same key and same cNF when a contingency note is finally sent);
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime

# MOC 7.00 Anexo I, rule B03-10: cNF values SEFAZ rejects with cStat 897.
_FORBIDDEN_CNF = frozenset(
    {
        "00000000", "11111111", "22222222", "33333333", "44444444", "55555555",
        "66666666", "77777777", "88888888", "99999999", "12345678", "23456789",
        "34567890", "45678901", "56789012", "67890123", "78901234", "89012345",
        "90123456", "01234567",
    }
)

_KEY_PATTERN = re.compile(r"^[0-9]{44}$")


# ============================================================================
# CHECK DIGIT
# ============================================================================


def compute_check_digit(key_without_dv: str) -> int:
    """Return the modulo-11 check digit for the first 43 characters of an access key."""

    if len(key_without_dv) != 43:
        raise ValueError("The access key body must have 43 characters.")
    total = 0
    weight = 2
    for char in reversed(key_without_dv):
        total += (ord(char) - 48) * weight
        weight = 2 if weight == 9 else weight + 1
    remainder = total % 11
    return 0 if remainder in (0, 1) else 11 - remainder


def is_valid_access_key(access_key: str) -> bool:
    """Return whether `access_key` has the right shape and a correct check digit."""

    if not _KEY_PATTERN.match(access_key):
        return False
    return compute_check_digit(access_key[:43]) == int(access_key[43])


# ============================================================================
# cNF
# ============================================================================


def generate_numeric_code(document_number: int) -> str:
    """Return a random 8-digit `cNF` that is valid for MOC rule B03-10 and differs from `nNF`."""

    number_text = f"{document_number:08d}"[-8:]
    while True:
        candidate = f"{secrets.randbelow(10**8):08d}"
        if candidate in _FORBIDDEN_CNF or candidate == number_text:
            continue
        return candidate


# ============================================================================
# KEY COMPOSITION
# ============================================================================


def build_access_key(
    *,
    uf_code: str,
    issued_at: datetime,
    cnpj: str,
    model: str,
    serie: int,
    number: int,
    emission_type: int,
    numeric_code: str,
) -> str:
    """Compose the full 44-digit access key, including the check digit."""

    if len(uf_code) != 2 or not uf_code.isdigit():
        raise ValueError("uf_code must have 2 digits.")
    if len(cnpj) != 14:
        raise ValueError("cnpj must have 14 characters.")
    if len(numeric_code) != 8 or not numeric_code.isdigit():
        raise ValueError("numeric_code must have 8 digits.")
    if not 0 <= serie <= 999:
        raise ValueError("serie must be between 0 and 999.")
    if not 1 <= number <= 999_999_999:
        raise ValueError("number must be between 1 and 999999999.")
    body = (
        f"{uf_code}{issued_at:%y%m}{cnpj}{model}{serie:03d}{number:09d}{emission_type}{numeric_code}"
    )
    return body + str(compute_check_digit(body))
