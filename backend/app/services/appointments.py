from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import is_barber_role, is_limited_barber, is_shop_manager
from app.models.models import Appointment, AppointmentStatus, Barber, Service, User
from app.services.booking import BOOKING_TIMEZONE, combined_service_name, parse_complement_ids


def _shop_now() -> datetime:
    return datetime.now(BOOKING_TIMEZONE)


def _appointment_row(appointment: Appointment, service_name: str, barber_name: str | None) -> dict[str, object]:
    return {
        **appointment.__dict__,
        "service_name": service_name,
        "barber_name": barber_name,
    }


async def _complement_names_by_id(db: AsyncSession, appointments: list[Appointment]) -> dict[int, str]:
    ids: list[int] = []
    seen: set[int] = set()
    for appointment in appointments:
        for item_id in parse_complement_ids(appointment.complement_ids):
            if item_id not in seen:
                seen.add(item_id)
                ids.append(item_id)
    if not ids:
        return {}
    rows = list((await db.scalars(select(Service).where(Service.id.in_(ids)))).all())
    return {row.id: row.name for row in rows}


def _display_service_name(primary: str, appointment: Appointment, names: dict[int, str]) -> str:
    extras = [names[item_id] for item_id in parse_complement_ids(appointment.complement_ids) if item_id in names]
    return combined_service_name(primary, extras)


async def get_barber_appointments(db: AsyncSession, barber_id: int) -> list[dict[str, object]]:
    rows = await db.execute(
        select(Appointment, Service.name, Barber.name)
        .join(Service, Service.id == Appointment.service_id)
        .outerjoin(Barber, Barber.id == Appointment.barber_id)
        .where(Appointment.barber_id == barber_id)
        .order_by(Appointment.date, Appointment.start_time)
    )
    packed = rows.all()
    complement_names = await _complement_names_by_id(db, [appointment for appointment, _, _ in packed])
    return [
        _appointment_row(
            appointment,
            _display_service_name(service_name, appointment, complement_names),
            barber_name,
        )
        for appointment, service_name, barber_name in packed
    ]


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
    packed = rows.all()
    complement_names = await _complement_names_by_id(db, [appointment for appointment, _, _ in packed])
    return [
        _appointment_row(
            appointment,
            _display_service_name(service_name, appointment, complement_names),
            barber_name,
        )
        for appointment, service_name, barber_name in packed
    ]


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
