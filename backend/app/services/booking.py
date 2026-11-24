import calendar
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Appointment, AppointmentStatus, Barber, BusinessHours, DayOff, Service

SLOT_STEP_MINUTES = 10
BOOKING_MIN_ADVANCE_MINUTES = 10
BOOKING_MAX_MONTHS_AHEAD = 2
BOOKING_TIMEZONE = ZoneInfo("Europe/Madrid")


def as_datetime(day: date, value: time) -> datetime:
    return datetime.combine(day, value)


def _current_shop_datetime() -> datetime:
    return datetime.now(BOOKING_TIMEZONE)


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last_day))


def max_bookable_date(today: date | None = None) -> date:
    """Latest calendar day clients can book (today + BOOKING_MAX_MONTHS_AHEAD)."""
    base = today if today is not None else _current_shop_datetime().date()
    return add_months(base, BOOKING_MAX_MONTHS_AHEAD)


def parse_complement_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    ids: list[int] = []
    seen: set[int] = set()
    for item in parsed:
        try:
            value = int(item)
        except (TypeError, ValueError):
            continue
        if value > 0 and value not in seen:
            seen.add(value)
            ids.append(value)
    return ids


def encode_complement_ids(ids: list[int]) -> str:
    return json.dumps(ids)


def combined_service_name(primary: str, extra_names: list[str]) -> str:
    if not extra_names:
        return primary
    return " + ".join([primary, *extra_names])


@dataclass(frozen=True)
class ResolvedBooking:
    service: Service
    complements: tuple[Service, ...]
    duration_minutes: int
    price: Decimal
    complement_ids_json: str

    @property
    def display_name(self) -> str:
        return combined_service_name(self.service.name, [item.name for item in self.complements])


async def resolve_booking_services(
    db: AsyncSession,
    service_id: int,
    complement_ids: list[int] | None = None,
) -> ResolvedBooking:
    service = await db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found or inactive")
    if not service.is_independent:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Service cannot be booked on its own")

    unique: list[int] = []
    seen: set[int] = set()
    for complement_id in complement_ids or []:
        if complement_id == service_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A service cannot be added as its own complement")
        if complement_id <= 0 or complement_id in seen:
            continue
        seen.add(complement_id)
        unique.append(complement_id)

    complements: list[Service] = []
    if unique:
        rows = list((await db.scalars(select(Service).where(Service.id.in_(unique)))).all())
        by_id = {row.id: row for row in rows}
        for complement_id in unique:
            item = by_id.get(complement_id)
            if item is None or not item.active or not item.is_complement:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Complement not found or not bookable as extra")
            complements.append(item)

    duration_minutes = service.duration_minutes + sum(item.duration_minutes for item in complements)
    price = Decimal(service.price) + sum((Decimal(item.price) for item in complements), Decimal("0"))
    return ResolvedBooking(
        service=service,
        complements=tuple(complements),
        duration_minutes=duration_minutes,
        price=price,
        complement_ids_json=encode_complement_ids(unique),
    )


async def named_service_for_appointment(
    db: AsyncSession,
    appointment: Appointment,
    service: Service | None,
) -> Service | SimpleNamespace:
    extras = await load_appointment_complements(db, appointment)
    if not extras:
        return service if service is not None else SimpleNamespace(name="Servicio")
    base = service.name if service is not None else "Servicio"
    return SimpleNamespace(name=combined_service_name(base, [item.name for item in extras]))


async def load_appointment_complements(db: AsyncSession, appointment: Appointment) -> list[Service]:
    ids = parse_complement_ids(appointment.complement_ids)
    if not ids:
        return []
    rows = list((await db.scalars(select(Service).where(Service.id.in_(ids)))).all())
    by_id = {row.id: row for row in rows}
    return [by_id[item_id] for item_id in ids if item_id in by_id]


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
    hours_by_barber: dict[int, list[BusinessHours]]
    barbers_off: frozenset[int]
    appointments_by_barber: dict[int, list[Appointment]]


def _merge_intervals(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    if not intervals:
        return []
    ordered = sorted(intervals, key=lambda item: item[0])
    merged: list[tuple[datetime, datetime]] = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def _subtract_busy(
    open_intervals: list[tuple[datetime, datetime]],
    busy_intervals: list[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    free = list(open_intervals)
    for busy_start, busy_end in sorted(busy_intervals, key=lambda item: item[0]):
        next_free: list[tuple[datetime, datetime]] = []
        for free_start, free_end in free:
            if busy_end <= free_start or busy_start >= free_end:
                next_free.append((free_start, free_end))
                continue
            if free_start < busy_start:
                next_free.append((free_start, busy_start))
            if busy_end < free_end:
                next_free.append((busy_end, free_end))
        free = next_free
    return free


def _open_intervals_for_barber(
    day: date,
    hours: list[BusinessHours],
) -> list[tuple[datetime, datetime]]:
    raw = [
        (as_datetime(day, row.start_time), as_datetime(day, row.end_time))
        for row in hours
        if row.start_time < row.end_time
    ]
    return _merge_intervals(raw)


def _busy_intervals_for_barber(
    day: date,
    appointments: list[Appointment],
) -> list[tuple[datetime, datetime]]:
    return [
        (as_datetime(day, item.start_time), as_datetime(day, item.end_time))
        for item in appointments
        if item.start_time < item.end_time
    ]


def _free_intervals_for_barber(
    day: date,
    hours: list[BusinessHours],
    appointments: list[Appointment],
) -> list[tuple[datetime, datetime]]:
    open_intervals = _open_intervals_for_barber(day, hours)
    if not open_intervals:
        return []
    busy = _busy_intervals_for_barber(day, appointments)
    return _subtract_busy(open_intervals, busy)


def _candidate_starts_from_free_gaps(
    free_intervals: list[tuple[datetime, datetime]],
    duration_minutes: int,
) -> list[time]:
    if duration_minutes <= 0:
        return []
    candidates: set[time] = set()
    step = timedelta(minutes=SLOT_STEP_MINUTES)
    duration = timedelta(minutes=duration_minutes)
    for free_start, free_end in free_intervals:
        current = free_start
        while current + duration <= free_end:
            candidates.add(current.time())
            current += step
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
                    BusinessHours.barber_id.in_(barber_ids),
                    BusinessHours.day_of_week == weekday,
                    BusinessHours.active.is_(True),
                )
            )
        ).all()
    )
    hours_by_barber: dict[int, list[BusinessHours]] = defaultdict(list)
    for row in business_hours:
        hours_by_barber[row.barber_id].append(row)

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
        hours_by_barber=dict(hours_by_barber),
        barbers_off=barbers_off,
        appointments_by_barber=dict(appointments_by_barber),
    )


