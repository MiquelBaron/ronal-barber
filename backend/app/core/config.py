from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.production import validate_production_settings


class Settings(BaseSettings):
    app_name: str = "Ronal Barber"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://barber:barber_dev@localhost:5432/barbershop"
    frontend_origin: str = "http://localhost:5173"
    public_base_url: str = "http://localhost:5173"
    jwt_secret: str = "change-me-in-development"
    admin_email: str = "admin@ronalbarber.com"
    admin_password: str = "admin"
    barber_default_password: str = "barber1"
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@ronalbarber.com"
    smtp_use_tls: bool = True

    telegram_bot_token: str = ""
    telegram_bot_username: str = "ronalbarber_bot"
    telegram_webhook_secret: str = ""

    scheduler_enabled: bool = True
    reminder_send_hour: int = 21
    reminder_timezone: str = "Europe/Madrid"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token)

    @model_validator(mode="after")
    def enforce_production_requirements(self) -> "Settings":
        validate_production_settings(self)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
