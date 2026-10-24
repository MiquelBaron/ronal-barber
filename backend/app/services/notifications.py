"""Side-effect notifications; scheduled off the HTTP request path."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal
from app.models.models import Appointment, Barber, Service
from app.services import email as email_service
from app.services import telegram as telegram_service

logger = logging.getLogger(__name__)


def _spawn(coro: object) -> None:
    task = asyncio.create_task(coro)  # type: ignore[arg-type]

    def _done(done: asyncio.Task[object]) -> None:
        if done.cancelled():
            return
        error = done.exception()
        if error is not None:
            logger.error("Background notification failed: %s", error, exc_info=error)

    task.add_done_callback(_done)


async def _notify_created(appointment_id: int, send_customer_email: bool) -> None:
    async with SessionLocal() as db:
        appointment = await db.get(Appointment, appointment_id)
        if appointment is None:
            return
        service = await db.get(Service, appointment.service_id)
        barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
        if service is None or barber is None:
            return

        if send_customer_email:
            sent = await email_service.send_booking_confirmation(appointment, service, barber)
            if sent:
                appointment.confirmation_sent_at = datetime.utcnow()
                await db.commit()

        await telegram_service.notify_barber_new_appointment(barber, appointment, service)


async def _notify_cancelled(appointment_id: int) -> None:
    async with SessionLocal() as db:
        appointment = await db.get(Appointment, appointment_id)
        if appointment is None:
            return
        service = await db.get(Service, appointment.service_id)
        barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
        await email_service.send_cancellation_confirmation(appointment, service)
        if barber:
            await telegram_service.notify_barber_cancellation(barber, appointment, service)


async def on_appointment_created(
    _db: AsyncSession,
    appointment: Appointment,
    _service: Service,
    _barber: Barber,
    *,
    send_customer_email: bool = True,
) -> None:
    _spawn(_notify_created(appointment.id, send_customer_email))


async def on_appointment_cancelled(
    _db: AsyncSession,
    appointment: Appointment,
    _service: Service | None,
    _barber: Barber | None,
) -> None:
    _spawn(_notify_cancelled(appointment.id))
