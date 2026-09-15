from datetime import date, datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Appointment, AppointmentStatus, Barber, BusinessHours, DayOff, Service


def as_datetime(day: date, value: time) -> datetime:
    return datetime.combine(day, value)


async def active_barbers(db: AsyncSession, barber_id: int | None) -> list[Barber]:
    query = select(Barber).where(Barber.active.is_(True))
    if barber_id is not None:
        query = query.where(Barber.id == barber_id)
    return list((await db.scalars(query)).all())


async def barber_has_day_off(db: AsyncSession, barber_id: int, day: date) -> bool:
    rows = await db.scalars(
        select(DayOff).where(
            DayOff.barber_id == barber_id,
            DayOff.start_date <= day,
            DayOff.end_date >= day,
        )
    )
    return rows.first() is not None


async def slot_is_available(db: AsyncSession, service: Service, barber: Barber, day: date, start: time) -> bool:
    if await barber_has_day_off(db, barber.id, day):
        return False

    end = (as_datetime(day, start) + timedelta(minutes=service.duration_minutes)).time()
    hours = list(
        (
            await db.scalars(
                select(BusinessHours).where(
                    BusinessHours.day_of_week == day.weekday(),
                    BusinessHours.active.is_(True),
                )
            )
        ).all()
    )
    if not any(start >= row.start_time and end <= row.end_time for row in hours):
        return False

    appointments = await db.scalars(
        select(Appointment).where(
            Appointment.date == day,
            Appointment.barber_id == barber.id,
            Appointment.status.not_in([AppointmentStatus.cancelled.value]),
        )
    )
    start_dt, end_dt = as_datetime(day, start), as_datetime(day, end)
    return not any(
        start_dt < as_datetime(day, item.end_time) and end_dt > as_datetime(day, item.start_time)
        for item in appointments
    )


async def get_availability_slots(
    db: AsyncSession,
    service_id: int,
    day: date,
    barber_id: int | None = None,
) -> list[str]:
    if day < datetime.now().date():
        return []

    service = await db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found or inactive")

    barbers = await active_barbers(db, barber_id)
    slots: list[str] = []
    hours = list(
        (
            await db.scalars(
                select(BusinessHours).where(
                    BusinessHours.day_of_week == day.weekday(),
                    BusinessHours.active.is_(True),
                )
            )
        ).all()
    )
    for row in hours:
        current = as_datetime(day, row.start_time)
        limit = as_datetime(day, row.end_time)
        while current + timedelta(minutes=service.duration_minutes) <= limit:
            available_for_barber = False
            for barber in barbers:
                if await slot_is_available(db, service, barber, day, current.time()):
                    available_for_barber = True
                    break
            if available_for_barber:
                slots.append(current.strftime("%H:%M"))
            current += timedelta(minutes=30)
    return slots


def generate_cancel_token() -> str:
    return uuid4().hex


async def create_appointment(
    db: AsyncSession,
    *,
    service_id: int,
    barber_id: int | None,
    day: date,
    start_time: time,
    customer_name: str,
    customer_surname: str,
    customer_phone: str,
    customer_email: str,
    forced_barber_id: int | None = None,
) -> tuple[Appointment, Service, Barber]:
    if day < datetime.now().date():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Appointment date cannot be in the past")

    service = await db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found or inactive")

    target_barber_id = forced_barber_id if forced_barber_id is not None else barber_id
    barbers = await active_barbers(db, target_barber_id)
    if not barbers:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barber not found or inactive")

    selected: Barber | None = None
    for barber in barbers:
        if await slot_is_available(db, service, barber, day, start_time):
            selected = barber
            break

    if selected is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Appointment slot is no longer available")

    end_time = (as_datetime(day, start_time) + timedelta(minutes=service.duration_minutes)).time()
    cancel_token = generate_cancel_token()
    appointment_datetime = as_datetime(day, start_time)

    item = Appointment(
        service_id=service_id,
        barber_id=selected.id,
        customer_name=customer_name,
        customer_surname=customer_surname,
        customer_phone=customer_phone,
        customer_email=customer_email,
        date=day,
        start_time=start_time,
        end_time=end_time,
        price=Decimal(service.price),
        payment_reference=f"mock_{uuid4().hex[:12]}",
        cancel_token=cancel_token,
        cancel_token_expires_at=appointment_datetime,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item, service, selected


async def cancel_appointment_by_token(db: AsyncSession, token: str) -> tuple[Appointment, Service, Barber | None]:
    appointment = await db.scalar(select(Appointment).where(Appointment.cancel_token == token))
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appointment not found")

    if appointment.status == AppointmentStatus.cancelled.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Appointment already cancelled")

    if appointment.cancel_token_expires_at and datetime.utcnow() > appointment.cancel_token_expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cancellation link has expired")

    appointment.status = AppointmentStatus.cancelled.value
    await db.commit()
    await db.refresh(appointment)

    service = await db.get(Service, appointment.service_id)
    barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
    return appointment, service, barber


async def get_appointment_by_token(db: AsyncSession, token: str) -> dict[str, object]:
    row = await db.execute(
        select(Appointment, Service.name, Barber.name)
        .join(Service, Service.id == Appointment.service_id)
        .outerjoin(Barber, Barber.id == Appointment.barber_id)
        .where(Appointment.cancel_token == token)
    )
    result = row.first()
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appointment not found")

    appointment, service_name, barber_name = result
    return {
        "date": appointment.date,
        "start_time": appointment.start_time,
        "end_time": appointment.end_time,
        "status": appointment.status,
        "service_name": service_name,
        "barber_name": barber_name,
        "customer_name": appointment.customer_name,
    }
