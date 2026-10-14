"""APScheduler orchestration and cron job run tracking."""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from app.crons import CRON_SEED, JOB_HANDLERS, next_day_for_reminders, shop_now, shop_timezone
from app.crons.reminder_daily import run as send_appointment_reminders
from app.crons.review_requests_hourly import run as send_review_requests
from app.db.session import SessionLocal
from app.models.models import CronJob, CronJobStatus
from app.services.settings_store import get_runtime_settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

__all__ = [
    "JOB_HANDLERS",
    "apply_scheduler_settings",
    "ensure_cron_jobs_seeded",
    "execute_cron_job",
    "list_cron_jobs",
    "next_day_for_reminders",
    "run_cron_job",
    "scheduler",
    "send_appointment_reminders",
    "send_review_requests",
    "set_cron_job_active",
    "shop_now",
    "start_scheduler",
    "stop_scheduler",
    "sync_next_run_times",
]


async def ensure_cron_jobs_seeded() -> None:
    settings = get_runtime_settings()
    hour = max(0, min(settings.reminder_send_hour, 23))

    async with SessionLocal() as db:
        existing = {row.code: row for row in (await db.scalars(select(CronJob))).all()}
        for spec in CRON_SEED:
            row = existing.get(spec["code"])
            if row is None:
                payload = {**spec}
                if payload["code"] == "reminder_daily":
                    payload["cron_hour"] = hour
                db.add(CronJob(**payload))
            else:
                row.name = spec["name"]
                row.description = spec["description"]
                row.trigger_type = spec["trigger_type"]
                if spec["trigger_type"] == "interval":
                    row.interval_minutes = spec.get("interval_minutes")
                if row.code == "reminder_daily":
                    row.cron_hour = hour
                    row.cron_minute = spec.get("cron_minute") or 0
        await db.commit()


async def list_cron_jobs() -> list[CronJob]:
    await ensure_cron_jobs_seeded()
    await sync_next_run_times()
    async with SessionLocal() as db:
        rows = await db.scalars(select(CronJob).order_by(CronJob.id))
        return list(rows.all())


async def set_cron_job_active(job_id: int, active: bool) -> CronJob | None:
    async with SessionLocal() as db:
        job = await db.get(CronJob, job_id)
        if job is None:
            return None
        job.active = active
        await db.commit()
        await db.refresh(job)
        job_id_out = job.id
    await apply_scheduler_settings()
    async with SessionLocal() as db:
        return await db.get(CronJob, job_id_out)


async def run_cron_job(job_id: int) -> CronJob:
    async with SessionLocal() as db:
        job = await db.get(CronJob, job_id)
        if job is None:
            raise LookupError("Cron job not found")
        code = job.code
    await execute_cron_job(code)
    async with SessionLocal() as db:
        refreshed = await db.get(CronJob, job_id)
        assert refreshed is not None
        return refreshed


async def execute_cron_job(code: str) -> None:
    handler = JOB_HANDLERS.get(code)
    if handler is None:
        logger.error("No handler registered for cron job %s", code)
        return

    async with SessionLocal() as db:
        job = await db.scalar(select(CronJob).where(CronJob.code == code))
        if job is None:
            logger.error("Cron job row missing for %s", code)
            return
        job.last_run_status = CronJobStatus.running.value
        job.last_error = ""
        await db.commit()

    started = time.perf_counter()
    summary = ""
    error_text = ""
    status = CronJobStatus.ok.value
    try:
        result = await handler()
        summary = (result or "Completado").strip()
    except Exception as exc:
        status = CronJobStatus.error.value
        error_text = str(exc)[:2000]
        summary = "Error en la ejecución"
        logger.exception("Cron job %s failed", code)

    duration_ms = int((time.perf_counter() - started) * 1000)
    finished_at = datetime.utcnow()

    async with SessionLocal() as db:
        job = await db.scalar(select(CronJob).where(CronJob.code == code))
        if job is None:
            return
        job.last_run_at = finished_at
        job.last_run_status = status
        job.last_run_duration_ms = duration_ms
        job.last_run_summary = summary[:2000]
        job.last_error = error_text
        job.run_count = int(job.run_count or 0) + 1
        await db.commit()

    await sync_next_run_times()


def _job_wrapper(code: str) -> Callable[[], Awaitable[None]]:
    async def _runner() -> None:
        await execute_cron_job(code)

    return _runner


async def sync_next_run_times() -> None:
    if not scheduler.running:
        return
    async with SessionLocal() as db:
        rows = list((await db.scalars(select(CronJob))).all())
        for job in rows:
            scheduled = scheduler.get_job(job.code)
            next_time = scheduled.next_run_time if scheduled else None
            if next_time is not None:
                job.next_run_at = next_time.astimezone().replace(tzinfo=None)
            else:
                job.next_run_at = None
        await db.commit()


def _safe_shutdown() -> None:
    if not scheduler.running:
        return
    try:
        scheduler.shutdown(wait=False)
    except RuntimeError:
        logger.debug("Scheduler shutdown skipped (event loop unavailable)")


async def start_scheduler() -> None:
    settings = get_runtime_settings()
    if not settings.scheduler_enabled:
        _safe_shutdown()
        logger.info("Scheduler disabled")
        return

    timezone = shop_timezone()
    await ensure_cron_jobs_seeded()

    try:
        _safe_shutdown()
        async with SessionLocal() as db:
            jobs = list((await db.scalars(select(CronJob))).all())

        for job in jobs:
            if not job.active:
                continue
            if job.code not in JOB_HANDLERS:
                logger.warning("Skipping unknown cron code %s", job.code)
                continue
            if job.trigger_type == "cron":
                hour = job.cron_hour if job.cron_hour is not None else settings.reminder_send_hour
                minute = job.cron_minute if job.cron_minute is not None else 0
                scheduler.add_job(
                    _job_wrapper(job.code),
                    CronTrigger(
                        hour=max(0, min(int(hour), 23)),
                        minute=max(0, min(int(minute), 59)),
                        timezone=timezone,
                    ),
                    id=job.code,
                    replace_existing=True,
                )
            else:
                minutes = max(1, int(job.interval_minutes or 60))
                scheduler.add_job(
                    _job_wrapper(job.code),
                    IntervalTrigger(minutes=minutes),
                    id=job.code,
                    replace_existing=True,
                )

        if not scheduler.running:
            scheduler.start()
        await sync_next_run_times()
        logger.info(
            "Scheduler started (%d active jobs)",
            sum(1 for job in jobs if job.active),
        )
    except RuntimeError:
        logger.debug("Scheduler reconfigure skipped (event loop unavailable)")


def stop_scheduler() -> None:
    _safe_shutdown()


async def apply_scheduler_settings() -> None:
    try:
        settings = get_runtime_settings()
        if settings.scheduler_enabled:
            await start_scheduler()
        else:
            stop_scheduler()
    except Exception:
        # Never block settings/admin flows if the scheduler cannot talk to the DB.
        logger.exception("Failed to apply scheduler settings")
