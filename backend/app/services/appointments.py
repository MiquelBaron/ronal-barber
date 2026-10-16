from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import is_barber_role, is_limited_barber, is_shop_manager
from app.models.models import Appointment, AppointmentStatus, Barber, Service, User
from app.services.booking import BOOKING_TIMEZONE


def _shop_now() -> datetime:
    return datetime.now(BOOKING_TIMEZONE)


def _appointment_row(appointment: Appointment, service_name: str, barber_name: str | None) -> dict[str, object]:
    return {
        **appointment.__dict__,
        "service_name": service_name,
        "barber_name": barber_name,
    }


async def get_barber_appointments(db: AsyncSession, barber_id: int) -> list[dict[str, object]]:
    rows = await db.execute(
        select(Appointment, Service.name, Barber.name)
        .join(Service, Service.id == Appointment.service_id)
        .outerjoin(Barber, Barber.id == Appointment.barber_id)
        .where(Appointment.barber_id == barber_id)
        .order_by(Appointment.date, Appointment.start_time)
    )
    return [_appointment_row(appointment, service_name, barber_name) for appointment, service_name, barber_name in rows.all()]


async def get_all_appointments(
    db: AsyncSession,
    *,
    view: str = "all",
    barber_id: int | None = None,
) -> list[dict[str, object]]:
    query = (
        select(Appointment, Service.name, Barber.name)
        .join(Service, Service.id == Appointment.service_id)
        .outerjoin(Barber, Barber.id == Appointment.barber_id)
        .order_by(Appointment.date, Appointment.start_time)
    )
    if barber_id is not None:
        query = query.where(Appointment.barber_id == barber_id)

    if view == "today_upcoming":
        now = _shop_now()
        query = query.where(
            Appointment.date == now.date(),
            Appointment.start_time > now.time(),
            Appointment.status != AppointmentStatus.cancelled.value,
        )

    rows = await db.execute(query)
    return [_appointment_row(appointment, service_name, barber_name) for appointment, service_name, barber_name in rows.all()]


async def user_can_view_appointment(db: AsyncSession, user: User, appointment_id: int) -> bool:
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        return False
    if is_shop_manager(user):
        return True
    if is_barber_role(user) and user.barber_id == appointment.barber_id:
        return True
    return False


def scoped_barber_id_for_user(user: User) -> int | None:
    if is_limited_barber(user):
        return user.barber_id
    return None
