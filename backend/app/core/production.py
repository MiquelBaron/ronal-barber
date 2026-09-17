"""Production-only startup validation."""

from __future__ import annotations

import re
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

UNSAFE_JWT_SECRETS = frozenset(
    {
        "change-me-in-development",
        "replace-with-a-long-random-secret",
        "change-me",
        "secret",
        "jwt-secret",
        "your-secret-key",
    }
)

KNOWN_WEAK_PASSWORDS = frozenset(
    {
        "admin",
        "barber1",
        "barber2",
        "password",
        "password123",
        "password1234",
        "admin123456789",
        "change-me",
    }
)


def validate_jwt_secret(secret: str) -> None:
    normalized = secret.strip()
    if len(normalized) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters in production.")
    if normalized.lower() in UNSAFE_JWT_SECRETS:
        raise ValueError("JWT_SECRET uses a known insecure placeholder in production.")


def validate_database_url(database_url: str) -> None:
    if re.search(r":change-me@", database_url, re.IGNORECASE):
        raise ValueError("DATABASE_URL must not use the default PostgreSQL password in production.")


def validate_bootstrap_admin_password(password: str) -> None:
    if len(password) < 12:
        raise ValueError("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.")
    if password in KNOWN_WEAK_PASSWORDS:
        raise ValueError("BOOTSTRAP_ADMIN_PASSWORD is too weak for production.")


def validate_production_settings(settings: "Settings") -> None:
    if not settings.is_production:
        return

    if not settings.jwt_secret.strip():
        raise ValueError("JWT_SECRET is required in production.")

    validate_jwt_secret(settings.jwt_secret)
    validate_database_url(settings.database_url)


def fail_startup(message: str) -> None:
    print(f"[production] Startup blocked: {message}", file=sys.stderr)
    raise SystemExit(1)
