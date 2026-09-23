import asyncio
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import delete, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models.models import Appointment, Barber, Base, BusinessHours, DayOff, Service
from app.services import booking as booking_service

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_availability_returns_slots(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow)
    assert len(slots) > 0


@pytest.mark.asyncio
@patch("app.services.booking._current_shop_datetime")
async def test_availability_excludes_past_and_imminent_slots_today(
    mock_now: patch,
    db_session: AsyncSession,
) -> None:
    mock_now.return_value = datetime(2026, 9, 23, 16, 50, tzinfo=ZoneInfo("Europe/Madrid"))
    today = date(2026, 9, 23)
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=today)

    assert "09:00" not in slots
    assert "16:20" not in slots
    assert "17:00" not in slots


@pytest.mark.asyncio
@patch("app.services.booking._current_shop_datetime")
async def test_availability_includes_slot_after_advance_window(
    mock_now: patch,
    db_session: AsyncSession,
) -> None:
    mock_now.return_value = datetime(2026, 9, 23, 16, 30, tzinfo=ZoneInfo("Europe/Madrid"))
    today = date(2026, 9, 23)
    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=today)

    assert "17:00" in slots


@pytest.mark.asyncio
@patch("app.services.booking._current_shop_datetime")
async def test_create_appointment_rejects_within_advance_window(
    mock_now: patch,
    db_session: AsyncSession,
) -> None:
    mock_now.return_value = datetime(2026, 9, 23, 16, 50, tzinfo=ZoneInfo("Europe/Madrid"))

    with pytest.raises(HTTPException) as error:
        await booking_service.create_appointment(
            db_session,
            service_id=1,
            barber_id=1,
            day=date(2026, 9, 23),
            start_time=time(17, 0),
            customer_name="Juan",
            customer_surname="Pérez",
            customer_phone="600123456",
            customer_email="juan@example.com",
        )

    assert error.value.status_code == 400
    assert "10 minutes" in error.value.detail


def _next_weekday(offset_days: int = 1) -> date:
    day = date.today() + timedelta(days=offset_days)
    while day.weekday() > 5:
        day += timedelta(days=1)
    return day


@pytest.mark.asyncio
async def test_invalid_barber_id_returns_404(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()

    with pytest.raises(HTTPException) as error:
        await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow, barber_id=999)

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_inactive_barber_returns_404(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()
    barber = await db_session.get(Barber, 1)
    assert barber is not None
    barber.active = False
    await db_session.commit()

    with pytest.raises(HTTPException) as error:
        await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow, barber_id=1)

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_invalid_barber_id_api_returns_404(client: AsyncClient) -> None:
    tomorrow = _next_weekday()
    response = await client.get(f"/api/availability?service_id=1&date={tomorrow.isoformat()}&barber_id=999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_availability_has_no_duplicate_slots_with_overlapping_hours(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()
    weekday = tomorrow.weekday()

    await db_session.execute(delete(BusinessHours))
    db_session.add_all(
        [
            BusinessHours(day_of_week=weekday, start_time=time(9, 0), end_time=time(14, 0), active=True),
            BusinessHours(day_of_week=weekday, start_time=time(9, 0), end_time=time(14, 0), active=True),
            BusinessHours(day_of_week=weekday, start_time=time(10, 0), end_time=time(13, 0), active=True),
        ]
    )
    await db_session.commit()

    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow)
    assert slots == sorted(slots)
    assert len(slots) == len(set(slots))
    assert len(slots) > 0


@pytest.mark.asyncio
async def test_availability_uses_bounded_query_count(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()
    db_session.add(
        Barber(name="Second Barber", description="", specialties="", active=True)
    )
    await db_session.commit()

    bind = db_session.get_bind()
    engine = bind.sync_engine if hasattr(bind, "sync_engine") else bind
    query_count = 0

    def count_queries(_conn, _cursor, _statement, _parameters, _context, _executemany) -> None:
        nonlocal query_count
        query_count += 1

    event.listen(engine, "before_cursor_execute", count_queries)
    try:
        slots = await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow)
    finally:
        event.remove(engine, "before_cursor_execute", count_queries)

    assert len(slots) > 0
    assert query_count <= 5


