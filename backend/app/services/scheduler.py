import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.models import Appointment, AppointmentStatus, Barber, Service
from app.services import email as email_service
from app.services.settings_store import get_runtime_settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def _reminder_timezone() -> ZoneInfo:
    settings = get_runtime_settings()
    try:
        return ZoneInfo(settings.reminder_timezone)
    except Exception:
        logger.warning("Invalid reminder timezone %r; falling back to Europe/Madrid", settings.reminder_timezone)
        return ZoneInfo("Europe/Madrid")


def next_day_for_reminders(reference: datetime | None = None) -> date:
    """Return the appointment date targeted by the nightly reminder job."""
    timezone = _reminder_timezone()
    current = reference.astimezone(timezone) if reference else datetime.now(timezone)
    return (current + timedelta(days=1)).date()


async def send_appointment_reminders() -> None:
    settings = get_runtime_settings()
    target_date = next_day_for_reminders()

    async with SessionLocal() as db:
        rows = await db.execute(
            select(Appointment).where(
                Appointment.date == target_date,
                Appointment.status.in_([AppointmentStatus.confirmed.value, AppointmentStatus.pending.value]),
                Appointment.reminder_sent_at.is_(None),
            )
        )
        appointments = rows.scalars().all()

        for appointment in appointments:
            service = await db.get(Service, appointment.service_id)
            barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
            if service is None:
                continue

            sent = await email_service.send_reminder_24h(appointment, service, barber)
            if not sent:
                if not settings.email_enabled:
                    logger.debug(
                        "Reminder skipped for appointment %s: email disabled",
                        appointment.id,
                    )
                continue

            appointment.reminder_sent_at = datetime.utcnow()
            await db.commit()
            logger.info("Reminder sent for appointment %s on %s", appointment.id, target_date)


def _safe_shutdown() -> None:
    if not scheduler.running:
        return
    try:
        scheduler.shutdown(wait=False)
    except RuntimeError:
        logger.debug("Scheduler shutdown skipped (event loop unavailable)")


def start_scheduler() -> None:
    settings = get_runtime_settings()
    if not settings.scheduler_enabled:
        logger.info("Scheduler disabled")
        return

    timezone = _reminder_timezone()
    hour = max(0, min(settings.reminder_send_hour, 23))

    try:
        _safe_shutdown()
        scheduler.add_job(
            send_appointment_reminders,
            CronTrigger(hour=hour, minute=0, timezone=timezone),
            id="reminder_daily",
            replace_existing=True,
        )
        if not scheduler.running:
            scheduler.start()
        logger.info("Scheduler started (daily reminders at %02d:00 %s)", hour, timezone.key)
    except RuntimeError:
        logger.debug("Scheduler reconfigure skipped (event loop unavailable)")


def stop_scheduler() -> None:
    _safe_shutdown()


def apply_scheduler_settings() -> None:
    settings = get_runtime_settings()
    if settings.scheduler_enabled:
        start_scheduler()
    else:
        stop_scheduler()
