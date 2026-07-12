"""
farmaura-api/app/domain/errors.py

Domain errors for Farmaura.

Responsibilities:
- provide explicit domain-level exceptions;
- standardize business failure signaling;
- keep service logic transport-agnostic;

Observations:
- domain errors are mapped to HTTP responses centrally;
- error messages should remain safe for client exposure;
"""


# ============================================================================
# DOMAIN EXCEPTIONS
# ============================================================================


class DomainError(Exception):
    """Base exception for expected domain failures."""

    def __init__(self, message: str, status_code: int) -> None:
        """Store the domain error payload."""

        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AuthenticationError(DomainError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Invalid credentials.") -> None:
        """Initialize the authentication error."""

        super().__init__(message=message, status_code=401)


class AuthorizationError(DomainError):
    """Raised when authorization fails."""

    def __init__(self, message: str = "Forbidden.") -> None:
        """Initialize the authorization error."""

        super().__init__(message=message, status_code=403)


class NotFoundError(DomainError):
    """Raised when a resource is not found."""

    def __init__(self, message: str = "Resource not found.") -> None:
        """Initialize the not-found error."""

        super().__init__(message=message, status_code=404)
