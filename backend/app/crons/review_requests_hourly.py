"""Hourly Google review request emails after appointment end."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select

from app.crons.common import CronSpec, shop_now
from app.db.session import SessionLocal
from app.models.models import Appointment, AppointmentStatus, Barber, Service
from app.services import email as email_service
from app.services.settings_store import get_runtime_settings

logger = logging.getLogger(__name__)

CODE = "review_requests_hourly"


async def run(reference: datetime | None = None) -> str:
    """Email review requests for appointments whose end time has already passed."""
    settings = get_runtime_settings()
    if not settings.email_enabled or not (settings.google_review_url or "").strip():
        logger.debug("Review requests skipped: email or google_review_url disabled")
        return "Omitido: email o URL de reseña deshabilitados"

    now = shop_now(reference)
    today = now.date()
    sent_count = 0
    failed_count = 0
    candidates = 0

    async with SessionLocal() as db:
        rows = await db.execute(
            select(Appointment).where(
                Appointment.review_request_sent_at.is_(None),
                Appointment.status != AppointmentStatus.cancelled.value,
                Appointment.date <= today,
            )
        )
        appointments = rows.scalars().all()

        for appointment in appointments:
            appointment_end = datetime.combine(appointment.date, appointment.end_time, tzinfo=now.tzinfo)
            if appointment_end > now:
                continue

            service = await db.get(Service, appointment.service_id)
            if service is None:
                continue
            barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
            candidates += 1

            sent = await email_service.send_review_request(appointment, service, barber)
            if not sent:
                failed_count += 1
                continue

            appointment.review_request_sent_at = datetime.utcnow()
            await db.commit()
            sent_count += 1
            logger.info("Review request sent for appointment %s", appointment.id)

    if candidates == 0:
        return "Reseñas: 0 candidatas (nada que enviar)"
    return f"Reseñas: {sent_count} enviados, {failed_count} fallidos (de {candidates})"


SPEC = CronSpec(
    code=CODE,
    name="Emails de reseña",
    description="Pide reseña Google cuando ya ha pasado la hora de fin de la cita.",
    trigger_type="interval",
    interval_minutes=60,
    run=run,
)