@pytest.mark.asyncio
async def test_availability_respects_40_minute_service_duration(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()
    service = await db_session.get(Service, 1)
    assert service is not None
    service.duration_minutes = 40
    await db_session.commit()

    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow)
    assert "09:00" in slots
    assert "09:40" in slots
    assert "17:40" not in slots


@pytest.mark.asyncio
async def test_availability_respects_60_minute_service_duration(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()
    service = await db_session.get(Service, 1)
    assert service is not None
    service.duration_minutes = 60
    await db_session.commit()

    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow)
    assert "09:00" in slots
    assert "09:40" in slots
    assert "17:40" not in slots
    assert "17:00" in slots


@pytest.mark.asyncio
async def test_day_off_blocks_availability(db_session: AsyncSession) -> None:
    tomorrow = _next_weekday()

    db_session.add(DayOff(barber_id=1, start_date=tomorrow, end_date=tomorrow, reason="Vacaciones"))
    await db_session.commit()

    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow, barber_id=1)
    assert slots == []


@pytest.mark.asyncio
async def test_create_and_cancel_appointment(db_session: AsyncSession) -> None:
    tomorrow = date.today() + timedelta(days=2)
    while tomorrow.weekday() > 5:
        tomorrow += timedelta(days=1)

    appointment, service, barber = await booking_service.create_appointment(
        db_session,
        service_id=1,
        barber_id=1,
        day=tomorrow,
        start_time=time(10, 0),
        customer_name="Juan",
        customer_surname="Pérez",
        customer_phone="600123456",
        customer_email="juan@example.com",
    )
    assert appointment.cancel_token
    assert appointment.barber_id == barber.id

    cancelled, _, _ = await booking_service.cancel_appointment_by_token(db_session, appointment.cancel_token)
    assert cancelled.status == "cancelled"


async def _seed_booking_db(session: AsyncSession) -> None:
    barber = Barber(name="Test Barber", description="", specialties="", active=True)
    session.add(barber)
    await session.flush()
    session.add(Service(name="Corte", description="", price=Decimal("20.00"), duration_minutes=30, active=True))
    for day in range(6):
        session.add(BusinessHours(day_of_week=day, start_time=time(9), end_time=time(18), active=True))
    await session.commit()


@pytest.mark.asyncio
async def test_concurrent_double_booking_rejected() -> None:
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        await _seed_booking_db(session)

    tomorrow = date.today() + timedelta(days=3)
    while tomorrow.weekday() > 5:
        tomorrow += timedelta(days=1)

    async def attempt_booking(customer_email: str) -> object:
        async with session_factory() as session:
            try:
                appointment, _, _ = await booking_service.create_appointment(
                    session,
                    service_id=1,
                    barber_id=1,
                    day=tomorrow,
                    start_time=time(10, 0),
                    customer_name="Juan",
                    customer_surname="Pérez",
                    customer_phone="600123456",
                    customer_email=customer_email,
                )
                return appointment
            except HTTPException as error:
                return error

    results = await asyncio.gather(attempt_booking("a@example.com"), attempt_booking("b@example.com"))
    successes = [result for result in results if not isinstance(result, HTTPException)]
    conflicts = [result for result in results if isinstance(result, HTTPException) and result.status_code == 409]

    assert len(successes) == 1
    assert len(conflicts) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_login_and_barber_access(client: AsyncClient) -> None:
    response = await client.post("/api/auth/login", json={"email": "barber@test.com", "password": "password123"})
    assert response.status_code == 200
    assert response.json()["role"] == "barber"

    appointments = await client.get("/api/appointments/mine")
    assert appointments.status_code == 200
