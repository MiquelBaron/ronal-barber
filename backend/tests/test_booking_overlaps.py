"""Overlap and packing guarantees for short services (5–35 minutes).

A shop depends on these invariants: two confirmed appointments for the same
barber on the same day must never occupy overlapping time. Availability is
built from free gaps (hours − busy) with 10-minute start steps inside each gap.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Appointment, AppointmentStatus, Barber, BusinessHours, Service
from app.services import booking as booking_service

DURATIONS = list(range(5, 36))
SAMPLE_DURATIONS = [5, 10, 15, 20, 25, 30, 31, 32, 33, 34, 35]


def _open_day(offset_days: int = 3) -> date:
    day = date.today() + timedelta(days=offset_days)
    while day.weekday() > 5:
        day += timedelta(days=1)
    return day


def _at(day: date, value: time) -> datetime:
    return datetime.combine(day, value)


def _hhmm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def _end(day: date, start: time, minutes: int) -> datetime:
    return _at(day, start) + timedelta(minutes=minutes)


def _overlaps(left_start: datetime, left_end: datetime, right_start: datetime, right_end: datetime) -> bool:
    return left_start < right_end and left_end > right_start


def assert_no_overlaps(rows: list[Appointment]) -> None:
    active = [
        row
        for row in rows
        if row.status != AppointmentStatus.cancelled.value and row.barber_id is not None
    ]
    for index, first in enumerate(active):
        first_start = _at(first.date, first.start_time)
        first_end = _at(first.date, first.end_time)
        for second in active[index + 1 :]:
            if first.barber_id != second.barber_id or first.date != second.date:
                continue
            second_start = _at(second.date, second.start_time)
            second_end = _at(second.date, second.end_time)
            assert not _overlaps(first_start, first_end, second_start, second_end), (
                f"{first.start_time}-{first.end_time} overlaps {second.start_time}-{second.end_time} "
                f"(barber {first.barber_id} on {first.date})"
            )


async def _set_duration(db: AsyncSession, service_id: int, minutes: int) -> Service:
    service = await db.get(Service, service_id)
    assert service is not None
    service.duration_minutes = minutes
    await db.commit()
    await db.refresh(service)
    return service


async def _clear_appointments(db: AsyncSession) -> None:
    await db.execute(delete(Appointment))
    await db.commit()


async def _book(
    db: AsyncSession,
    *,
    day: date,
    start: time,
    service_id: int = 1,
    barber_id: int = 1,
    email: str = "overlap@test.com",
    complement_ids: list[int] | None = None,
) -> Appointment:
    appointment, _, _ = await booking_service.create_appointment(
        db,
        service_id=service_id,
        barber_id=barber_id,
        day=day,
        start_time=start,
        customer_name="Ana",
        customer_surname="Lopez",
        customer_phone="600000000",
        customer_email=email,
        complement_ids=complement_ids or [],
    )
    return appointment


async def _day_appointments(db: AsyncSession, day: date, barber_id: int = 1) -> list[Appointment]:
    rows = await db.scalars(
        select(Appointment).where(Appointment.date == day, Appointment.barber_id == barber_id)
    )
    return list(rows.all())


async def _second_independent(db: AsyncSession, minutes: int, name: str = "Segundo") -> Service:
    extra = Service(
        name=name,
        description="",
        price=Decimal("15.00"),
        duration_minutes=minutes,
        active=True,
        is_independent=True,
        is_complement=False,
    )
    db.add(extra)
    await db.commit()
    await db.refresh(extra)
    return extra


@pytest.mark.parametrize("duration", DURATIONS)
@pytest.mark.asyncio
async def test_empty_day_slots_fit_before_close(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert slots
    assert slots == sorted(slots)
    assert len(slots) == len(set(slots))
    close = _at(day, time(18, 0))
    for slot in slots:
        start = _hhmm(slot)
        end = _end(day, start, duration)
        assert start >= time(9, 0)
        assert end <= close
        assert start.minute % booking_service.SLOT_STEP_MINUTES == 0


@pytest.mark.parametrize("duration", DURATIONS)
@pytest.mark.asyncio
async def test_booking_first_slot_hides_overlapping_starts(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    await _book(db_session, day=day, start=time(9, 0), email=f"first-{duration}@test.com")
    occupied_end = _end(day, time(9, 0), duration)
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert "09:00" not in slots
    for slot in slots:
        start = _hhmm(slot)
        end = _end(day, start, duration)
        assert not _overlaps(_at(day, time(9, 0)), occupied_end, _at(day, start), end)
    abut = occupied_end.strftime("%H:%M")
    assert abut in slots
    # Starts step from the free-gap start, so wall-clock :30 may not appear
    # (e.g. after a 6-minute booking the sequence is 09:06, 09:11, …).
    if duration > 30:
        assert "09:30" not in slots


@pytest.mark.parametrize("duration", DURATIONS)
@pytest.mark.asyncio
async def test_fill_every_offered_slot_never_overlaps(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    booked = 0
    while True:
        slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
        if not slots:
            break
        await _book(
            db_session,
            day=day,
            start=_hhmm(slots[0]),
            email=f"fill-{duration}-{booked}@test.com",
        )
        booked += 1
        assert booked <= 200
    rows = await _day_appointments(db_session, day)
    assert len(rows) == booked
    assert booked >= 1
    assert_no_overlaps(rows)
    leftover = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert leftover == []


@pytest.mark.parametrize("existing_duration", DURATIONS)
@pytest.mark.parametrize("new_duration", SAMPLE_DURATIONS)
@pytest.mark.asyncio
async def test_second_service_cannot_overlap_existing(
    db_session: AsyncSession,
    existing_duration: int,
    new_duration: int,
) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, existing_duration)
    other = await _second_independent(db_session, new_duration, name=f"Alt-{new_duration}")
    await _book(db_session, day=day, start=time(10, 0), email=f"ex-{existing_duration}-{new_duration}@test.com")
    occupied_end = _end(day, time(10, 0), existing_duration)
    slots = await booking_service.get_availability_slots(
        db_session, service_id=other.id, day=day, barber_id=1
    )
    for slot in slots:
        start = _hhmm(slot)
        end = _end(day, start, new_duration)
        assert not _overlaps(_at(day, time(10, 0)), occupied_end, _at(day, start), end)


@pytest.mark.parametrize("existing_duration", SAMPLE_DURATIONS)
@pytest.mark.parametrize("new_duration", DURATIONS)
@pytest.mark.asyncio
async def test_create_rejects_overlapping_start_inside_busy_block(
    db_session: AsyncSession,
    existing_duration: int,
    new_duration: int,
) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, existing_duration)
    other = await _second_independent(db_session, new_duration, name=f"Force-{new_duration}")
    await _book(db_session, day=day, start=time(11, 0), email=f"rej-{existing_duration}-{new_duration}@test.com")
    occupied_end = _end(day, time(11, 0), existing_duration)
    candidate = time(11, 15)
    if not _overlaps(_at(day, time(11, 0)), occupied_end, _at(day, candidate), _end(day, candidate, new_duration)):
        pytest.skip("this pair does not overlap at 11:15")
    with pytest.raises(HTTPException) as error:
        await _book(
            db_session,
            day=day,
            start=candidate,
            service_id=other.id,
            email=f"bad-{existing_duration}-{new_duration}@test.com",
        )
    assert error.value.status_code == 409


@pytest.mark.parametrize("duration", DURATIONS)
@pytest.mark.asyncio
async def test_abutting_appointment_after_exact_end_is_allowed(
    db_session: AsyncSession,
    duration: int,
) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    await _book(db_session, day=day, start=time(9, 0), email=f"abut-{duration}@test.com")
    end = _end(day, time(9, 0), duration)
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    abut = end.strftime("%H:%M")
    assert abut in slots
    second = await _book(db_session, day=day, start=end.time(), email=f"abut2-{duration}@test.com")
    assert second.start_time == end.time()
    assert_no_overlaps(await _day_appointments(db_session, day))


@pytest.mark.parametrize("duration", DURATIONS)
@pytest.mark.asyncio
async def test_same_start_time_is_always_rejected(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    await _book(db_session, day=day, start=time(12, 0), email=f"same-a-{duration}@test.com")
    with pytest.raises(HTTPException) as error:
        await _book(db_session, day=day, start=time(12, 0), email=f"same-b-{duration}@test.com")
    assert error.value.status_code == 409


@pytest.mark.parametrize("duration", SAMPLE_DURATIONS)
@pytest.mark.asyncio
async def test_other_barber_can_take_same_wall_clock(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    second_barber = Barber(name="Otro", description="", specialties="", active=True)
    db_session.add(second_barber)
    await db_session.flush()
    db_session.add(
        BusinessHours(
            barber_id=second_barber.id,
            day_of_week=day.weekday(),
            start_time=time(9),
            end_time=time(18),
            active=True,
        )
    )
    await db_session.commit()
    first = await _book(db_session, day=day, start=time(9, 0), barber_id=1, email=f"b1-{duration}@test.com")
    second = await _book(
        db_session,
        day=day,
        start=time(9, 0),
        barber_id=second_barber.id,
        email=f"b2-{duration}@test.com",
    )
    assert first.barber_id != second.barber_id
    assert_no_overlaps([first, second])


@pytest.mark.parametrize("duration", SAMPLE_DURATIONS)
@pytest.mark.asyncio
async def test_cancelled_appointment_releases_overlapping_slots(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    appointment = await _book(db_session, day=day, start=time(9, 0), email=f"cancel-{duration}@test.com")
    await booking_service.cancel_appointment_by_id(db_session, appointment.id)
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert "09:00" in slots
    assert "09:30" in slots


@pytest.mark.parametrize("duration", SAMPLE_DURATIONS)
@pytest.mark.asyncio
async def test_does_not_cross_lunch_break(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    await db_session.execute(delete(BusinessHours).where(BusinessHours.barber_id == 1))
    db_session.add_all(
        [
            BusinessHours(barber_id=1, day_of_week=day.weekday(), start_time=time(9), end_time=time(14), active=True),
            BusinessHours(barber_id=1, day_of_week=day.weekday(), start_time=time(16), end_time=time(20), active=True),
        ]
    )
    await db_session.commit()
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    lunch_start = _at(day, time(14, 0))
    lunch_end = _at(day, time(16, 0))
    for slot in slots:
        start = _hhmm(slot)
        end = _end(day, start, duration)
        assert not _overlaps(_at(day, start), end, lunch_start, lunch_end)
        assert end.time() <= time(14, 0) or start >= time(16, 0)
    last_morning = max(
        (slot for slot in slots if _hhmm(slot) < time(14, 0)),
        default=None,
    )
    if last_morning:
        assert _end(day, _hhmm(last_morning), duration) <= lunch_start


@pytest.mark.parametrize("base", SAMPLE_DURATIONS)
@pytest.mark.parametrize("extra", SAMPLE_DURATIONS)
@pytest.mark.asyncio
async def test_complements_block_slots_for_combined_duration(
    db_session: AsyncSession,
    base: int,
    extra: int,
) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, base)
    complement = Service(
        name=f"Extra-{extra}",
        description="",
        price=Decimal("8.00"),
        duration_minutes=extra,
        active=True,
        is_independent=False,
        is_complement=True,
    )
    db_session.add(complement)
    await db_session.commit()
    await db_session.refresh(complement)
    total = base + extra
    await _book(
        db_session,
        day=day,
        start=time(9, 0),
        complement_ids=[complement.id],
        email=f"combo-{base}-{extra}@test.com",
    )
    rows = await _day_appointments(db_session, day)
    assert rows[0].end_time == _end(day, time(9, 0), total).time()
    slots = await booking_service.get_availability_slots(
        db_session,
        service_id=1,
        day=day,
        barber_id=1,
        complement_ids=[complement.id],
    )
    occupied_end = _end(day, time(9, 0), total)
    for slot in slots:
        start = _hhmm(slot)
        end = _end(day, start, total)
        assert not _overlaps(_at(day, time(9, 0)), occupied_end, _at(day, start), end)


@pytest.mark.parametrize("duration", [31, 32, 33, 34, 35])
@pytest.mark.asyncio
async def test_long_service_blocks_mid_gap_until_exact_end(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    await _book(db_session, day=day, start=time(9, 0), email=f"grid-{duration}@test.com")
    with pytest.raises(HTTPException) as error:
        await _book(db_session, day=day, start=time(9, 30), email=f"grid2-{duration}@test.com")
    assert error.value.status_code == 409
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert "09:30" not in slots
    next_start = _end(day, time(9, 0), duration).strftime("%H:%M")
    assert next_start in slots


@pytest.mark.parametrize("duration", [5, 10, 15, 20, 25, 30])
@pytest.mark.asyncio
async def test_short_service_allows_start_after_busy_block(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    await _book(db_session, day=day, start=time(9, 0), email=f"okgrid-{duration}@test.com")
    next_start = _end(day, time(9, 0), duration).time()
    second = await _book(db_session, day=day, start=next_start, email=f"okgrid2-{duration}@test.com")
    assert second.start_time == next_start
    assert_no_overlaps(await _day_appointments(db_session, day))


@pytest.mark.parametrize("duration", DURATIONS)
@pytest.mark.asyncio
async def test_last_slot_never_runs_past_closing(db_session: AsyncSession, duration: int) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, duration)
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    last = _hhmm(slots[-1])
    assert _end(day, last, duration) <= _at(day, time(18, 0))
    forbidden = (datetime.combine(day, last) + timedelta(minutes=booking_service.SLOT_STEP_MINUTES)).time()
    if forbidden < time(18, 0):
        assert forbidden.strftime("%H:%M") not in slots or _end(day, forbidden, duration) <= _at(day, time(18, 0))


@pytest.mark.asyncio
async def test_booking_inside_existing_block_is_rejected(db_session: AsyncSession) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, 35)
    await _book(db_session, day=day, start=time(10, 0), email="outer@test.com")
    inside = await _second_independent(db_session, 5, name="Mini")
    with pytest.raises(HTTPException) as error:
        await _book(db_session, day=day, start=time(10, 0), service_id=inside.id, email="inside@test.com")
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_later_short_service_cannot_start_during_long_service(db_session: AsyncSession) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, 35)
    await _book(db_session, day=day, start=time(15, 0), email="long@test.com")
    short = await _second_independent(db_session, 5, name="Rapido")
    slots = await booking_service.get_availability_slots(db_session, service_id=short.id, day=day, barber_id=1)
    assert "15:00" not in slots
    assert "15:30" not in slots
    assert "15:35" in slots
    assert "15:45" in slots
    assert "16:00" not in slots
    assert "16:05" in slots


@pytest.mark.asyncio
async def test_earlier_long_service_cannot_cover_existing_short(db_session: AsyncSession) -> None:
    day = _open_day()
    short = await _second_independent(db_session, 5, name="Corto")
    await _set_duration(db_session, 1, 35)
    await _book(db_session, day=day, start=time(10, 30), service_id=short.id, email="short@test.com")
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert "10:00" not in slots
    assert "10:30" not in slots
    assert "10:35" in slots
    assert "10:45" in slots
    assert "11:00" not in slots
    assert "11:05" in slots


@pytest.mark.asyncio
async def test_three_mixed_durations_pack_without_overlap(db_session: AsyncSession) -> None:
    day = _open_day()
    five = await _second_independent(db_session, 5, name="5min")
    thirty_five = await _second_independent(db_session, 35, name="35min")
    await _set_duration(db_session, 1, 20)
    await _book(db_session, day=day, start=time(9, 0), service_id=five.id, email="mix-a@test.com")
    await _book(db_session, day=day, start=time(9, 30), service_id=1, email="mix-b@test.com")
    await _book(db_session, day=day, start=time(10, 0), service_id=thirty_five.id, email="mix-c@test.com")
    rows = await _day_appointments(db_session, day)
    assert_no_overlaps(rows)
    assert [row.start_time for row in sorted(rows, key=lambda item: item.start_time)] == [
        time(9, 0),
        time(9, 30),
        time(10, 0),
    ]


@pytest.mark.asyncio
async def test_inactive_hours_do_not_offer_slots(db_session: AsyncSession) -> None:
    day = _open_day()
    hours = list(
        (
            await db_session.scalars(select(BusinessHours).where(BusinessHours.barber_id == 1))
        ).all()
    )
    for row in hours:
        if row.day_of_week == day.weekday():
            row.active = False
    await db_session.commit()
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert slots == []


@pytest.mark.asyncio
async def test_sequential_35_then_next_half_hour_conflict_is_stable(db_session: AsyncSession) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, 35)
    await _book(db_session, day=day, start=time(9, 0), email="seq-a@test.com")
    for _ in range(5):
        with pytest.raises(HTTPException) as error:
            await _book(db_session, day=day, start=time(9, 30), email="seq-b@test.com")
        assert error.value.status_code == 409
    rows = await _day_appointments(db_session, day)
    assert len([row for row in rows if row.status != AppointmentStatus.cancelled.value]) == 1
    assert_no_overlaps(rows)


@pytest.mark.asyncio
async def test_dynamic_gap_offers_start_exactly_after_25_minute_booking(db_session: AsyncSession) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, 25)
    await _book(db_session, day=day, start=time(9, 0), email="gap25@test.com")
    thirty = await _second_independent(db_session, 30, name="Treinta")
    slots = await booking_service.get_availability_slots(db_session, service_id=thirty.id, day=day, barber_id=1)
    assert "09:25" in slots
    assert "09:20" not in slots
    booked = await _book(db_session, day=day, start=time(9, 25), service_id=thirty.id, email="gap25b@test.com")
    assert booked.end_time == time(9, 55)
    assert_no_overlaps(await _day_appointments(db_session, day))


@pytest.mark.asyncio
async def test_dynamic_gap_after_hour_block_starts_at_end(db_session: AsyncSession) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, 60)
    await _book(db_session, day=day, start=time(9, 0), email="hour@test.com")
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert "09:30" not in slots
    assert "09:50" not in slots
    assert "10:00" in slots
    assert "10:10" in slots


@pytest.mark.asyncio
async def test_dynamic_lunch_gap_not_crossed_by_candidates(db_session: AsyncSession) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, 30)
    await db_session.execute(delete(BusinessHours).where(BusinessHours.barber_id == 1))
    db_session.add_all(
        [
            BusinessHours(barber_id=1, day_of_week=day.weekday(), start_time=time(9), end_time=time(14), active=True),
            BusinessHours(barber_id=1, day_of_week=day.weekday(), start_time=time(16), end_time=time(20), active=True),
        ]
    )
    await db_session.commit()
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    assert "13:30" in slots
    assert "13:40" not in slots
    assert "14:00" not in slots
    assert "15:50" not in slots
    assert "16:00" in slots


@pytest.mark.asyncio
async def test_complement_duration_shrinks_usable_end_of_gap(db_session: AsyncSession) -> None:
    day = _open_day()
    await _set_duration(db_session, 1, 30)
    extra = Service(
        name="Extra30",
        description="",
        price=Decimal("10.00"),
        duration_minutes=30,
        active=True,
        is_independent=False,
        is_complement=True,
    )
    db_session.add(extra)
    await db_session.commit()
    await db_session.refresh(extra)
    alone = await booking_service.get_availability_slots(db_session, service_id=1, day=day, barber_id=1)
    with_extra = await booking_service.get_availability_slots(
        db_session,
        service_id=1,
        day=day,
        barber_id=1,
        complement_ids=[extra.id],
    )
    assert "17:30" in alone
    assert "17:00" in with_extra
    assert "17:10" not in with_extra
    assert alone[-1] > with_extra[-1]
