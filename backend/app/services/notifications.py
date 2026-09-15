from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Appointment, Barber, Service
from app.services import email as email_service
from app.services import telegram as telegram_service


async def on_appointment_created(
    db: AsyncSession,
    appointment: Appointment,
    service: Service,
    barber: Barber,
    *,
    send_customer_email: bool = True,
) -> None:
    if send_customer_email:
        sent = await email_service.send_booking_confirmation(appointment, service, barber)
        if sent:
            appointment.confirmation_sent_at = datetime.utcnow()
            await db.commit()

    await telegram_service.notify_barber_new_appointment(barber, appointment, service)


async def on_appointment_cancelled(
    db: AsyncSession,
    appointment: Appointment,
    service: Service | None,
    barber: Barber | None,
) -> None:
    await email_service.send_cancellation_confirmation(appointment, service)
    if barber:
        await telegram_service.notify_barber_cancellation(barber, appointment, service)
