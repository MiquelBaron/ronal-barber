import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.production import (
    validate_bootstrap_admin_password,
    validate_database_url,
    validate_jwt_secret,
    validate_production_settings,
)


def test_development_allows_default_jwt() -> None:
    settings = Settings(environment="development", jwt_secret="change-me-in-development")
    validate_production_settings(settings)


def test_production_accepts_strong_settings() -> None:
    settings = Settings(
        environment="production",
        jwt_secret="abcdefghijklmnopqrstuvwxyz0123456789ABCD",
        database_url="postgresql+asyncpg://barber:strong-pass@postgres:5432/barbershop",
    )
    validate_production_settings(settings)


def test_production_rejects_short_jwt() -> None:
    with pytest.raises(ValueError, match="at least 32 characters"):
        validate_jwt_secret("too-short")


def test_production_rejects_placeholder_jwt() -> None:
    with pytest.raises(ValueError, match="insecure placeholder"):
        validate_jwt_secret("replace-with-a-long-random-secret")


def test_production_rejects_default_db_password() -> None:
    with pytest.raises(ValueError, match="default PostgreSQL password"):
        validate_database_url("postgresql+asyncpg://barber:change-me@postgres:5432/barbershop")


def test_settings_model_blocks_insecure_production_jwt() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(
            environment="production",
            jwt_secret="too-short",
            database_url="postgresql+asyncpg://barber:strong-pass@postgres:5432/barbershop",
        )


def test_bootstrap_password_must_be_strong() -> None:
    with pytest.raises(ValueError, match="at least 12 characters"):
        validate_bootstrap_admin_password("short")
    with pytest.raises(ValueError, match="too weak"):
        validate_bootstrap_admin_password("admin123456789")
