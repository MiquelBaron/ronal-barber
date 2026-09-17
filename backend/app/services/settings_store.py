from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.models import SystemSetting

logger = logging.getLogger(__name__)

SECRET_MASK = "••••••••"

SETTING_DEFINITIONS: list[dict[str, Any]] = [
    {"key": "app_name", "label": "Nombre de la aplicación", "group": "general", "type": "string", "description": "Título mostrado en la API y emails."},
    {"key": "environment", "label": "Entorno", "group": "general", "type": "select", "options": ["development", "production"], "description": "En production las cookies de sesión usan HTTPS."},
    {"key": "frontend_origin", "label": "Origen frontend (CORS)", "group": "general", "type": "url", "description": "URL del frontend autorizada para peticiones con credenciales."},
    {"key": "public_base_url", "label": "URL pública del sitio", "group": "general", "type": "url", "description": "Base para enlaces en emails (cancelación, etc.)."},
    {"key": "jwt_secret", "label": "Secreto JWT", "group": "security", "type": "secret", "description": "Clave para firmar sesiones. Cambiarla invalida sesiones activas."},
    {"key": "barber_default_password", "label": "Contraseña por defecto barberos", "group": "security", "type": "secret", "description": "Usada al crear usuarios barbero en el seed inicial."},
    {"key": "smtp_host", "label": "Servidor SMTP", "group": "email", "type": "string", "description": "Ej: smtp.gmail.com"},
    {"key": "smtp_port", "label": "Puerto SMTP", "group": "email", "type": "int", "description": "Normalmente 587 (TLS) o 465 (SSL)."},
    {"key": "smtp_user", "label": "Usuario SMTP", "group": "email", "type": "string", "description": "Usuario o email del servidor SMTP."},
    {"key": "smtp_password", "label": "Contraseña SMTP", "group": "email", "type": "secret", "description": "Contraseña o app password del SMTP."},
    {"key": "smtp_from", "label": "Remitente (From)", "group": "email", "type": "email", "description": "Dirección que aparece como remitente."},
    {"key": "smtp_use_tls", "label": "Usar TLS", "group": "email", "type": "bool", "description": "Activar STARTTLS en la conexión SMTP."},
    {"key": "telegram_bot_token", "label": "Token del bot Telegram", "group": "telegram", "type": "secret", "description": "Token de @BotFather."},
    {"key": "telegram_bot_username", "label": "Usuario del bot", "group": "telegram", "type": "string", "description": "Sin @. Ej: ronalbarber_bot"},
    {"key": "telegram_webhook_secret", "label": "Secreto webhook Telegram", "group": "telegram", "type": "secret", "description": "Opcional. Si se configura, desactiva long polling."},
    {"key": "scheduler_enabled", "label": "Scheduler activo", "group": "scheduler", "type": "bool", "description": "Envía recordatorios nocturnos de citas del día siguiente."},
    {"key": "reminder_send_hour", "label": "Hora del recordatorio (0-23)", "group": "scheduler", "type": "int", "description": "Hora local a la que se envían los avisos del día siguiente. Ej: 21 = 21:00."},
    {"key": "reminder_timezone", "label": "Zona horaria recordatorios", "group": "scheduler", "type": "string", "description": "Zona IANA para calcular el día siguiente. Ej: Europe/Madrid."},
]

CONFIGURABLE_KEYS = {item["key"] for item in SETTING_DEFINITIONS}
SECRET_KEYS = {item["key"] for item in SETTING_DEFINITIONS if item["type"] == "secret"}
GROUP_LABELS = {
    "general": "General",
    "security": "Seguridad",
    "email": "Correo (SMTP)",
    "telegram": "Telegram",
    "scheduler": "Recordatorios y jobs",
}


