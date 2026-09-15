from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import is_barber_role, is_shop_manager
from app.models.models import Appointment, Service, User


async def get_barber_appointments(db: AsyncSession, barber_id: int) -> list[dict[str, object]]:
    rows = await db.execute(
        select(Appointment, Service.name)
        .join(Service, Service.id == Appointment.service_id)
        .where(Appointment.barber_id == barber_id)
        .order_by(Appointment.date, Appointment.start_time)
    )
    return [{**appointment.__dict__, "service_name": service_name} for appointment, service_name in rows.all()]


async def get_all_appointments(db: AsyncSession) -> list[dict[str, object]]:
    rows = await db.execute(
        select(Appointment, Service.name)
        .join(Service, Service.id == Appointment.service_id)
        .order_by(Appointment.date, Appointment.start_time)
    )
    return [{**appointment.__dict__, "service_name": service_name} for appointment, service_name in rows.all()]


async def user_can_view_appointment(db: AsyncSession, user: User, appointment_id: int) -> bool:
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        return False
    if is_shop_manager(user):
        return True
    if is_barber_role(user) and user.barber_id == appointment.barber_id:
        return True
    return False
