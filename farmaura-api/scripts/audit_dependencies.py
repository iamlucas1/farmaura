"""
farmaura-api/scripts/audit_dependencies.py

Dependency audit helper for Farmaura.

Responsibilities:
- expose a simple manifest inspection hook;
- keep dependency review steps scriptable;
- provide a base for future supply-chain automation;

Observations:
- this script does not replace vulnerability scanning;
- CI should later expand this into a stricter audit flow;
"""

from pathlib import Path


# ============================================================================
# AUDIT ENTRYPOINT
# ============================================================================


def main() -> None:
    """Print the current pinned dependency manifest."""

    print(Path("pyproject.toml").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