async def slot_is_available(
    db: AsyncSession,
    service: Service,
    barber: Barber,
    day: date,
    start: time,
    *,
    duration_minutes: int | None = None,
) -> bool:
    if not _slot_starts_after_booking_cutoff(day, start):
        return False

    if await barber_has_day_off(db, barber.id, day):
        return False

    minutes = duration_minutes if duration_minutes is not None else service.duration_minutes
    end = (as_datetime(day, start) + timedelta(minutes=minutes)).time()
    hours = list(
        (
            await db.scalars(
                select(BusinessHours).where(
                    BusinessHours.barber_id == barber.id,
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
    *,
    respect_booking_horizon: bool = True,
    complement_ids: list[int] | None = None,
) -> list[str]:
    today = _current_shop_datetime().date()
    if day < today:
        return []
    if respect_booking_horizon and day > max_bookable_date(today):
        return []

    booking = await resolve_booking_services(db, service_id, complement_ids)

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
    starts: set[time] = set()
    for barber in barbers:
        if barber.id in context.barbers_off:
            continue
        free = _free_intervals_for_barber(
            day,
            context.hours_by_barber.get(barber.id, []),
            context.appointments_by_barber.get(barber.id, []),
        )
        for start in _candidate_starts_from_free_gaps(free, booking.duration_minutes):
            if _slot_starts_after_booking_cutoff(day, start):
                starts.add(start)
    return [start.strftime("%H:%M") for start in sorted(starts)]


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
    respect_booking_horizon: bool = True,
    complement_ids: list[int] | None = None,
) -> tuple[Appointment, Service, Barber]:
    today = _current_shop_datetime().date()
    if day < today:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Appointment date cannot be in the past")

    if respect_booking_horizon and day > max_bookable_date(today):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Appointments can only be booked up to {BOOKING_MAX_MONTHS_AHEAD} months ahead",
        )

    if not _slot_starts_after_booking_cutoff(day, start_time):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Appointment must be booked at least {BOOKING_MIN_ADVANCE_MINUTES} minutes in advance",
        )

    booking = await resolve_booking_services(db, service_id, complement_ids)
    service = booking.service

    target_barber_id = forced_barber_id if forced_barber_id is not None else barber_id
    barbers = await active_barbers(db, target_barber_id)
    if not barbers:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barber not found or inactive")

    await lock_barbers_for_update(db, barbers)

    selected: Barber | None = None
    for barber in barbers:
        if await slot_is_available(db, service, barber, day, start_time, duration_minutes=booking.duration_minutes):
            selected = barber
            break

    if selected is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Appointment slot is no longer available")

    end_time = (as_datetime(day, start_time) + timedelta(minutes=booking.duration_minutes)).time()
    cancel_token = generate_cancel_token()
    appointment_datetime = as_datetime(day, start_time)

    item = Appointment(
        service_id=service_id,
        complement_ids=booking.complement_ids_json,
        barber_id=selected.id,
        customer_name=customer_name,
        customer_surname=customer_surname,
        customer_phone=customer_phone,
        customer_email=customer_email,
        date=day,
        start_time=start_time,
        end_time=end_time,
        price=booking.price,
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


async def _cancel_appointment(db: AsyncSession, appointment: Appointment) -> tuple[Appointment, Service, Barber | None]:
    if appointment.status == AppointmentStatus.cancelled.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Appointment already cancelled")

    appointment.status = AppointmentStatus.cancelled.value
    await db.commit()
    await db.refresh(appointment)

    service = await db.get(Service, appointment.service_id)
    barber = await db.get(Barber, appointment.barber_id) if appointment.barber_id else None
    return appointment, service, barber


async def cancel_appointment_by_token(db: AsyncSession, token: str) -> tuple[Appointment, Service, Barber | None]:
    appointment = await db.scalar(select(Appointment).where(Appointment.cancel_token == token))
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appointment not found")

    if appointment.cancel_token_expires_at and datetime.utcnow() > appointment.cancel_token_expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cancellation link has expired")

    return await _cancel_appointment(db, appointment)


async def cancel_appointment_by_id(db: AsyncSession, appointment_id: int) -> tuple[Appointment, Service, Barber | None]:
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appointment not found")
    return await _cancel_appointment(db, appointment)


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
    complements = await load_appointment_complements(db, appointment)
    return {
        "date": appointment.date,
        "start_time": appointment.start_time,
        "end_time": appointment.end_time,
        "status": appointment.status,
        "service_name": combined_service_name(service_name, [item.name for item in complements]),
        "barber_name": barber_name,
        "customer_name": appointment.customer_name,
    }
