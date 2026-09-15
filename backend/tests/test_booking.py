from datetime import date, time, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import DayOff
from app.services import booking as booking_service


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_availability_returns_slots(db_session: AsyncSession) -> None:
    tomorrow = date.today() + timedelta(days=1)
    while tomorrow.weekday() > 5:
        tomorrow += timedelta(days=1)

    slots = await booking_service.get_availability_slots(db_session, service_id=1, day=tomorrow)
    assert len(slots) > 0


@pytest.mark.asyncio
async def test_day_off_blocks_availability(db_session: AsyncSession) -> None:
    tomorrow = date.today() + timedelta(days=1)
    while tomorrow.weekday() > 5:
        tomorrow += timedelta(days=1)

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


@pytest.mark.asyncio
async def test_login_and_barber_access(client: AsyncClient) -> None:
    response = await client.post("/api/auth/login", json={"email": "barber@test.com", "password": "password123"})
    assert response.status_code == 200
    assert response.json()["role"] == "barber"

    appointments = await client.get("/api/appointments/mine")
    assert appointments.status_code == 200
