from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Appointment, AppointmentStatus, Barber, BusinessHours, DayOff, Service

SLOT_INTERVAL_MINUTES = 40
BOOKING_MIN_ADVANCE_MINUTES = 10
BOOKING_TIMEZONE = ZoneInfo("Europe/Madrid")


def as_datetime(day: date, value: time) -> datetime:
    return datetime.combine(day, value)


def _current_shop_datetime() -> datetime:
    return datetime.now(BOOKING_TIMEZONE)


def _slot_starts_after_booking_cutoff(day: date, start: time) -> bool:
    """Slot must start strictly more than BOOKING_MIN_ADVANCE_MINUTES after now (shop time)."""
    cutoff = _current_shop_datetime() + timedelta(minutes=BOOKING_MIN_ADVANCE_MINUTES)
    slot_start = datetime.combine(day, start, tzinfo=BOOKING_TIMEZONE)
    return slot_start > cutoff


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


@dataclass(frozen=True)
class AvailabilityContext:
    business_hours: list[BusinessHours]
    barbers_off: frozenset[int]
    appointments_by_barber: dict[int, list[Appointment]]


def _slot_is_available_in_memory(
    service: Service,
    barber: Barber,
    day: date,
    start: time,
    context: AvailabilityContext,
) -> bool:
    if barber.id in context.barbers_off:
        return False

    end = (as_datetime(day, start) + timedelta(minutes=service.duration_minutes)).time()
    if not any(start >= row.start_time and end <= row.end_time for row in context.business_hours):
        return False

    start_dt, end_dt = as_datetime(day, start), as_datetime(day, end)
    for item in context.appointments_by_barber.get(barber.id, []):
        if start_dt < as_datetime(day, item.end_time) and end_dt > as_datetime(day, item.start_time):
            return False
    return True


def _candidate_slot_times(
    day: date,
    business_hours: list[BusinessHours],
    service_duration_minutes: int,
) -> list[time]:
    candidates: set[time] = set()
    for row in business_hours:
        current = as_datetime(day, row.start_time)
        limit = as_datetime(day, row.end_time)
        while current + timedelta(minutes=service_duration_minutes) <= limit:
            candidates.add(current.time())
            current += timedelta(minutes=SLOT_INTERVAL_MINUTES)
    return sorted(candidates)


async def _load_availability_context(
    db: AsyncSession,
    *,
    day: date,
    barbers: list[Barber],
) -> AvailabilityContext:
    barber_ids = [barber.id for barber in barbers]
    weekday = day.weekday()

    business_hours = list(
        (
            await db.scalars(
                select(BusinessHours).where(
                    BusinessHours.day_of_week == weekday,
                    BusinessHours.active.is_(True),
                )
            )
        ).all()
    )

    days_off = await db.scalars(
        select(DayOff).where(
            DayOff.barber_id.in_(barber_ids),
            DayOff.start_date <= day,
            DayOff.end_date >= day,
        )
    )
    barbers_off = frozenset(row.barber_id for row in days_off)

    appointments = await db.scalars(
        select(Appointment).where(
            Appointment.date == day,
            Appointment.barber_id.in_(barber_ids),
            Appointment.status.not_in([AppointmentStatus.cancelled.value]),
        )
    )
    appointments_by_barber: dict[int, list[Appointment]] = defaultdict(list)
    for appointment in appointments:
        if appointment.barber_id is not None:
            appointments_by_barber[appointment.barber_id].append(appointment)

    return AvailabilityContext(
        business_hours=business_hours,
        barbers_off=barbers_off,
        appointments_by_barber=dict(appointments_by_barber),
    )


async def slot_is_available(db: AsyncSession, service: Service, barber: Barber, day: date, start: time) -> bool:
    if not _slot_starts_after_booking_cutoff(day, start):
        return False

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
    if day < _current_shop_datetime().date():
        return []

    service = await db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found or inactive")

    if barber_id is not None:
        barber = await db.get(Barber, barber_id)
        if barber is None or not barber.active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Barber not found or inactive")
        barbers = [barber]
    else:
        barbers = await active_barbers(db, None)

    if not barbers:
        return []

    context = await _load_availability_context(db, day=day, barbers=barbers)
    slots: list[str] = []
    for start in _candidate_slot_times(day, context.business_hours, service.duration_minutes):
        if not _slot_starts_after_booking_cutoff(day, start):
            continue
        if any(_slot_is_available_in_memory(service, barber, day, start, context) for barber in barbers):
            slots.append(start.strftime("%H:%M"))
    return slots


def generate_cancel_token() -> str:
    return uuid4().hex


async def lock_barbers_for_update(db: AsyncSession, barbers: list[Barber]) -> None:
    """Serialize concurrent bookings for the same barber(s) within this transaction."""
    for barber in sorted(barbers, key=lambda row: row.id):
        locked = await db.scalar(
            select(Barber).where(Barber.id == barber.id, Barber.active.is_(True)).with_for_update()
        )
        if locked is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Barber not found or inactive")


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
    if day < _current_shop_datetime().date():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Appointment date cannot be in the past")

    if not _slot_starts_after_booking_cutoff(day, start_time):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Appointment must be booked at least {BOOKING_MIN_ADVANCE_MINUTES} minutes in advance",
        )

    service = await db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found or inactive")

    target_barber_id = forced_barber_id if forced_barber_id is not None else barber_id
    barbers = await active_barbers(db, target_barber_id)
    if not barbers:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barber not found or inactive")

    await lock_barbers_for_update(db, barbers)

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
    try:
        await db.flush()
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Appointment slot is no longer available") from error
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
