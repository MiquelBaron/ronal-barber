"""Daily appointment reminder emails (next calendar day)."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select

from app.crons.common import CronSpec, next_day_for_reminders
from app.db.session import SessionLocal
from app.models.models import Appointment, AppointmentStatus, Barber, Service
from app.services import email as email_service
from app.services.settings_store import get_runtime_settings

logger = logging.getLogger(__name__)

CODE = "reminder_daily"


async def run() -> str:
    settings = get_runtime_settings()
    target_date = next_day_for_reminders()
    sent_count = 0
    failed_count = 0
    skipped = 0

    async with SessionLocal() as db:
        rows = await db.execute(
            select(Appointment).where(
                Appointment.date == target_date,
                Appointment.status == AppointmentStatus.confirmed.value,
                Appointment.reminder_sent_at.is_(None),
            )
        )
        appointments = rows.scalars().all()

        for appointment in appointments:
            service = await db.get(Service, appointment.service_id)
            barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
            if service is None:
                skipped += 1
                continue

            sent = await email_service.send_reminder_24h(appointment, service, barber)
            if not sent:
                if not settings.email_enabled:
                    skipped += 1
                    logger.debug(
                        "Reminder skipped for appointment %s: email disabled",
                        appointment.id,
                    )
                else:
                    failed_count += 1
                continue

            appointment.reminder_sent_at = datetime.utcnow()
            await db.commit()
            sent_count += 1
            logger.info("Reminder sent for appointment %s on %s", appointment.id, target_date)

    return (
        f"Recordatorios {target_date.isoformat()}: "
        f"{sent_count} enviados, {failed_count} fallidos, {skipped} omitidos"
    )


SPEC = CronSpec(
    code=CODE,
    name="Recordatorios de citas",
    description="Envía el email de recordatorio a las citas del día siguiente.",
    trigger_type="cron",
    cron_minute=0,
    run=run,
)
