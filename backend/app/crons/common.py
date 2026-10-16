"""Shared helpers and types for scheduled cron jobs."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.services.settings_store import get_runtime_settings

logger = logging.getLogger(__name__)

JobHandler = Callable[..., Awaitable[str | None]]


@dataclass(frozen=True)
class CronSpec:
    code: str
    name: str
    description: str
    trigger_type: str  # cron | interval
    run: JobHandler
    cron_hour: int | None = None
    cron_minute: int | None = None
    cron_day_of_week: int | None = None  # 0=Mon … 6=Sun; None = every day
    interval_minutes: int | None = None

    def seed_payload(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "name": self.name,
            "description": self.description,
            "trigger_type": self.trigger_type,
            "cron_hour": self.cron_hour,
            "cron_minute": self.cron_minute,
            "cron_day_of_week": self.cron_day_of_week,
            "interval_minutes": self.interval_minutes,
        }


def shop_timezone() -> ZoneInfo:
    settings = get_runtime_settings()
    try:
        return ZoneInfo(settings.reminder_timezone)
    except Exception:
        logger.warning("Invalid reminder timezone %r; falling back to Europe/Madrid", settings.reminder_timezone)
        return ZoneInfo("Europe/Madrid")


def shop_now(reference: datetime | None = None) -> datetime:
    timezone = shop_timezone()
    if reference is not None:
        return reference.astimezone(timezone) if reference.tzinfo else reference.replace(tzinfo=timezone)
    return datetime.now(timezone)


def next_day_for_reminders(reference: datetime | None = None) -> date:
    """Return the appointment date targeted by the nightly reminder job."""
    current = shop_now(reference)
    return (current + timedelta(days=1)).date()
