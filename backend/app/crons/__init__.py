"""Cron job modules — one file per job, registered here."""

from __future__ import annotations

from app.crons import reminder_daily, review_requests_hourly
from app.crons.common import CronSpec, JobHandler, next_day_for_reminders, shop_now, shop_timezone

CRON_SPECS: list[CronSpec] = [
    reminder_daily.SPEC,
    review_requests_hourly.SPEC,
]

CRON_SEED = [spec.seed_payload() for spec in CRON_SPECS]
JOB_HANDLERS: dict[str, JobHandler] = {spec.code: spec.run for spec in CRON_SPECS}

__all__ = [
    "CRON_SEED",
    "CRON_SPECS",
    "JOB_HANDLERS",
    "CronSpec",
    "JobHandler",
    "next_day_for_reminders",
    "shop_now",
    "shop_timezone",
]
