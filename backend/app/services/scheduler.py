import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.models import Appointment, AppointmentStatus, Barber, Service
from app.services import email as email_service
from app.services.settings_store import get_runtime_settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def send_appointment_reminders() -> None:
    settings = get_runtime_settings()
    now = datetime.utcnow()
    target = now + timedelta(hours=settings.reminder_hours_before)
    window = timedelta(minutes=settings.reminder_window_minutes)
    window_start = target - window / 2
    window_end = target + window / 2

    async with SessionLocal() as db:
        rows = await db.execute(
            select(Appointment).where(
                Appointment.status.in_([AppointmentStatus.confirmed.value, AppointmentStatus.pending.value]),
                Appointment.reminder_sent_at.is_(None),
            )
        )
        appointments = rows.scalars().all()

        for appointment in appointments:
            start_dt = datetime.combine(appointment.date, appointment.start_time)
            if not (window_start <= start_dt <= window_end):
                continue

            service = await db.get(Service, appointment.service_id)
            barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
            if service is None:
                continue

            sent = await email_service.send_reminder_24h(appointment, service, barber)
            if sent or not settings.email_enabled:
                appointment.reminder_sent_at = datetime.utcnow()
                await db.commit()
                logger.info("Reminder sent for appointment %s", appointment.id)


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

    try:
        _safe_shutdown()
        scheduler.add_job(send_appointment_reminders, "interval", minutes=15, id="reminder_24h", replace_existing=True)
        if not scheduler.running:
            scheduler.start()
        logger.info("Scheduler started")
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