@dataclass
class RuntimeSettings:
    app_name: str = "Ronal Barber API"
    environment: str = "development"
    frontend_origin: str = "http://localhost:5173"
    public_base_url: str = "http://localhost:5173"
    jwt_secret: str = "change-me-in-development"
    barber_default_password: str = "change-me-barber-password"
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

    @classmethod
    def from_values(cls, values: dict[str, str]) -> RuntimeSettings:
        def as_bool(raw: str, default: bool) -> bool:
            return raw.strip().lower() in {"1", "true", "yes", "on"} if raw != "" else default

        def as_int(raw: str, default: int) -> int:
            try:
                return int(raw)
            except (TypeError, ValueError):
                return default

        env = get_settings()
        env_defaults = {key: str(getattr(env, key)) for key in CONFIGURABLE_KEYS if hasattr(env, key)}
        merged = {**env_defaults, **values}

        return cls(
            app_name=str(merged.get("app_name", cls.app_name)),
            environment=str(merged.get("environment", cls.environment)),
            frontend_origin=str(merged.get("frontend_origin", cls.frontend_origin)),
            public_base_url=str(merged.get("public_base_url", cls.public_base_url)),
            jwt_secret=str(merged.get("jwt_secret", cls.jwt_secret)),
            barber_default_password=str(merged.get("barber_default_password", cls.barber_default_password)),
            smtp_host=str(merged.get("smtp_host", "")),
            smtp_port=as_int(str(merged.get("smtp_port", "587")), 587),
            smtp_user=str(merged.get("smtp_user", "")),
            smtp_password=str(merged.get("smtp_password", "")),
            smtp_from=str(merged.get("smtp_from", cls.smtp_from)),
            smtp_use_tls=as_bool(str(merged.get("smtp_use_tls", "true")), True),
            telegram_bot_token=str(merged.get("telegram_bot_token", "")),
            telegram_bot_username=str(merged.get("telegram_bot_username", cls.telegram_bot_username)),
            telegram_webhook_secret=str(merged.get("telegram_webhook_secret", "")),
            scheduler_enabled=as_bool(str(merged.get("scheduler_enabled", "true")), True),
            reminder_send_hour=as_int(str(merged.get("reminder_send_hour", "21")), 21),
            reminder_timezone=str(merged.get("reminder_timezone", cls.reminder_timezone)),
        )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token)


_cache: RuntimeSettings | None = None


def clear_runtime_settings_cache() -> None:
    global _cache
    _cache = None


def get_runtime_settings() -> RuntimeSettings:
    """Return DB-backed runtime settings. Falls back to env defaults only before startup refresh."""
    global _cache
    if _cache is not None:
        return _cache
    logger.debug("Runtime settings cache not loaded; using environment defaults")
    return RuntimeSettings.from_values({})


def _env_defaults() -> dict[str, str]:
    settings = get_settings()
    return {key: str(getattr(settings, key)) for key in CONFIGURABLE_KEYS if hasattr(settings, key)}


async def refresh_cache(db: AsyncSession) -> RuntimeSettings:
    global _cache
    rows = await db.scalars(select(SystemSetting))
    db_values = {row.key: row.value for row in rows.all()}
    _cache = RuntimeSettings.from_values(db_values)
    logger.info("Runtime settings cache refreshed from database (%d keys)", len(db_values))
    return _cache


async def ensure_defaults_seeded(db: AsyncSession) -> None:
    defaults = _env_defaults()
    existing = {row.key for row in (await db.scalars(select(SystemSetting))).all()}
    for key, value in defaults.items():
        if key not in existing and value:
            db.add(SystemSetting(key=key, value=value))
    await db.commit()
    await refresh_cache(db)


async def get_settings_for_admin(db: AsyncSession) -> list[dict[str, Any]]:
    await refresh_cache(db)
    runtime = get_runtime_settings()
    rows = await db.scalars(select(SystemSetting))
    db_values = {row.key: row.value for row in rows.all()}

    items: list[dict[str, Any]] = []
    for definition in SETTING_DEFINITIONS:
        key = definition["key"]
        raw_value = db_values.get(key, str(getattr(runtime, key, "")))
        if definition["type"] == "bool":
            display_value = "true" if str(raw_value).lower() in {"1", "true", "yes", "on"} else "false"
        else:
            display_value = str(raw_value)

        if definition["type"] == "secret" and display_value:
            display_value = SECRET_MASK

        items.append(
            {
                **definition,
                "value": display_value,
                "is_secret": definition["type"] == "secret",
                "has_value": bool(db_values.get(key) or getattr(runtime, key, "")),
            }
        )
    return items


def _normalize_incoming_value(key: str, value: str, definition: dict[str, Any]) -> str:
    if definition["type"] == "bool":
        return "true" if value.strip().lower() in {"1", "true", "yes", "on"} else "false"
    if definition["type"] == "int":
        return str(int(value))
    return value.strip()


async def update_settings(db: AsyncSession, updates: dict[str, str]) -> RuntimeSettings:
    definitions = {item["key"]: item for item in SETTING_DEFINITIONS}
    existing_rows = {row.key: row for row in (await db.scalars(select(SystemSetting))).all()}

    for key, raw_value in updates.items():
        if key not in CONFIGURABLE_KEYS:
            continue

        definition = definitions[key]
        if definition["type"] == "secret" and (raw_value == SECRET_MASK or raw_value == ""):
            continue

        value = _normalize_incoming_value(key, raw_value, definition)
        row = existing_rows.get(key)
        if row is None:
            db.add(SystemSetting(key=key, value=value))
        else:
            row.value = value

    await db.commit()
    runtime = await refresh_cache(db)
    from app.services.scheduler import apply_scheduler_settings

    apply_scheduler_settings()
    return runtime


async def get_secret_value(db: AsyncSession, key: str) -> str:
    row = await db.get(SystemSetting, key)
    if row and row.value:
        return row.value
    settings = get_settings()
    return str(getattr(settings, key, ""))
